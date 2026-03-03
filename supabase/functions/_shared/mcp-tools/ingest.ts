/**
 * mcp-tools/ingest.ts — devvault_ingest tool.
 *
 * Saves a new knowledge module to the vault with optional dependencies,
 * module_group, and completeness warnings.
 */

import { createLogger } from "../logger.ts";
import { batchInsertDependencies } from "../dependency-helpers.ts";
import { updateModuleEmbedding } from "../embedding-client.ts";
import { getCompleteness } from "./completeness.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:ingest");

export const registerIngestTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_ingest", {
    description:
      "Save a new knowledge module to the vault. Slug is auto-generated from title if " +
      "not provided. You can attach dependencies and assign a module_group. " +
      "STRONGLY ENCOURAGED: always provide why_it_matters and code_example for maximum " +
      "agent utility. Missing these fields will trigger a warning in the response.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Module title (required, English preferred)" },
        code: { type: "string", description: "The code content (required)" },
        description: { type: "string", description: "Brief description (English preferred)" },
        slug: { type: "string", description: "Custom slug (auto-generated from title if omitted)" },
        domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
        },
        module_type: {
          type: "string",
          enum: ["code_snippet", "full_module", "sql_migration", "architecture_doc", "playbook_phase", "pattern_guide"],
        },
        language: { type: "string", description: "Programming language (default: typescript)" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization (English)" },
        why_it_matters: { type: "string", description: "Why this knowledge is valuable (strongly encouraged)" },
        context_markdown: { type: "string", description: "Extended context in Markdown" },
        code_example: { type: "string", description: "Usage example (strongly encouraged)" },
        usage_hint: { type: "string", description: "When to use this module (strongly encouraged). E.g. 'Use when you need to receive WhatsApp status webhooks'" },
        source_project: { type: "string", description: "Source project name" },
        module_group: { type: "string", description: "Group name for related modules" },
        implementation_order: { type: "number", description: "Order within group (1-based)" },
        version: { type: "string", description: "Semantic version string (default: 'v1'). E.g.: 'v1', 'v2', '1.0.0'" },
        database_schema: { type: "string", description: "SQL migration/schema required for this module to work" },
        ai_metadata: {
          type: "object",
          properties: {
            npm_dependencies: { type: "array", items: { type: "string" }, description: "NPM packages required (e.g. ['axios', 'zod'])" },
            env_vars_required: { type: "array", items: { type: "string" }, description: "Environment variables needed (e.g. ['STRIPE_SECRET_KEY'])" },
            ai_rules: { type: "array", items: { type: "string" }, description: "AI-specific rules or anti-patterns for this module" },
          },
          description: "Structured metadata for AI agent consumption. Provides dependency/env context without parsing code.",
        },
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
          description: "Common errors and their fixes",
        },
        solves_problems: {
          type: "array", items: { type: "string" },
          description: "Problems this module solves (used for intent-based search)",
        },
        test_code: { type: "string", description: "Quick validation code to confirm the module works" },
        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"], description: "Implementation difficulty" },
        estimated_minutes: { type: "number", description: "Estimated implementation time in minutes" },
        prerequisites: {
          type: "array",
          items: { type: "object" },
          description: "Environment prerequisites (e.g. extensions, env vars, services)",
        },
        dependencies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              depends_on: { type: "string", description: "UUID or slug of the dependency module" },
              depends_on_id: { type: "string", description: "UUID of the dependency module (legacy, prefer depends_on)" },
              dependency_type: { type: "string", enum: ["required", "recommended"] },
            },
          },
          description: "Array of module dependencies. Use 'depends_on' with UUID or slug.",
        },
      },
      required: ["title", "code"],
    },
    handler: async (params: Record<string, unknown>) => {
      const warnings: string[] = [];
      if (!params.why_it_matters) warnings.push("why_it_matters is empty — agents benefit greatly from knowing WHY this module exists.");
      if (!params.code_example) warnings.push("code_example is empty — agents need usage examples to implement correctly.");
      if (!params.usage_hint) warnings.push("usage_hint is empty — agents need to know WHEN to use this module.");

      const insertData: Record<string, unknown> = {
        title: params.title,
        code: params.code,
        user_id: auth.userId,
        visibility: "global",
        validation_status: "draft",
        language: params.language ?? "typescript",
        tags: params.tags ?? [],
      };

      // Normalize ai_metadata: ensure valid structure with defaults
      const rawMeta = (params.ai_metadata as Record<string, unknown>) ?? {};
      insertData.ai_metadata = {
        npm_dependencies: Array.isArray(rawMeta.npm_dependencies) ? rawMeta.npm_dependencies : [],
        env_vars_required: Array.isArray(rawMeta.env_vars_required) ? rawMeta.env_vars_required : [],
        ai_rules: Array.isArray(rawMeta.ai_rules) ? rawMeta.ai_rules : [],
      };

      const optionalFields = [
        "slug", "description", "domain", "module_type", "why_it_matters",
        "context_markdown", "code_example", "usage_hint", "source_project", "module_group",
        "common_errors", "solves_problems", "test_code", "difficulty", "estimated_minutes",
        "prerequisites", "database_schema", "version",
      ];
      for (const field of optionalFields) {
        if (params[field]) insertData[field] = params[field];
      }
      if (params.implementation_order != null) insertData.implementation_order = params.implementation_order;

      const { data, error } = await client
        .from("vault_modules")
        .insert(insertData)
        .select("id, slug, title")
        .single();

      if (error) {
        logger.error("ingest failed", { error: error.message });
        return errorResponse({
          code: classifyRpcError(error.message),
          message: error.message,
          details: { title: params.title as string },
        });
      }

      const deps = params.dependencies as Array<{ depends_on_id?: string; depends_on?: string; dependency_type?: string }> | undefined;
      if (deps && deps.length > 0) {
        try {
          const depResult = await batchInsertDependencies(client, data.id, deps);
          if (depResult.failed.length > 0) {
            warnings.push(`Dependencies not found (skipped): ${depResult.failed.join(", ")}`);
          }
        } catch (depError) {
          warnings.push(`Dependencies partially failed: ${(depError as Error).message}`);
        }
      }

      // Fire-and-forget: generate embedding asynchronously
      updateModuleEmbedding(client, data.id, insertData);

      const completeness = await getCompleteness(client, data.id);
      logger.info("module ingested via MCP", { moduleId: data.id, userId: auth.userId });

      // Proactive quality assessment
      const score = completeness?.score ?? 0;
      const missingFields = completeness?.missing_fields ?? [];
      let qualityWarning: string | undefined;
      if (score < 50) {
        qualityWarning = "critical";
      } else if (score < 80) {
        qualityWarning = "low";
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            module: data,
            _completeness: completeness,
            _quality_warning: qualityWarning,
            _missing_for_100: missingFields.length > 0 ? missingFields : undefined,
            _warnings: warnings.length > 0 ? warnings : undefined,
            _hint: qualityWarning === "critical"
              ? `⚠️ CRITICAL: Module score is ${score}/100. Missing fields: ${missingFields.join(", ")}. ` +
                "Use devvault_update to add the missing fields NOW for maximum agent utility."
              : qualityWarning === "low"
              ? `⚠️ LOW QUALITY: Module score is ${score}/100. Consider adding: ${missingFields.join(", ")}.`
              : "Module created as 'draft'. Use devvault_get to verify it was saved correctly.",
          }, null, 2),
        }],
      };
    },
  });
};
