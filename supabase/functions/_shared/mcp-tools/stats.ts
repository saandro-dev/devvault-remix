/**
 * mcp-tools/stats.ts — devvault_stats tool.
 *
 * Returns aggregate metrics about the vault for AI agents:
 * total modules, breakdown by status/domain, average completeness,
 * modules without embeddings, and recent activity.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:stats");

export const registerStatsTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_stats", {
    description:
      "Returns aggregate vault metrics: total modules, by status (draft/validated/deprecated), " +
      "by domain, modules without embeddings, and recent activity count (7 days). " +
      "Use this to understand the health and coverage of the knowledge base.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => {
      try {
        // Run queries in parallel
        const [
          totalResult,
          byStatusResult,
          byDomainResult,
          noEmbeddingResult,
          recentResult,
        ] = await Promise.all([
          // Total
          client.from("vault_modules").select("id", { count: "exact", head: true }).eq("visibility", "global"),
          // By status
          client.from("vault_modules").select("validation_status").eq("visibility", "global"),
          // By domain
          client.rpc("list_vault_domains"),
          // Without embedding
          client.from("vault_modules").select("id", { count: "exact", head: true }).eq("visibility", "global").is("embedding", null),
          // Recent activity (7 days)
          client.from("vault_modules").select("id", { count: "exact", head: true }).eq("visibility", "global").gte("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

        // Count by status
        const statusCounts: Record<string, number> = { draft: 0, validated: 0, deprecated: 0 };
        if (byStatusResult.data) {
          for (const row of byStatusResult.data as Array<{ validation_status: string }>) {
            const s = row.validation_status ?? "draft";
            statusCounts[s] = (statusCounts[s] ?? 0) + 1;
          }
        }

        const stats = {
          total_modules: totalResult.count ?? 0,
          by_status: statusCounts,
          by_domain: byDomainResult.data ?? [],
          modules_without_embedding: noEmbeddingResult.count ?? 0,
          recent_activity_7d: recentResult.count ?? 0,
        };

        trackUsage(client, auth, {
          event_type: "stats",
          tool_name: "devvault_stats",
          result_count: stats.total_modules,
        });

        logger.info("stats fetched", { total: stats.total_modules });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...stats,
              _hint:
                stats.modules_without_embedding > 0
                  ? `⚠️ ${stats.modules_without_embedding} modules have no embedding — they won't appear in semantic search. Consider updating them to trigger embedding generation.`
                  : "All modules have embeddings. Semantic search is fully operational.",
            }, null, 2),
          }],
        };
      } catch (err) {
        logger.error("stats failed", { error: String(err) });
        return errorResponse({ code: "INTERNAL_ERROR", message: String(err) });
      }
    },
  });
};
