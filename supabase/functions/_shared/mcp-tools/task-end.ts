/**
 * mcp-tools/task-end.ts — devvault_task_end tool (Tool 25).
 *
 * Closes an active agent task by updating its status, recording modules used,
 * computing duration_ms, and storing outcome notes.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";

const logger = createLogger("mcp-tool:task-end");

export const registerTaskEndTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_task_end", {
    description:
      "End a previously started task. Updates the task status, records which modules " +
      "were used, computes duration, and stores outcome notes. " +
      "Call this when your work session is complete — whether successful, failed, or abandoned.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task_id returned by devvault_task_start.",
        },
        status: {
          type: "string",
          enum: ["success", "failure", "abandoned"],
          description: "Final status of the task.",
        },
        modules_used: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of vault module UUIDs that were used during this task. " +
            "Helps DevVault understand which modules solve which problems.",
        },
        outcome_notes: {
          type: "string",
          description:
            "Brief summary of what happened — what worked, what didn't, lessons learned.",
        },
      },
      required: ["task_id", "status"],
    },
    handler: async (params: Record<string, unknown>) => {
      try {
        const taskId = params.task_id as string;
        const status = params.status as string;
        const modulesUsed = (params.modules_used as string[]) ?? [];
        const outcomeNotes = (params.outcome_notes as string) || null;

        // Validate status
        if (!["success", "failure", "abandoned"].includes(status)) {
          return errorResponse({
            code: "INVALID_INPUT",
            message: `Invalid status: '${status}'. Must be 'success', 'failure', or 'abandoned'.`,
          });
        }

        // Fetch the task to compute duration
        const { data: existingTask, error: fetchError } = await client
          .from("vault_agent_tasks")
          .select("id, started_at, status, user_id")
          .eq("id", taskId)
          .single();

        if (fetchError || !existingTask) {
          logger.error("Task not found", { task_id: taskId, error: fetchError?.message });
          return errorResponse({
            code: "TASK_NOT_FOUND",
            message: `Task not found: ${taskId}. Make sure the task_id is correct.`,
          });
        }

        const task = existingTask as Record<string, unknown>;

        // Verify ownership
        if (task.user_id !== auth.userId) {
          return errorResponse({
            code: "PERMISSION_DENIED",
            message: "You can only end your own tasks.",
          });
        }

        // Verify task is still active
        if (task.status !== "active") {
          return errorResponse({
            code: "INVALID_INPUT",
            message: `Task is already closed with status: '${task.status}'. Cannot update.`,
          });
        }

        // Compute duration
        const startedAt = new Date(task.started_at as string);
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();

        // Update task
        const { data: updated, error: updateError } = await client
          .from("vault_agent_tasks")
          .update({
            status,
            modules_used: modulesUsed,
            completed_at: completedAt.toISOString(),
            duration_ms: durationMs,
            outcome_notes: outcomeNotes,
          })
          .eq("id", taskId)
          .select("id, objective, status, duration_ms, modules_used, completed_at")
          .single();

        if (updateError) {
          logger.error("Failed to end task", { error: updateError.message });
          return errorResponse({ code: classifyRpcError(updateError.message), message: updateError.message });
        }

        trackUsage(client, auth, {
          event_type: "task_end",
          tool_name: "devvault_task_end",
        });

        const updatedTask = updated as Record<string, unknown>;
        const durationSec = Math.round((updatedTask.duration_ms as number) / 1000);
        const durationMin = Math.round(durationSec / 60);

        logger.info("Task ended", {
          task_id: taskId,
          status,
          duration_ms: durationMs,
          modules_count: modulesUsed.length,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              task_id: updatedTask.id,
              objective: updatedTask.objective,
              status: updatedTask.status,
              duration: durationMin > 0
                ? `${durationMin} minutes`
                : `${durationSec} seconds`,
              modules_used_count: (updatedTask.modules_used as string[]).length,
              completed_at: updatedTask.completed_at,
              _message:
                `Task "${updatedTask.objective}" closed as ${updatedTask.status} ` +
                `after ${durationMin > 0 ? durationMin + " minutes" : durationSec + " seconds"} ` +
                `with ${(updatedTask.modules_used as string[]).length} modules used.`,
              _compliance_hint:
                "To verify all mandatory modules were implemented, call " +
                "devvault_mandatory({ check_compliance: ['slug-1', 'slug-2', ...] }) " +
                "with the slugs of modules you used.",
            }, null, 2),
          }],
        };
      } catch (err) {
        logger.error("Unexpected error in task-end", { error: (err as Error).message });
        return errorResponse({ code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    },
  });
};
