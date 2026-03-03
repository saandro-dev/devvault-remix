/**
 * mcp-tools/diary-list.ts — MCP tool: devvault_diary_list
 *
 * Lists and searches entries in the user's personal Bug Diary (`bugs` table).
 * Supports filtering by status, tags, project, text search, and pagination.
 * Ownership is enforced via auth.userId — agents only see their own bugs.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../logger.ts";
import type { AuthContext, McpServerLike, ToolRegistrar } from "./types.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";

const logger = createLogger("mcp-diary-list");

export const registerDiaryListTool: ToolRegistrar = (
  server: McpServerLike,
  client: SupabaseClient,
  auth: AuthContext,
): void => {
  server.tool("devvault_diary_list", {
    description:
      "List and search entries in the user's personal Bug Diary. " +
      "Use this to find existing bugs before creating new ones (avoid duplicates), " +
      "or to locate a bug_id for resolving with devvault_diary_resolve.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "resolved"],
          description:
            "Filter by bug status. Omit to return both open and resolved.",
        },
        search: {
          type: "string",
          description:
            "Free-text search across title and symptom fields (case-insensitive ILIKE).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter bugs that contain ANY of the provided tags (overlap match).",
        },
        project_id: {
          type: "string",
          description: "Filter by associated project UUID.",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20, max 100).",
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0).",
        },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      try {
        const status = (params.status as string) || null;
        const search = (params.search as string) || null;
        const tags = (params.tags as string[]) || null;
        const projectId = (params.project_id as string) || null;
        const limit = Math.min(Math.max((params.limit as number) || 20, 1), 100);
        const offset = Math.max((params.offset as number) || 0, 0);

        let query = client
          .from("bugs")
          .select("id, title, symptom, status, cause_code, solution, tags, project_id, vault_module_id, created_at, updated_at", { count: "exact" })
          .eq("user_id", auth.userId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) {
          query = query.eq("status", status);
        }
        if (projectId) {
          query = query.eq("project_id", projectId);
        }
        if (tags && tags.length > 0) {
          query = query.overlaps("tags", tags);
        }
        if (search) {
          query = query.or(`title.ilike.%${search}%,symptom.ilike.%${search}%`);
        }

        const { data, error, count } = await query;

        if (error) {
          logger.error("Failed to list diary bugs", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        trackUsage(client, auth, {
          event_type: "diary_listed",
          tool_name: "devvault_diary_list",
          result_count: data?.length ?? 0,
        });

        const openCount = (data ?? []).filter((b: Record<string, unknown>) => b.status === "open").length;

        const response = {
          total: count ?? 0,
          returned: data?.length ?? 0,
          offset,
          limit,
          bugs: data ?? [],
          _hint:
            openCount > 0
              ? `Found ${openCount} open bug(s). Use devvault_diary_resolve with the bug_id to resolve them when you find a solution.`
              : "No open bugs in this result set.",
          _instructions:
            "ALWAYS search existing bugs with devvault_diary_list before creating new ones with devvault_diary_bug to avoid duplicates.",
        };

        logger.info("Diary list returned", { total: count, returned: data?.length });

        return {
          content: [
            { type: "text", text: JSON.stringify(response, null, 2) },
          ],
        };
      } catch (err) {
        logger.error("Unexpected error in diary-list", { error: (err as Error).message });
        return errorResponse({ code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    },
  });
};
