import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES } from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";

serve(withSentry("dashboard-stats", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  try {
    const [projectsRes, modulesRes, keysRes, bugsRes, recentRes] = await Promise.all([
      client.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      client.from("vault_modules").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      client.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      client.from("bugs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open"),
      client.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(5),
    ]);

    return createSuccessResponse(req, {
      stats: {
        projects: projectsRes.count ?? 0,
        modules: modulesRes.count ?? 0,
        keys: keysRes.count ?? 0,
        openBugs: bugsRes.count ?? 0,
      },
      recentProjects: recentRes.data ?? [],
    });
  } catch (err) {
    throw err;
  }
}));
