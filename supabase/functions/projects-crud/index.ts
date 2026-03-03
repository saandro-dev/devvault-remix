import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES, getClientIp } from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";
import { sanitizeFields } from "../_shared/input-sanitizer.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("projects-crud");
const TEXT_FIELDS = ["name", "description"];

serve(withSentry("projects-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  const rateCheck = await checkRateLimit(getClientIp(req), "projects-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  try {
    const rawBody = await req.json();
    const body = sanitizeFields(rawBody, TEXT_FIELDS);
    const { action } = body;
    log.info(`action=${action}`, { userId: user.id });

    switch (action) {
      case "list": {
        const { data, error } = await client
          .from("projects")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return createSuccessResponse(req, { items: data });
      }

      case "get": {
        const { id } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const { data, error } = await client
          .from("projects")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data);
      }

      case "create": {
        const { name, description, color } = body;
        if (!name) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing name", 422);
        const { data, error } = await client
          .from("projects")
          .insert({
            user_id: user.id,
            name,
            description: description || null,
            color: color || "#3B82F6",
          })
          .select()
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data, 201);
      }

      case "update": {
        const { id, name, description, color } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const updateFields: Record<string, unknown> = {};
        if (name !== undefined) updateFields.name = name;
        if (description !== undefined) updateFields.description = description || null;
        if (color !== undefined) updateFields.color = color;

        const { data, error } = await client
          .from("projects")
          .update(updateFields)
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data);
      }

      case "delete": {
        const { id } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const { error } = await client
          .from("projects")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return createSuccessResponse(req, { success: true });
      }

      default:
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, `Unknown action: ${action}`, 422);
    }
  } catch (err) {
    throw err;
  }
}));
