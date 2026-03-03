/**
 * mcp-tools/similar.ts — devvault_similar tool.
 *
 * Finds modules similar to a given module using cosine similarity on embeddings.
 * Useful for duplicate detection and knowledge discovery.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:similar");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const registerSimilarTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_similar", {
    description:
      "Find modules similar to a given module using vector similarity (cosine distance). " +
      "Useful for discovering related knowledge, preventing duplicates before ingest, " +
      "and navigating the vault by similarity. Requires the source module to have an embedding.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module UUID or slug (auto-detected)" },
        limit: { type: "number", description: "Max results (default 5, max 20)" },
        threshold: {
          type: "number",
          description: "Similarity threshold 0-1. Only modules with similarity >= threshold are returned. Default 0.5",
        },
      },
      required: ["id"],
    },
    handler: async (params: Record<string, unknown>) => {
      const identifier = params.id as string;
      const limit = Math.min(Number(params.limit ?? 5), 20);
      const threshold = Number(params.threshold ?? 0.5);

      // Resolve identifier
      let moduleId: string;
      if (UUID_RE.test(identifier)) {
        moduleId = identifier;
      } else {
        const { data: found } = await client
          .from("vault_modules")
          .select("id")
          .eq("slug", identifier)
          .single();
        if (!found) {
          return errorResponse({ code: "MODULE_NOT_FOUND", message: `Module not found: ${identifier}` });
        }
        moduleId = found.id;
      }

      // Call RPC
      const { data, error } = await client.rpc("find_similar_modules", {
        p_module_id: moduleId,
        p_limit: limit,
        p_threshold: threshold,
      });

      if (error) {
        logger.error("similar search failed", { error: error.message, moduleId });
        return errorResponse({ code: "RPC_FAILURE", message: error.message });
      }

      const results = (data ?? []) as Array<Record<string, unknown>>;

      trackUsage(client, auth, {
        event_type: "similar",
        tool_name: "devvault_similar",
        module_id: moduleId,
        result_count: results.length,
      });

      logger.info("similar search completed", { moduleId, results: results.length });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            source_module_id: moduleId,
            total_similar: results.length,
            threshold,
            modules: results,
            _hint: results.length > 0
              ? "Modules sorted by similarity (highest first). Score > 0.92 indicates likely duplicates."
              : "No similar modules found. This module's content is unique in the vault.",
          }, null, 2),
        }],
      };
    },
  });
};
