/**
 * vault-crud/handlers/sharing.ts — Handles "share", "unshare", and "list_shares" actions.
 *
 * Manages module sharing between users via the vault_module_shares table.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../../_shared/api-helpers.ts";
import { createLogger } from "../../_shared/logger.ts";

const log = createLogger("vault-crud:sharing");

export async function handleShare(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { module_id, email } = body as { module_id?: string; email?: string };

  if (!module_id || !email) {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing module_id or email", 422);
  }

  const { data: mod, error: modErr } = await client
    .from("vault_modules")
    .select("id, user_id, visibility")
    .eq("id", module_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (modErr) throw modErr;
  if (!mod) return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Module not found or not owned", 404);

  const { data: targetProfile, error: profileErr } = await client
    .from("profiles")
    .select("id")
    .eq("id", (await client.rpc("get_user_id_by_email", { p_email: email })).data)
    .maybeSingle();
  if (profileErr || !targetProfile) {
    return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "User not found with that email", 404);
  }
  if (targetProfile.id === user.id) {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Cannot share with yourself", 422);
  }

  if (mod.visibility === "private") {
    await client.from("vault_modules").update({ visibility: "shared" }).eq("id", module_id).eq("user_id", user.id);
  }

  const { error: shareErr } = await client
    .from("vault_module_shares")
    .upsert(
      { module_id, shared_with_user_id: targetProfile.id, shared_by_user_id: user.id },
      { onConflict: "module_id,shared_with_user_id" },
    );
  if (shareErr) throw shareErr;

  log.info(`shared module=${module_id} with=${targetProfile.id}`);
  return createSuccessResponse(req, { shared: true });
}

export async function handleUnshare(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { module_id, user_id: target_user_id } = body as { module_id?: string; user_id?: string };

  if (!module_id || !target_user_id) {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing module_id or user_id", 422);
  }

  const { error } = await client
    .from("vault_module_shares")
    .delete()
    .eq("module_id", module_id)
    .eq("shared_by_user_id", user.id)
    .eq("shared_with_user_id", target_user_id);
  if (error) throw error;

  return createSuccessResponse(req, { unshared: true });
}

export async function handleListShares(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { module_id } = body as { module_id?: string };

  if (!module_id) {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing module_id", 422);
  }

  const { data, error } = await client
    .from("vault_module_shares")
    .select("shared_with_user_id, created_at")
    .eq("module_id", module_id)
    .eq("shared_by_user_id", user.id);
  if (error) throw error;

  return createSuccessResponse(req, { shares: data ?? [] });
}
