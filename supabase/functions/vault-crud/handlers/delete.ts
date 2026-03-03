/**
 * vault-crud/handlers/delete.ts — Handles the "delete" action.
 *
 * Deletes a vault module owned by the authenticated user.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../../_shared/api-helpers.ts";

export async function handleDelete(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { id } = body;
  if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);

  const { error } = await client
    .from("vault_modules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
  return createSuccessResponse(req, { success: true });
}
