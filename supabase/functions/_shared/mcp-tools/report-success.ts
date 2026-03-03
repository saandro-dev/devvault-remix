/**
 * mcp-tools/report-success.ts — devvault_report_success tool.
 *
 * Quick-capture tool for AI agents to document a successful
 * implementation pattern. Wraps devvault_ingest with sensible
 * defaults optimized for post-success reporting.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import { getCompleteness } from "./completeness.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:report-success");

export const registerReportSuccessTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_report_success", {
    description:
      "Quickly document a successful implementation pattern as a new vault module. " +
      "Use this right after you successfully build or fix something. " +
      "Optimized defaults: visibility=global, status=draft, language=typescript.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Module title (English preferred)" },
        code: { type: "string", description: "The implementation code" },
        description: { type: "string", description: "Brief description" },
        domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization",
        },
        source_project: { type: "string", description: "Project where this was used" },
        why_it_matters: { type: "string", description: "Why this pattern is valuable" },
        usage_hint: { type: "string", description: "When to use this pattern" },
        common_errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              error: { type: "string" },
              cause: { type: "string" },
              fix: { type: "string" },
            },
            required: ["error", "cause", "fix"],
          },
        },
        solves_problems: {
          type: "array",
          items: { type: "string" },
          description: "Problems this pattern solves",
        },
        language: { type: "string", description: "Programming language (default: typescript)" },
      },
      required: ["title", "code"],
    },
    handler: async (params: Record<string, unknown>) => {
      const title = params.title as string;
      const sourceProject = params.source_project as string | undefined;

      logger.info("invoked", { title: title.substring(0, 80) });

      const warnings: string[] = [];
      if (!params.why_it_matters) warnings.push("why_it_matters is empty — strongly encouraged.");
      if (!params.description) warnings.push("description is empty — helps agents understand the module.");

      const insertData: Record<string, unknown> = {
        title,
        code: params.code,
        user_id: auth.userId,
        visibility: "global",
        validation_status: "draft",
        language: (params.language as string) ?? "typescript",
        tags: (params.tags as string[]) ?? [],
        usage_hint: (params.usage_hint as string) ??
          (sourceProject ? `Successfully used in ${sourceProject}` : undefined),
      };

      const optionalFields = [
        "description", "domain", "why_it_matters", "source_project",
        "common_errors", "solves_problems",
      ];
      for (const field of optionalFields) {
        if (params[field] !== undefined) insertData[field] = params[field];
      }

      try {
        const { data, error } = await client
          .from("vault_modules")
          .insert(insertData)
          .select("id, slug, title")
          .single();

        if (error) {
          logger.error("insert failed", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        const completeness = await getCompleteness(client, data.id);

        trackUsage(client, auth, {
          event_type: "success_reported",
          tool_name: "devvault_report_success",
          module_id: data.id,
          result_count: 1,
        });

        logger.info("success reported", { moduleId: data.id });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              module: data,
              _completeness: completeness,
              _warnings: warnings.length > 0 ? warnings : undefined,
              _hint: "Module created as 'draft'. Use devvault_get to verify it was saved correctly.",
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
