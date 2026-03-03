/**
 * vault-crud/handlers/create.ts — Handles the "create" action.
 *
 * Inserts a new vault module owned by the authenticated user.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../../_shared/api-helpers.ts";
import { createLogger } from "../../_shared/logger.ts";

const log = createLogger("vault-crud:create");

export async function handleCreate(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const {
    title, description, domain, module_type, language, code,
    context_markdown, dependencies, tags, saas_phase, phase_title,
    why_it_matters, usage_hint, code_example, source_project,
    validation_status, related_modules, visibility, ai_metadata,
  } = body;

  if (!title) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing title", 422);

  const { data, error } = await client
    .from("vault_modules")
    .insert({
      user_id: user.id,
      title,
      description: description || null,
      domain: domain || "backend",
      module_type: module_type || "code_snippet",
      language: language || "typescript",
      code: code || "",
      context_markdown: context_markdown || null,
      dependencies: dependencies || null,
      tags: tags || [],
      saas_phase: saas_phase || null,
      phase_title: phase_title || null,
      why_it_matters: why_it_matters || null,
      usage_hint: usage_hint || null,
      code_example: code_example || null,
      source_project: source_project || null,
      validation_status: validation_status || "draft",
      related_modules: related_modules || [],
      visibility: visibility || "private",
      ai_metadata: ai_metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  log.info(`created module=${data.id} domain=${data.domain}`);
  return createSuccessResponse(req, data, 201);
}
