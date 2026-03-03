/**
 * mcp-tools/update.ts — devvault_update tool.
 *
 * Partial update of an existing module by ID or slug.
 * Returns updated completeness score after mutation.
 */

import { createLogger } from "../logger.ts";
import { updateModuleEmbedding } from "../embedding-client.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { getCompleteness } from "./completeness.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:update");

const ALLOWED_UPDATE_FIELDS = [
  "title", "description", "code", "code_example", "why_it_matters",
  "usage_hint", "context_markdown", "tags", "domain", "module_type", "language",
  "source_project", "module_group", "implementation_order", "validation_status",
  "common_errors", "solves_problems", "test_code", "difficulty", "estimated_minutes",
  "prerequisites", "database_schema", "version", "ai_metadata",
] as const;

export const registerUpdateTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_update", {
    description:
      "Update an existing module by ID or slug. Supports partial updates — only the " +
      "fields you provide will be changed. Use this to fill missing fields like " +
      "why_it_matters, code_example, fix language, update tags, etc. Returns the " +
      "updated completeness score.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module UUID (provide id or slug)" },
        slug: { type: "string", description: "Module slug (provide id or slug)" },
        title: { type: "string" },
        description: { type: "string" },
        code: { type: "string" },
        code_example: { type: "string" },
        why_it_matters: { type: "string" },
        usage_hint: { type: "string", description: "When to use this module" },
        context_markdown: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        domain: { type: "string", enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"] },
        module_type: { type: "string", enum: ["code_snippet", "full_module", "sql_migration", "architecture_doc", "playbook_phase", "pattern_guide"] },
        language: { type: "string" },
        source_project: { type: "string" },
        module_group: { type: "string" },
        implementation_order: { type: "number" },
        validation_status: { type: "string", enum: ["draft", "validated", "deprecated"] },
        common_errors: { type: "array", items: { type: "object" }, description: "Common errors [{error, cause, fix}]" },
        solves_problems: { type: "array", items: { type: "string" }, description: "Problems this module solves" },
        test_code: { type: "string", description: "Quick validation code" },
        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        estimated_minutes: { type: "number", description: "Estimated implementation time" },
        prerequisites: { type: "array", items: { type: "object" }, description: "Environment prerequisites" },
        database_schema: { type: "string", description: "SQL migration/schema required for this module" },
        version: { type: "string", description: "Semantic version string. E.g.: 'v1', 'v2', '1.0.0'" },
        ai_metadata: {
          type: "object",
          description: "AI agent metadata: {npm_dependencies?: string[], env_vars_required?: string[], ai_rules?: string[]}",
          properties: {
            npm_dependencies: { type: "array", items: { type: "string" } },
            env_vars_required: { type: "array", items: { type: "string" } },
            ai_rules: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      if (!params.id && !params.slug) {
        return errorResponse({ code: "INVALID_INPUT", message: "Provide either 'id' or 'slug'." });
      }

      let moduleId = params.id as string | undefined;
      if (!moduleId && params.slug) {
        const { data: found } = await client
          .from("vault_modules")
          .select("id")
          .eq("slug", params.slug as string)
          .single();
        if (!found) {
          return errorResponse({ code: "MODULE_NOT_FOUND", message: `Module not found with slug: ${params.slug}` });
        }
        moduleId = found.id;
      }

      const updateFields: Record<string, unknown> = {};
      for (const field of ALLOWED_UPDATE_FIELDS) {
        if (params[field] !== undefined) updateFields[field] = params[field];
      }

      if (Object.keys(updateFields).length === 0) {
        return errorResponse({ code: "INVALID_INPUT", message: "No fields to update. Provide at least one field from the inputSchema." });
      }

      const { data, error } = await client
        .from("vault_modules")
        .update(updateFields)
        .eq("id", moduleId!)
        .select("id, slug, title, updated_at")
        .single();

      if (error) {
        logger.error("update failed", { error: error.message });
        return errorResponse({ code: classifyRpcError(error.message), message: error.message });
      }

      // Re-generate embedding if any embedding-relevant field was updated
      const embeddingFields = ["title", "description", "why_it_matters", "tags", "solves_problems", "usage_hint", "code"];
      const needsEmbedding = embeddingFields.some((f) => updateFields[f] !== undefined);
      if (needsEmbedding) {
        // Fetch current module data to build complete embedding input
        const { data: fullMod } = await client
          .from("vault_modules")
          .select("title, description, why_it_matters, usage_hint, tags, solves_problems")
          .eq("id", moduleId!)
          .single();
        if (fullMod) {
          updateModuleEmbedding(client, moduleId!, fullMod as Record<string, unknown>);
        }
      }

      const completeness = await getCompleteness(client, moduleId!);
      logger.info("module updated via MCP", { moduleId, userId: auth.userId, fields: Object.keys(updateFields) });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            module: data,
            _completeness: completeness,
            updated_fields: Object.keys(updateFields),
          }, null, 2),
        }],
      };
    },
  });
};
