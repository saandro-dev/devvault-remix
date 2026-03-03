/**
 * vault-crud/handlers/get.ts — Handles the "get" action.
 *
 * Fetches a single module by ID with ownership/visibility/share checks,
 * enriched with dependency data.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../../_shared/api-helpers.ts";
import { enrichModuleDependencies } from "../../_shared/dependency-helpers.ts";

export async function handleGet(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { id } = body;
  if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);

  const { data, error } = await client
    .from("vault_modules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Module not found", 404);

  const isOwner = data.user_id === user.id;
  const isGlobal = data.visibility === "global";
  if (!isOwner && !isGlobal) {
    const { data: share } = await client
      .from("vault_module_shares")
      .select("module_id")
      .eq("module_id", id)
      .eq("shared_with_user_id", user.id)
      .maybeSingle();
    if (!share) {
      return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Module not found", 404);
    }
  }

  const module_dependencies = await enrichModuleDependencies(client, id as string);
  return createSuccessResponse(req, { ...data, module_dependencies });
}
