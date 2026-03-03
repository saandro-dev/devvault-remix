/**
 * vault-crud/handlers/update.ts — Handles the "update" action.
 *
 * Partially updates a vault module owned by the authenticated user.
 * Only whitelisted fields are accepted.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../../_shared/api-helpers.ts";

const ALLOWED_FIELDS = [
  "title", "description", "domain", "module_type", "language",
  "code", "context_markdown", "dependencies", "tags", "saas_phase",
  "phase_title", "why_it_matters", "usage_hint", "code_example",
  "source_project", "validation_status", "related_modules", "visibility",
  "ai_metadata",
];

export async function handleUpdate(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { id, ...fields } = body;
  if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);

  const updateFields: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (fields[key] !== undefined) updateFields[key] = fields[key];
  }

  if (Object.keys(updateFields).length === 0) {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "No fields to update", 422);
  }

  const { data, error } = await client
    .from("vault_modules")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return createSuccessResponse(req, data);
}
