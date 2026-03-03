/**
 * mcp-tools/get.ts — devvault_get tool.
 *
 * Fetches a single module by ID or slug with full code, dependencies,
 * completeness score, group metadata, changelog, and resolved related_modules.
 */

import { createLogger } from "../logger.ts";
import { enrichModuleDependencies } from "../dependency-helpers.ts";
import { getCompleteness } from "./completeness.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:get");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const registerGetTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_get", {
    description:
      "Fetch a specific module by ID or slug. Returns full code, context, dependencies, " +
      "completeness score, group metadata, prerequisites, common_errors, test_code, " +
      "solves_problems, difficulty, estimated_minutes, changelog, and resolved related_modules. " +
      "CRITICAL: If any dependency has dependency_type='required', you MUST call devvault_get " +
      "for each required dependency BEFORE implementing this module. " +
      "You can pass either a UUID id or a slug string — auto-detected.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module UUID or slug (auto-detected)" },
        slug: { type: "string", description: "Module slug (alternative to id)" },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      if (!params.id && !params.slug) {
        return errorResponse({
          code: "INVALID_INPUT",
          message: "Provide either 'id' (UUID) or 'slug' (string).",
          details: { expected: "id or slug parameter" },
        });
      }

      // Auto-detect: if id is provided but not a valid UUID, treat as slug
      if (params.id && !UUID_RE.test(params.id as string)) {
        params.slug = params.id;
        params.id = undefined;
      }

      const rpcParams: Record<string, unknown> = {};
      if (params.id) rpcParams.p_id = params.id;
      if (params.slug) rpcParams.p_slug = params.slug;

      const { data, error } = await client.rpc("get_vault_module", rpcParams);
      if (error) {
        logger.error("get failed", { error: error.message });
        return errorResponse({
          code: classifyRpcError(error.message),
          message: error.message,
          details: { rpc: "get_vault_module", params: rpcParams },
        });
      }

      if (!data || (data as unknown[]).length === 0) {
        return errorResponse({
          code: "MODULE_NOT_FOUND",
          message: `No module found for ${params.slug ? `slug '${params.slug}'` : `id '${params.id}'`}.`,
          details: { searched_by: params.slug ? "slug" : "id", value: (params.slug ?? params.id) as string },
        });
      }

      const mod = (data as Record<string, unknown>[])[0];
      const moduleId = mod.id as string;

      // Parallel fetches: dependencies, completeness, group meta, changelog, related_modules
      const [dependencies, completeness, moduleRaw, changelogResult, resolvedRelated, usageStats] = await Promise.all([
        enrichModuleDependencies(client, moduleId),
        getCompleteness(client, moduleId),
        client.from("vault_modules").select("module_group, implementation_order").eq("id", moduleId).single(),
        client.from("vault_module_changelog").select("version, changes, created_at").eq("module_id", moduleId).order("created_at", { ascending: false }).limit(10),
        resolveRelatedModules(client, mod.related_modules as string[] | null),
        fetchUsageStats(client, moduleId),
      ]);

      const hasRequired = dependencies.some(
        (d: Record<string, unknown>) => d.dependency_type === "required",
      );

      let groupMeta: Record<string, unknown> | null = null;
      if (moduleRaw.data?.module_group) {
        const { count } = await client
          .from("vault_modules")
          .select("id", { count: "exact", head: true })
          .eq("module_group", moduleRaw.data.module_group);

        groupMeta = {
          name: moduleRaw.data.module_group,
          position: moduleRaw.data.implementation_order,
          total: count ?? 0,
        };
      }

      trackUsage(client, auth, {
        event_type: "get",
        tool_name: "devvault_get",
        module_id: moduleId,
        result_count: 1,
      });

      // ai_metadata already returned by get_vault_module RPC — no extra query needed
      const aiMeta = (mod.ai_metadata as Record<string, unknown>) ?? {};

      // Build environment setup instructions for consuming agent
      const envInstructions: string[] = [];
      const npmDeps = (aiMeta.npm_dependencies as string[]) ?? [];
      const envVars = (aiMeta.env_vars_required as string[]) ?? [];
      if (npmDeps.length > 0) envInstructions.push(`Install NPM dependencies: npm install ${npmDeps.join(" ")}`);
      if (envVars.length > 0) envInstructions.push(`Configure environment variables: ${envVars.join(", ")}`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ai_metadata: aiMeta,
            ...mod,
            related_modules: resolvedRelated,
            dependencies,
            _changelog: changelogResult.data ?? [],
            _completeness: completeness,
            _group: groupMeta,
            _usage_stats: usageStats,
            _environment_setup: envInstructions.length > 0 ? envInstructions : undefined,
            _instructions: hasRequired
              ? "⚠️ This module has REQUIRED dependencies. You MUST fetch and implement each required dependency (via devvault_get) BEFORE implementing this module."
              : "This module has no required dependencies. You can implement it directly.",
          }, null, 2),
        }],
      };
    },
  });
};

/**
 * Resolves an array of UUID related_modules into {id, slug, title} objects.
 */
async function resolveRelatedModules(
  client: Parameters<ToolRegistrar>[1],
  uuids: string[] | null,
): Promise<Array<{ id: string; slug: string | null; title: string }>> {
  if (!uuids || uuids.length === 0) return [];

  const { data } = await client
    .from("vault_modules")
    .select("id, slug, title")
    .in("id", uuids);

  return (data ?? []) as Array<{ id: string; slug: string | null; title: string }>;
}

/**
 * Fetches usage statistics for a module from vault_usage_events and vault_agent_tasks.
 */
async function fetchUsageStats(
  client: Parameters<ToolRegistrar>[1],
  moduleId: string,
): Promise<{ times_fetched: number; times_used_in_tasks: number; success_reports: number }> {
  const [fetchResult, taskResult, successResult] = await Promise.all([
    client
      .from("vault_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("event_type", "get"),
    client
      .from("vault_agent_tasks")
      .select("id", { count: "exact", head: true })
      .contains("modules_used", [moduleId]),
    client
      .from("vault_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("event_type", "success_reported"),
  ]);

  return {
    times_fetched: fetchResult.count ?? 0,
    times_used_in_tasks: taskResult.count ?? 0,
    success_reports: successResult.count ?? 0,
  };
}
