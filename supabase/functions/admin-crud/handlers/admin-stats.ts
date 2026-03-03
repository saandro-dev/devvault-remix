import { createSuccessResponse } from "../../_shared/api-helpers.ts";
import { requireRole } from "../../_shared/role-validator.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleAdminStats(
  req: Request,
  client: SupabaseClient,
  user: User,
): Promise<Response> {
  await requireRole(client, user.id, "admin");

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesRes,
    modulesRes,
    globalModulesRes,
    activeKeysRes,
    auditLogsRes,
    openBugsRes,
    projectsRes,
    sharesRes,
  ] = await Promise.all([
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("vault_modules").select("id", { count: "exact", head: true }),
    client.from("vault_modules").select("id", { count: "exact", head: true }).eq("visibility", "global"),
    client.from("devvault_api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
    client.from("devvault_api_audit_log").select("id", { count: "exact", head: true }).gte("created_at", twentyFourHoursAgo),
    client.from("bugs").select("id", { count: "exact", head: true }).eq("status", "open"),
    client.from("projects").select("id", { count: "exact", head: true }),
    client.from("vault_module_shares").select("module_id", { count: "exact", head: true }),
  ]);

  return createSuccessResponse(req, {
    stats: {
      totalUsers: profilesRes.count ?? 0,
      totalModules: modulesRes.count ?? 0,
      globalModules: globalModulesRes.count ?? 0,
      activeApiKeys: activeKeysRes.count ?? 0,
      auditLogs24h: auditLogsRes.count ?? 0,
      openBugs: openBugsRes.count ?? 0,
      totalProjects: projectsRes.count ?? 0,
      activeShares: sharesRes.count ?? 0,
    },
  });
}
