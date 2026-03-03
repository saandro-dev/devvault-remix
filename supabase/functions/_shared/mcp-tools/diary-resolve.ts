/**
 * mcp-tools/diary-resolve.ts — MCP tool: devvault_diary_resolve
 *
 * Updates an existing bug in the user's Bug Diary with a solution,
 * setting its status to "resolved".
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../logger.ts";
import type { AuthContext, McpServerLike, ToolRegistrar } from "./types.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";

const logger = createLogger("mcp-diary-resolve");

export const registerDiaryResolveTool: ToolRegistrar = (
  server: McpServerLike,
  client: SupabaseClient,
  auth: AuthContext,
): void => {
  server.tool("devvault_diary_resolve", {
    description:
      "Resolve an existing bug in the user's personal Bug Diary. " +
      "Provide the bug_id and the solution that fixed the issue. " +
      "The bug status will be set to 'resolved'.",
    inputSchema: {
      type: "object",
      properties: {
        bug_id: {
          type: "string",
          description: "UUID of the bug to resolve (required).",
        },
        cause_code: {
          type: "string",
          description:
            "Root cause code or category (e.g. 'missing-env-var', 'wrong-import').",
        },
        solution: {
          type: "string",
          description: "How the bug was fixed (required).",
        },
      },
      required: ["bug_id", "solution"],
    },
    handler: async (params: Record<string, unknown>) => {
      try {
        const bugId = params.bug_id as string;
        const solution = params.solution as string;
        const causeCode = (params.cause_code as string) || undefined;

        const updateFields: Record<string, unknown> = {
          solution,
          status: "resolved",
        };
        if (causeCode !== undefined) {
          updateFields.cause_code = causeCode;
        }

        const { data, error } = await client
          .from("bugs")
          .update(updateFields)
          .eq("id", bugId)
          .eq("user_id", auth.userId)
          .select("id, title, status")
          .single();

        if (error) {
          logger.error("Failed to resolve diary bug", {
            bug_id: bugId,
            error: error.message,
          });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        trackUsage(client, auth, {
          event_type: "bug_resolved",
          tool_name: "devvault_diary_resolve",
        });

        logger.info("Diary bug resolved", { id: data.id });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  bug_id: data.id,
                  title: data.title,
                  status: data.status,
                  message: `Bug "${data.title}" resolved in diary.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Unexpected error in diary-resolve", {
          error: (err as Error).message,
        });
        return errorResponse({ code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    },
  });
};
