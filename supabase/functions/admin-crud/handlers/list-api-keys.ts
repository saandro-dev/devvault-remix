import { createSuccessResponse } from "../../_shared/api-helpers.ts";
import { requireRole } from "../../_shared/role-validator.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleListApiKeys(
  req: Request,
  client: SupabaseClient,
  user: User,
): Promise<Response> {
  await requireRole(client, user.id, "admin");

  const { data: keys, error: keysError } = await client
    .from("devvault_api_keys")
    .select("id, user_id, key_name, key_prefix, created_at, last_used_at, revoked_at, expires_at")
    .order("created_at", { ascending: false });

  if (keysError) throw keysError;

  const userIds = [...new Set((keys ?? []).map((k) => k.user_id))];

  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, p.display_name);
  }

  const apiKeys = (keys ?? []).map((k) => ({
    id: k.id,
    userId: k.user_id,
    ownerName: profileMap.get(k.user_id) ?? "Unknown",
    keyName: k.key_name,
    keyPrefix: k.key_prefix,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
    revokedAt: k.revoked_at,
    expiresAt: k.expires_at,
  }));

  return createSuccessResponse(req, { apiKeys });
}
