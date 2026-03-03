/**
 * mcp-tools/search.ts — devvault_search tool.
 *
 * Hybrid search across the Knowledge Graph combining full-text (PT/EN)
 * with semantic vector similarity. Results include relationship metadata.
 */

import { createLogger } from "../logger.ts";
import { generateEmbedding } from "../embedding-client.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:search");

export const registerSearchTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_search", {
    description:
      "Search the Knowledge Graph by intent/text. Returns modules with relevance scoring. " +
      "Uses hybrid search combining full-text (PT/EN) with semantic vector similarity. " +
      "Also searches solves_problems field (e.g. 'webhook not receiving events'). " +
      "Results include has_dependencies and related_modules_count for navigation. " +
      "For structured browsing without text search, use devvault_list instead.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Full-text search query (PT or EN)" },
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
        limit: { type: "number", description: "Max results (default 10, max 50)" },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      logger.info("invoked", { params });
      try {
        const limit = Math.min(Number(params.limit ?? 10), 50);
        const queryText = params.query as string | undefined;

        let queryEmbedding: string | null = null;
        if (queryText) {
          try {
            const embeddingArray = await generateEmbedding(queryText);
            queryEmbedding = `[${embeddingArray.join(",")}]`;
          } catch (embErr) {
            logger.warn("embedding generation failed, falling back to full-text only", {
              error: String(embErr),
            });
          }
        }

        // Use hybrid search when we have a query
        if (queryText || queryEmbedding) {
          const rpcParams: Record<string, unknown> = {
            p_query_text: queryText ?? null,
            p_query_embedding: queryEmbedding,
            p_match_count: limit,
          };
          if (params.domain) rpcParams.p_domain = params.domain;
          if (params.module_type) rpcParams.p_module_type = params.module_type;
          if (params.tags) rpcParams.p_tags = params.tags;

          const { data, error } = await client.rpc("hybrid_search_vault_modules", rpcParams);

          if (error) {
            logger.error("hybrid search failed", { error: error.message });
            return errorResponse({ code: "RPC_FAILURE", message: error.message });
          }

          const rawModules = data as Record<string, unknown>[];
          const modules = await enrichWithRelations(client, rawModules);

          trackUsage(client, auth, {
            event_type: modules.length > 0 ? "search" : "search_miss",
            tool_name: "devvault_search",
            query_text: queryText,
            result_count: modules.length,
          });

          if (modules.length === 0) {
            return buildEmptySearchResponse(client, queryText, params);
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                total_results: modules.length,
                search_mode: queryEmbedding ? "hybrid" : "full_text",
                modules,
                _hint: "Use devvault_get with a module's id or slug to fetch full code and dependencies.",
              }, null, 2),
            }],
          };
        }

        // No query: list mode
        const rpcParams: Record<string, unknown> = { p_limit: limit };
        if (params.domain) rpcParams.p_domain = params.domain;
        if (params.module_type) rpcParams.p_module_type = params.module_type;
        if (params.tags) rpcParams.p_tags = params.tags;

        const { data, error } = await client.rpc("query_vault_modules", rpcParams);

        if (error) {
          logger.error("search failed", { error: error.message });
          return errorResponse({ code: "RPC_FAILURE", message: error.message });
        }

        const rawModules = data as Record<string, unknown>[];
        const totalCount = rawModules.length > 0
          ? Number((rawModules[0] as Record<string, unknown>).total_count ?? rawModules.length)
          : 0;
        const modules = await enrichWithRelations(client, rawModules);

        trackUsage(client, auth, {
          event_type: modules.length > 0 ? "search" : "search_miss",
          tool_name: "devvault_search",
          query_text: queryText,
          result_count: modules.length,
        });

        if (modules.length === 0) {
          return buildEmptySearchResponse(client, undefined, params);
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              total_results: totalCount,
              returned: modules.length,
              search_mode: "list",
              modules,
              _hint: "Use devvault_get with a module's id or slug to fetch full code and dependencies.",
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

/**
 * Enrich search results with dependency/relationship metadata.
 */
async function enrichWithRelations(
  client: Parameters<ToolRegistrar>[1],
  modules: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (modules.length === 0) return modules;

  const ids = modules.map((m) => m.id as string);

  const [{ data: deps }, { data: dependents }] = await Promise.all([
    client.from("vault_module_dependencies").select("module_id").in("module_id", ids),
    client.from("vault_module_dependencies").select("depends_on_id").in("depends_on_id", ids),
  ]);

  const hasDepsSet = new Set(
    (deps as Array<{ module_id: string }> ?? []).map((d) => d.module_id),
  );
  const hasDependentsSet = new Set(
    (dependents as Array<{ depends_on_id: string }> ?? []).map((d) => d.depends_on_id),
  );

  return modules.map((m) => ({
    ...m,
    has_dependencies: hasDepsSet.has(m.id as string),
    is_depended_upon: hasDependentsSet.has(m.id as string),
    related_modules_count: (m.related_modules as string[] | null)?.length ?? 0,
  }));
}

/**
 * Builds an intelligent empty-search response with suggestions.
 */
async function buildEmptySearchResponse(
  client: Parameters<ToolRegistrar>[1],
  queryText: string | undefined,
  params: Record<string, unknown>,
) {
  // Fetch available domains with counts
  const { data: domains } = await client.rpc("list_vault_domains");

  const suggestions: Record<string, unknown> = {
    available_domains: domains ?? [],
    _hint: "No modules matched your search. Try the suggestions below.",
  };

  // If query looks like an error message, suggest diagnose
  if (queryText) {
    const looksLikeError =
      /error|exception|failed|cannot|undefined|null|crash|timeout|401|403|404|500/i.test(queryText);
    if (looksLikeError) {
      suggestions.try_diagnose = {
        tool: "devvault_diagnose",
        call: `devvault_diagnose({error_message: "${queryText.substring(0, 100)}"})`,
        reason: "Your query looks like an error message. devvault_diagnose searches common_errors and solves_problems fields.",
      };
    }

    // Suggest broadening: remove filters
    const activeFilters: string[] = [];
    if (params.domain) activeFilters.push(`domain: '${params.domain}'`);
    if (params.module_type) activeFilters.push(`module_type: '${params.module_type}'`);
    if (params.tags) activeFilters.push(`tags: ${JSON.stringify(params.tags)}`);
    if (activeFilters.length > 0) {
      suggestions.try_without_filters = {
        reason: `You have active filters (${activeFilters.join(", ")}). Try removing them to broaden results.`,
        call: `devvault_search({query: "${queryText.substring(0, 80)}"})`,
      };
    }
  }

  suggestions.alternative_actions = [
    "devvault_list({domain: 'backend'}) — Browse modules by domain",
    "devvault_domains() — See all available domains and module counts",
    "devvault_diagnose({error_message: '...'}) — Search by error message",
    "devvault_load_context({tags: ['tag1']}) — Find modules by tags across projects",
  ];

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        total_results: 0,
        search_mode: queryText ? "hybrid" : "list",
        modules: [],
        _suggestions: suggestions,
      }, null, 2),
    }],
  };
}
