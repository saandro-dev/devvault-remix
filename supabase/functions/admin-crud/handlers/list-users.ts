import { createSuccessResponse } from "../../_shared/api-helpers.ts";
import { requireRole } from "../../_shared/role-validator.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleListUsers(
  req: Request,
  client: SupabaseClient,
  user: User,
): Promise<Response> {
  await requireRole(client, user.id, "admin");

  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id, display_name, avatar_url, bio, created_at")
    .order("created_at", { ascending: true });

  if (profilesError) throw profilesError;

  const { data: roles, error: rolesError } = await client
    .from("user_roles")
    .select("user_id, role");

  if (rolesError) throw rolesError;

  const roleMap = new Map<string, string>();
  for (const r of roles ?? []) {
    const existing = roleMap.get(r.user_id);
    if (!existing) {
      roleMap.set(r.user_id, r.role);
    }
  }

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    role: roleMap.get(p.id) ?? "user",
    createdAt: p.created_at,
  }));

  return createSuccessResponse(req, { users });
}
