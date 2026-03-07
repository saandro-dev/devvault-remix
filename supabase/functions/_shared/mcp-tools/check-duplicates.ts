/**
 * mcp-tools/check-duplicates.ts — devvault_check_duplicates tool.
 *
 * Proactive duplicate detection for AI agents. Call before ingesting
 * to verify no similar module already exists. Uses trigram similarity
 * on titles via the `check_duplicate_modules` RPC.
 */

import { createLogger } from "../logger.ts";
import { checkDuplicates } from "../duplicate-checker.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:check-duplicates");

export const registerCheckDuplicatesTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_check_duplicates", {
    description:
      "Check if a module with a similar title already exists before ingesting. " +
      "Returns matching modules ranked by similarity score. " +
      "ALWAYS call this before devvault_ingest to avoid creating duplicates. " +
      "If matches are found, consider using devvault_update on the existing module instead.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the module you plan to ingest",
        },
        threshold: {
          type: "number",
          description: "Minimum similarity score (0-1). Default: 0.65. Lower = more results.",
        },
        limit: {
          type: "number",
          description: "Max results to return. Default: 5.",
        },
      },
      required: ["title"],
    },
    handler: async (params: Record<string, unknown>) => {
      const title = params.title as string;
      if (!title || !title.trim()) {
        return errorResponse({
          code: "VALIDATION_FAILED",
          message: "title is required",
        });
      }

      const threshold = (params.threshold as number) ?? 0.65;
      const limit = (params.limit as number) ?? 5;

      try {
        const result = await checkDuplicates(client, title, threshold, limit);

        trackUsage(client, auth, {
          event_type: "check_duplicates",
          tool_name: "devvault_check_duplicates",
          query_text: title,
          result_count: result.matches.length,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              has_duplicates: result.has_duplicates,
              matches: result.matches,
              _hint: result.has_duplicates
                ? `⚠️ Found ${result.matches.length} similar module(s). ` +
                  "Consider using devvault_update on an existing module instead of creating a duplicate. " +
                  "If this is genuinely new, proceed with devvault_ingest and set force_create: true."
                : "✅ No duplicates found. Safe to proceed with devvault_ingest.",
            }, null, 2),
          }],
        };
      } catch (err) {
        logger.error("check-duplicates failed", { error: String(err) });
        return errorResponse({
          code: "INTERNAL_ERROR",
          message: String(err),
        });
      }
    },
  });
};
