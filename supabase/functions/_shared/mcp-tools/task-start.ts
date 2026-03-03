/**
 * mcp-tools/task-start.ts — devvault_task_start tool (Tool 24).
 *
 * Creates a new agent task entry in vault_agent_tasks with status 'active'.
 * Returns a task_id for the agent to reference when ending the task.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";

const logger = createLogger("mcp-tool:task-start");

export const registerTaskStartTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_task_start", {
    description:
      "Start tracking a high-level task. Call this at the beginning of a work session " +
      "to record what you're trying to accomplish. Returns a task_id that you MUST pass " +
      "to devvault_task_end when the task is complete (success, failure, or abandoned). " +
      "This enables DevVault to understand which modules solve which problems and measure ROI.",
    inputSchema: {
      type: "object",
      properties: {
        objective: {
          type: "string",
          description:
            "What you are trying to accomplish (e.g. 'Create a JWT authentication endpoint with refresh tokens').",
        },
        context: {
          type: "object",
          description:
            "Optional metadata about the task context (e.g. { project: 'my-saas', framework: 'next.js' }).",
        },
      },
      required: ["objective"],
    },
    handler: async (params: Record<string, unknown>) => {
      try {
        const objective = params.objective as string;
        const context = (params.context as Record<string, unknown>) ?? {};

        const { data, error } = await client
          .from("vault_agent_tasks")
          .insert({
            user_id: auth.userId,
            api_key_id: auth.keyId || null,
            objective,
            status: "active",
            context,
          })
          .select("id, objective, status, started_at")
          .single();

        if (error) {
          logger.error("Failed to create task", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        trackUsage(client, auth, {
          event_type: "task_start",
          tool_name: "devvault_task_start",
        });

        logger.info("Task started", { task_id: data.id, objective });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              task_id: data.id,
              objective: data.objective,
              status: data.status,
              started_at: data.started_at,
              _instructions:
                "IMPORTANT: Save this task_id. When your task is complete, call " +
                "devvault_task_end({ task_id, status, modules_used, outcome_notes }) " +
                "to close it. Valid statuses: 'success', 'failure', 'abandoned'.",
            }, null, 2),
          }],
        };
      } catch (err) {
        logger.error("Unexpected error in task-start", { error: (err as Error).message });
        return errorResponse({ code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    },
  });
};
