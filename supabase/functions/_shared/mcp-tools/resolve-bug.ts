/**
 * mcp-tools/resolve-bug.ts — devvault_resolve_bug tool.
 *
 * Documents the solution for a previously reported knowledge gap.
 * Optionally promotes the solution to a full vault module, closing
 * the Knowledge Flywheel loop: bug → resolution → reusable module.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import { getCompleteness } from "./completeness.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:resolve-bug");

export const registerResolveBugTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_resolve_bug", {
    description:
      "Document the solution for a previously reported knowledge gap (from devvault_report_bug). " +
      "Optionally promotes the solution to a reusable vault module by setting promote_to_module=true. " +
      "This closes the Knowledge Flywheel: bug → resolution → module.",
    inputSchema: {
      type: "object",
      properties: {
        gap_id: { type: "string", description: "UUID of the knowledge gap to resolve" },
        resolution: { type: "string", description: "How the bug was solved (text explanation)" },
        resolution_code: { type: "string", description: "Code that fixes the problem" },
        promote_to_module: {
          type: "boolean",
          description: "If true, creates a vault module from this resolution (default false)",
        },
        module_title: { type: "string", description: "Title for the promoted module (required if promote_to_module=true)" },
        module_domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
          description: "Domain for the promoted module",
        },
        module_tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for the promoted module",
        },
      },
      required: ["gap_id", "resolution"],
    },
    handler: async (params: Record<string, unknown>) => {
      const gapId = params.gap_id as string;
      const resolution = params.resolution as string;
      const resolutionCode = params.resolution_code as string | undefined;
      const promote = params.promote_to_module as boolean | undefined;
      const moduleTitle = params.module_title as string | undefined;
      const moduleDomain = params.module_domain as string | undefined;
      const moduleTags = (params.module_tags as string[] | undefined) ?? [];

      logger.info("invoked", { gapId, promote });

      try {
        // Fetch gap to verify existence and get original error
        const { data: gap, error: fetchError } = await client
          .from("vault_knowledge_gaps")
          .select("id, error_message, context, domain, status")
          .eq("id", gapId)
          .single();

        if (fetchError || !gap) {
          return errorResponse({ code: "BUG_NOT_FOUND", message: `Gap not found (${gapId})` });
        }

        if (gap.status === "promoted_to_module") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "This gap was already promoted to a module.",
                gap_id: gapId,
                status: gap.status,
              }, null, 2),
            }],
          };
        }

        let newStatus = "resolved";
        let promotedModule: Record<string, unknown> | null = null;
        let completeness: Record<string, unknown> | null = null;

        // Promote to module if requested
        if (promote) {
          if (!moduleTitle) {
            return errorResponse({ code: "INVALID_INPUT", message: "module_title is required when promote_to_module=true." });
          }

          const moduleInsert: Record<string, unknown> = {
            title: moduleTitle,
            code: resolutionCode ?? resolution,
            description: `Solution for: ${gap.error_message.substring(0, 200)}`,
            user_id: auth.userId,
            visibility: "global",
            validation_status: "draft",
            language: "typescript",
            tags: moduleTags,
            solves_problems: [gap.error_message],
            common_errors: [{
              error: gap.error_message,
              cause: gap.context ?? "Reported by AI agent",
              fix: resolution,
            }],
            usage_hint: `Use when encountering: ${gap.error_message.substring(0, 150)}`,
          };

          if (moduleDomain) moduleInsert.domain = moduleDomain;
          else if (gap.domain) moduleInsert.domain = gap.domain;

          const { data: mod, error: modError } = await client
            .from("vault_modules")
            .insert(moduleInsert)
            .select("id, slug, title")
            .single();

          if (modError) {
            logger.error("module promotion failed", { error: modError.message });
            return errorResponse({ code: classifyRpcError(modError.message), message: `Error promoting to module: ${modError.message}` });
          }

          promotedModule = mod;
          newStatus = "promoted_to_module";
          completeness = await getCompleteness(client, mod.id);
        }

        // Update gap
        const updateData: Record<string, unknown> = {
          status: newStatus,
          resolution,
          resolution_code: resolutionCode ?? null,
          resolved_by: auth.userId || null,
          resolved_at: new Date().toISOString(),
        };
        if (promotedModule) {
          updateData.promoted_module_id = promotedModule.id;
        }

        const { error: updateError } = await client
          .from("vault_knowledge_gaps")
          .update(updateData)
          .eq("id", gapId);

        if (updateError) {
          logger.error("gap update failed", { error: updateError.message });
          return errorResponse({ code: classifyRpcError(updateError.message), message: `Error updating gap: ${updateError.message}` });
        }

        trackUsage(client, auth, {
          event_type: "bug_resolved",
          tool_name: "devvault_resolve_bug",
          query_text: gap.error_message,
          result_count: promotedModule ? 1 : 0,
        });

        logger.info("gap resolved", { gapId, promoted: !!promotedModule });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              gap_id: gapId,
              status: newStatus,
              ...(promotedModule
                ? {
                    module_created: promotedModule,
                    _completeness: completeness,
                    _hint: "Module created as 'draft'. Use devvault_get with the slug to verify.",
                  }
                : {
                    _hint: "Gap resolved. The resolution is stored for future diagnose queries.",
                  }),
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
