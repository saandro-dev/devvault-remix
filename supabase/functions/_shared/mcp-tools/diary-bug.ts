/**
 * mcp-tools/diary-bug.ts — MCP tool: devvault_diary_bug
 *
 * Creates a personal bug entry in the user's Bug Diary (`bugs` table).
 * If a solution is provided at creation time, the bug is marked as resolved.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../logger.ts";
import type { AuthContext, McpServerLike, ToolRegistrar } from "./types.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";

const logger = createLogger("mcp-diary-bug");

export const registerDiaryBugTool: ToolRegistrar = (
  server: McpServerLike,
  client: SupabaseClient,
  auth: AuthContext,
): void => {
  server.tool("devvault_diary_bug", {
    description:
      "Create a bug entry in the user's personal Bug Diary. " +
      "Use this when you encounter a problem worth documenting for future reference. " +
      "If a solution is already known, provide it and the bug will be marked as resolved.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short descriptive title of the bug (required).",
        },
        symptom: {
          type: "string",
          description:
            "What went wrong — the observable behavior or error message (required).",
        },
        cause_code: {
          type: "string",
          description:
            "Root cause code or category (e.g. 'missing-env-var', 'wrong-import').",
        },
        solution: {
          type: "string",
          description:
            "How the bug was fixed. If provided, the bug status is set to 'resolved'.",
        },
        project_id: {
          type: "string",
          description: "UUID of the related project (optional).",
        },
        vault_module_id: {
          type: "string",
          description: "UUID of the related vault module (optional).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Categorization tags (e.g. ['rls', 'supabase', 'auth']).",
        },
      },
      required: ["title", "symptom"],
    },
    handler: async (params: Record<string, unknown>) => {
      try {
        const title = params.title as string;
        const symptom = params.symptom as string;
        const causeCode = (params.cause_code as string) || null;
        const solution = (params.solution as string) || null;
        const projectId = (params.project_id as string) || null;
        const vaultModuleId = (params.vault_module_id as string) || null;
        const tags = (params.tags as string[]) || [];

        const status = solution ? "resolved" : "open";

        const { data, error } = await client
          .from("bugs")
          .insert({
            user_id: auth.userId,
            title,
            symptom,
            cause_code: causeCode,
            solution,
            status,
            project_id: projectId,
            vault_module_id: vaultModuleId,
            tags,
          })
          .select("id, title, status")
          .single();

        if (error) {
          logger.error("Failed to create diary bug", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        trackUsage(client, auth, {
          event_type: "bug_reported",
          tool_name: "devvault_diary_bug",
        });

        logger.info("Diary bug created", { id: data.id, status });

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
                  message: `Bug "${data.title}" created in diary as ${data.status}.`,
                  _hint:
                    "Use devvault_diary_list to find this bug later, or save the bug_id to resolve it with devvault_diary_resolve. " +
                    "ALWAYS search existing bugs before creating new ones to avoid duplicates.",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Unexpected error in diary-bug", { error: (err as Error).message });
        return errorResponse({ code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    },
  });
};
