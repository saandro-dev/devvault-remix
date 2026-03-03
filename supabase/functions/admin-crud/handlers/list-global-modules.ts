import { createSuccessResponse } from "../../_shared/api-helpers.ts";
import { requireRole } from "../../_shared/role-validator.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleListGlobalModules(
  req: Request,
  client: SupabaseClient,
  user: User,
): Promise<Response> {
  await requireRole(client, user.id, "admin");

  const { data: modules, error: modulesError } = await client
    .from("vault_modules")
    .select("id, title, description, domain, language, tags, created_at, user_id")
    .eq("visibility", "global")
    .order("created_at", { ascending: false });

  if (modulesError) throw modulesError;

  const userIds = [...new Set((modules ?? []).map((m) => m.user_id))];

  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, p.display_name);
  }

  const globalModules = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    domain: m.domain,
    language: m.language,
    tags: m.tags,
    authorName: profileMap.get(m.user_id) ?? "Unknown",
    createdAt: m.created_at,
  }));

  return createSuccessResponse(req, { globalModules });
}
