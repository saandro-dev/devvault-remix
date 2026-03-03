/**
 * mcp-tools/report-bug.ts — devvault_report_bug tool.
 *
 * Registers a bug or knowledge gap that an AI agent encountered
 * and could not resolve via devvault_diagnose. Deduplicates by
 * checking for existing open gaps with the same error_message.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:report-bug");

export const registerReportBugTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_report_bug", {
    description:
      "Report a bug or knowledge gap that you could not resolve via devvault_diagnose. " +
      "The system deduplicates: if an open gap with the same error already exists, it " +
      "increments the hit_count instead of creating a duplicate. When you solve it later, " +
      "call devvault_resolve_bug to document the solution.",
    inputSchema: {
      type: "object",
      properties: {
        error_message: {
          type: "string",
          description: "The error message or problem description",
        },
        context: {
          type: "string",
          description: "Stack trace, project context, or situation details",
        },
        domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
          description: "Knowledge domain this bug belongs to",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization and search",
        },
      },
      required: ["error_message"],
    },
    handler: async (params: Record<string, unknown>) => {
      const errorMsg = params.error_message as string;
      const context = params.context as string | undefined;
      const domain = params.domain as string | undefined;
      const tags = (params.tags as string[] | undefined) ?? [];

      logger.info("invoked", { errorMsg: errorMsg.substring(0, 100), domain });

      try {
        // Dedup: check for existing open gap with same error_message
        const { data: existing } = await client
          .from("vault_knowledge_gaps")
          .select("id, hit_count, status")
          .eq("error_message", errorMsg)
          .in("status", ["open", "investigating"])
          .limit(1)
          .single();

        if (existing) {
          // Increment hit_count
          await client
            .from("vault_knowledge_gaps")
            .update({ hit_count: (existing.hit_count ?? 1) + 1 })
            .eq("id", existing.id);

          logger.info("deduplicated — incremented hit_count", { gapId: existing.id });

          trackUsage(client, auth, {
            event_type: "bug_reported",
            tool_name: "devvault_report_bug",
            query_text: errorMsg,
            result_count: 0,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                deduplicated: true,
                gap_id: existing.id,
                status: existing.status,
                hit_count: (existing.hit_count ?? 1) + 1,
                _hint:
                  "This gap was already reported. Hit count incremented. " +
                  "When you solve it, call devvault_resolve_bug with this gap_id.",
              }, null, 2),
            }],
          };
        }

        // Create new gap
        const { data, error } = await client
          .from("vault_knowledge_gaps")
          .insert({
            error_message: errorMsg,
            context: context ?? null,
            domain: domain ?? null,
            tags,
            reported_by: auth.userId || null,
            status: "open",
          })
          .select("id, status, created_at")
          .single();

        if (error) {
          logger.error("insert failed", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        trackUsage(client, auth, {
          event_type: "bug_reported",
          tool_name: "devvault_report_bug",
          query_text: errorMsg,
          result_count: 0,
        });

        logger.info("gap created", { gapId: data.id });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              gap_id: data.id,
              status: data.status,
              created_at: data.created_at,
              _hint:
                "Gap registered. When you solve this problem, call devvault_resolve_bug " +
                "with this gap_id to document the solution and optionally promote it to a reusable module.",
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
