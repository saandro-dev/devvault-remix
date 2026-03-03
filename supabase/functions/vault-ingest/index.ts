/**
 * vault-ingest — Write endpoint for the DevVault Knowledge OS.
 *
 * Allows AI agents to create, update, and delete modules
 * without requiring JWT, GitHub, or direct Supabase access.
 *
 * Authentication: DevVault API Key (header X-DevVault-Key or x-api-key)
 *
 * Actions:
 *   POST {"action": "ingest", "modules": [...]}   — create modules (batch up to 50)
 *   POST {"action": "ingest", "title": "..."}     — create single module
 *   POST {"action": "update", "id": "uuid", ...}  — update existing module
 *   POST {"action": "delete", "id": "uuid"}       — delete module
 */

import { withSentry } from "../_shared/sentry.ts";
import { handleCorsV2 } from "../_shared/cors-v2.ts";
import { checkRateLimit, type RateLimitConfig } from "../_shared/rate-limit-guard.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../_shared/api-helpers.ts";
import { validateApiKey } from "../_shared/api-key-guard.ts";
import { createLogger } from "../_shared/logger.ts";
import { sanitizeFields } from "../_shared/input-sanitizer.ts";

const logger = createLogger("vault-ingest");

const INGEST_TEXT_FIELDS = [
  "title", "description", "code", "context_markdown", "why_it_matters",
  "code_example", "usage_hint", "phase_title", "source_project",
  "database_schema", "test_code", "module_group",
];

Deno.serve(withSentry("vault-ingest", async (req: Request) => {
  // 1. CORS
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST is accepted.", 405);
  }

  // 2. Rate Limiting
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitConfig: RateLimitConfig = { maxAttempts: 60, windowSeconds: 60, blockSeconds: 300 };
  const rateLimit = await checkRateLimit(clientIp, "vault-ingest", rateLimitConfig);
  if (rateLimit.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, "Rate limit exceeded.", 429);
  }

  // 3. API Key Authentication
  const apiKeyHeader =
    req.headers.get("X-DevVault-Key") ??
    req.headers.get("x-devvault-key") ??
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKeyHeader) {
    return createErrorResponse(
      req,
      ERROR_CODES.UNAUTHORIZED,
      "API Key required. Send the X-DevVault-Key header with your dvlt_... key.",
      401
    );
  }

  const supabase = getSupabaseClient("general");
  const keyValidation = await validateApiKey(supabase, apiKeyHeader);
  if (!keyValidation.valid) {
    logger.warn("Invalid API key", { ip: clientIp, prefix: apiKeyHeader.substring(0, 8) });
    return createErrorResponse(req, ERROR_CODES.UNAUTHORIZED, "Invalid or revoked API Key.", 401);
  }

  const userId = keyValidation.userId;

  // 4. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Invalid JSON body.", 400);
  }

  // Detect action — backward compatibility: defaults to ingest if missing
  const action = (body.action as string) ?? "ingest";

  logger.info("vault-ingest request", { action, ip: clientIp, userId });

  /**
   * Resolves visibility from payload.
   * Backward compatible: if is_public is sent, maps to 'global'.
   */
  function resolveVisibility(m: Record<string, unknown>): string {
    if (m.visibility) return m.visibility as string;
    if (m.is_public === true) return "global";
    return "private";
  }

  // 5. Route by action
  switch (action) {

    // -- INGEST: create modules (individual or batch) --
    case "ingest": {
      let rawModules: unknown[];
      if (Array.isArray(body.modules)) {
        rawModules = body.modules;
      } else if (Array.isArray(body)) {
        rawModules = body as unknown[];
      } else if (body.title) {
        rawModules = [body];
      } else {
        return createErrorResponse(
          req,
          ERROR_CODES.VALIDATION_ERROR,
          "Provide 'modules' (array) or module fields directly.",
          422
        );
      }

      if (rawModules.length === 0) {
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Empty payload.", 422);
      }
      if (rawModules.length > 50) {
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Maximum 50 modules per request.", 422);
      }

      const toInsert = rawModules.map((mod: unknown) => {
        const raw = mod as Record<string, unknown>;
        const m = sanitizeFields(raw, INGEST_TEXT_FIELDS);
        if (!m.title) throw new Error("Module missing required field: title");
        return {
          user_id:              userId,
          title:                m.title,
          description:          m.description ?? null,
          domain:               m.domain ?? m.category ?? "backend",
          module_type:          m.module_type ?? "code_snippet",
          language:             m.language ?? "typescript",
          code:                 m.code ?? "",
          context_markdown:     m.context_markdown ?? null,
          dependencies:         m.dependencies ?? null,
          tags:                 m.tags ?? [],
          saas_phase:           m.saas_phase ?? null,
          phase_title:          m.phase_title ?? null,
          why_it_matters:       m.why_it_matters ?? null,
          code_example:         m.code_example ?? null,
          source_project:       m.source_project ?? null,
          validation_status:    m.validation_status ?? "draft",
          related_modules:      m.related_modules ?? [],
          visibility:           resolveVisibility(m),
          slug:                 m.slug ?? null,
          common_errors:        m.common_errors ?? [],
          solves_problems:      m.solves_problems ?? [],
          test_code:            m.test_code ?? null,
          difficulty:           m.difficulty ?? null,
          estimated_minutes:    m.estimated_minutes ?? null,
          database_schema:      m.database_schema ?? null,
          prerequisites:        m.prerequisites ?? [],
          ai_metadata:          m.ai_metadata ?? {},
          usage_hint:           m.usage_hint ?? null,
          module_group:         m.module_group ?? null,
          implementation_order: m.implementation_order ?? null,
          version:              m.version ?? null,
        };
      });

      const { data, error } = await supabase
        .from("vault_modules")
        .insert(toInsert)
        .select("id, slug, title, domain, module_type, validation_status, visibility");

      if (error) {
        logger.error("Failed to insert modules", { error: error.message });
        throw error;
      }

      logger.info("Ingestion completed", { count: data.length, userId });
      return createSuccessResponse(req, { ingested: data.length, modules: data }, 201);
    }

    // -- UPDATE: update existing module --
    case "update": {
      const id = body.id as string;
      if (!id) {
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Field 'id' is required for update.", 400);
      }

      // Verify the module belongs to the user
      const { data: existing, error: fetchError } = await supabase
        .from("vault_modules")
        .select("id, user_id")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Module not found.", 404);
      }

      if (existing.user_id !== userId) {
        return createErrorResponse(req, ERROR_CODES.FORBIDDEN, "No permission to edit this module.", 403);
      }

      // Allowed fields for update
      const allowedFields = [
        "title", "description", "domain", "module_type", "language",
        "code", "context_markdown", "dependencies", "tags",
        "saas_phase", "phase_title", "why_it_matters", "code_example",
        "source_project", "validation_status", "related_modules",
        "visibility", "slug",
        "common_errors", "solves_problems", "test_code",
        "difficulty", "estimated_minutes", "database_schema",
        "prerequisites", "ai_metadata", "usage_hint",
        "module_group", "implementation_order", "version",
      ];

      const updates: Record<string, unknown> = {};
      const sanitizedBody = sanitizeFields(body as Record<string, unknown>, INGEST_TEXT_FIELDS);
      for (const field of allowedFields) {
        if (field in sanitizedBody) {
          updates[field] = sanitizedBody[field];
        }
      }

      // Backward compatibility: is_public → visibility
      if ("is_public" in body && !("visibility" in body)) {
        updates["visibility"] = body["is_public"] === true ? "global" : "private";
      }

      if (Object.keys(updates).length === 0) {
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "No fields to update.", 400);
      }

      const { data, error } = await supabase
        .from("vault_modules")
        .update(updates)
        .eq("id", id)
        .select("id, slug, title, domain, module_type, validation_status, visibility, updated_at")
        .single();

      if (error) {
        logger.error("Failed to update module", { error: error.message, id });
        throw error;
      }

      logger.info("Module updated", { id, userId, fields: Object.keys(updates) });
      return createSuccessResponse(req, { updated: true, module: data });
    }

    // -- DELETE: delete module --
    case "delete": {
      const id = body.id as string;
      if (!id) {
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Field 'id' is required for delete.", 400);
      }

      // Verify the module belongs to the user
      const { data: existing, error: fetchError } = await supabase
        .from("vault_modules")
        .select("id, user_id, title")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Module not found.", 404);
      }

      if (existing.user_id !== userId) {
        return createErrorResponse(req, ERROR_CODES.FORBIDDEN, "No permission to delete this module.", 403);
      }

      const { error } = await supabase
        .from("vault_modules")
        .delete()
        .eq("id", id);

      if (error) {
        logger.error("Failed to delete module", { error: error.message, id });
        throw error;
      }

      logger.info("Module deleted", { id, title: existing.title, userId });
      return createSuccessResponse(req, { deleted: true, id, title: existing.title });
    }

    // -- DEFAULT --
    default:
      return createErrorResponse(
        req,
        ERROR_CODES.VALIDATION_ERROR,
        `Invalid action '${action}'. Accepted values: ingest | update | delete`,
        400
      );
  }
}));
