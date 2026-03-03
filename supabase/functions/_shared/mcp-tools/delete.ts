/**
 * mcp-tools/delete.ts — devvault_delete tool.
 *
 * Deletes a module by ID or slug. Supports soft delete (set validation_status
 * to 'deprecated') or hard delete (permanent removal). Default is soft delete.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:delete");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const registerDeleteTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_delete", {
    description:
      "Delete a module by ID or slug. Default is SOFT delete (sets validation_status " +
      "to 'deprecated'). Use hard_delete=true for permanent removal. Only the module " +
      "owner can delete. You can pass either a UUID or a slug — auto-detected.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module UUID or slug (auto-detected)" },
        hard_delete: {
          type: "boolean",
          description: "If true, permanently deletes the module. Default: false (soft delete).",
        },
      },
      required: ["id"],
    },
    handler: async (params: Record<string, unknown>) => {
      const identifier = params.id as string;
      const hardDelete = params.hard_delete === true;

      logger.info("invoked", { identifier, hardDelete, userId: auth.userId });

      try {
        // Resolve identifier to UUID
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
            return errorResponse({ code: "MODULE_NOT_FOUND", message: `Module not found with slug: ${identifier}` });
          }
          moduleId = found.id;
        }

        // Verify ownership
        const { data: ownerCheck } = await client
          .from("vault_modules")
          .select("id, title, slug")
          .eq("id", moduleId)
          .eq("user_id", auth.userId)
          .maybeSingle();

        if (!ownerCheck) {
          return errorResponse({ code: "PERMISSION_DENIED", message: "Module not found or not owned by you." });
        }

        if (hardDelete) {
          const { error } = await client
            .from("vault_modules")
            .delete()
            .eq("id", moduleId);

          if (error) {
            logger.error("hard delete failed", { error: error.message, moduleId });
            return errorResponse({ code: classifyRpcError(error.message), message: error.message });
          }

          trackUsage(client, auth, { event_type: "delete", tool_name: "devvault_delete", module_id: moduleId });
          logger.info("module hard deleted", { moduleId, title: ownerCheck.title });
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                action: "hard_delete",
                module: { id: moduleId, title: ownerCheck.title, slug: ownerCheck.slug },
                _hint: "Module permanently deleted. This action cannot be undone.",
              }, null, 2),
            }],
          };
        }

        // Soft delete: set validation_status to deprecated
        const { data, error } = await client
          .from("vault_modules")
          .update({ validation_status: "deprecated" })
          .eq("id", moduleId)
          .select("id, slug, title, validation_status")
          .single();

        if (error) {
          logger.error("soft delete failed", { error: error.message, moduleId });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        trackUsage(client, auth, { event_type: "delete", tool_name: "devvault_delete", module_id: moduleId });
        logger.info("module soft deleted (deprecated)", { moduleId, title: data.title });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              action: "soft_delete",
              module: data,
              _hint: "Module marked as 'deprecated'. It will no longer appear in search results. " +
                "Use devvault_update to restore it (set validation_status='draft' or 'validated'). " +
                "For permanent removal, call devvault_delete with hard_delete=true.",
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
