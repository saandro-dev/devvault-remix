/**
 * mcp-tools/list.ts — devvault_list tool.
 *
 * Lists modules with optional filters. Results include dependency and
 * relationship metadata for agent navigation.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:list");

export const registerListTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_list", {
    description:
      "List modules with optional filters including text search, tags, group, and domain. " +
      "Results include has_dependencies and related_modules_count for navigation. " +
      "For semantic/intent-based search with relevance scoring, prefer devvault_search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text search filter (searches title, description, tags)" },
        domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
        },
        module_type: {
          type: "string",
          enum: ["code_snippet", "full_module", "sql_migration", "architecture_doc", "playbook_phase", "pattern_guide"],
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (AND match)",
        },
        group: { type: "string", description: "Filter by module_group name" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      logger.info("invoked", { params });
      try {
        const limit = Math.min(Number(params.limit ?? 20), 50);
        const offset = Number(params.offset ?? 0);

        const rpcParams: Record<string, unknown> = {
          p_limit: limit,
          p_offset: offset,
        };
        if (params.query) rpcParams.p_query = params.query;
        if (params.domain) rpcParams.p_domain = params.domain;
        if (params.module_type) rpcParams.p_module_type = params.module_type;
        if (params.tags) rpcParams.p_tags = params.tags;
        if (params.group) rpcParams.p_group = params.group;

        const { data, error } = await client.rpc("query_vault_modules", rpcParams);

        if (error) {
          logger.error("list failed", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        const rawModules = data as Record<string, unknown>[];
        const moduleIds = rawModules.map((m) => m.id as string);

        // Enrich with dependency info in parallel
        const [{ data: deps }, { data: dependents }] = await Promise.all([
          client
            .from("vault_module_dependencies")
            .select("module_id")
            .in("module_id", moduleIds),
          client
            .from("vault_module_dependencies")
            .select("depends_on_id")
            .in("depends_on_id", moduleIds),
        ]);

        const hasDepsSet = new Set(
          (deps as Array<{ module_id: string }> ?? []).map((d) => d.module_id),
        );
        const hasDependentsSet = new Set(
          (dependents as Array<{ depends_on_id: string }> ?? []).map((d) => d.depends_on_id),
        );

        const totalCount = rawModules.length > 0
          ? Number((rawModules[0] as Record<string, unknown>).total_count ?? rawModules.length)
          : 0;

        const modules = rawModules.map((m) => {
          const { code, context_markdown, total_count, ...rest } = m as Record<string, unknown>;
          return {
            ...rest,
            has_dependencies: hasDepsSet.has(m.id as string),
            is_depended_upon: hasDependentsSet.has(m.id as string),
            related_modules_count: (m.related_modules as string[] | null)?.length ?? 0,
          };
        });

        trackUsage(client, auth, {
          event_type: "list",
          tool_name: "devvault_list",
          query_text: params.query as string | undefined,
          result_count: modules.length,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              total_results: totalCount,
              returned: modules.length,
              offset,
              modules,
            }, null, 2),
          }],
        };
      } catch (err) {
        logger.error("uncaught error", { error: String(err) });
        return errorResponse({ code: "INTERNAL_ERROR", message: String(err) });
      }
    },
  });
};
