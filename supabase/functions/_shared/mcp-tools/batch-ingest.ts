/**
 * mcp-tools/batch-ingest.ts — devvault_batch_ingest tool.
 *
 * Accepts an array of up to 20 modules and processes them in batch:
 * - Batch insert into vault_modules
 * - Parallel embedding generation
 * - Completeness scoring per module
 * - Aggregated result with per-module status
 */

import { createLogger } from "../logger.ts";
import { batchInsertDependencies } from "../dependency-helpers.ts";
import { updateModuleEmbedding } from "../embedding-client.ts";
import { getCompleteness } from "./completeness.ts";
import { trackUsage } from "./usage-tracker.ts";
import { errorResponse } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:batch-ingest");

const MAX_BATCH_SIZE = 20;

interface ModuleInput {
  title: string;
  code: string;
  description?: string;
  slug?: string;
  domain?: string;
  module_type?: string;
  language?: string;
  tags?: string[];
  why_it_matters?: string;
  context_markdown?: string;
  code_example?: string;
  usage_hint?: string;
  source_project?: string;
  module_group?: string;
  implementation_order?: number;
  version?: string;
  database_schema?: string;
  ai_metadata?: Record<string, unknown>;
  common_errors?: Array<{ error: string; cause: string; fix: string }>;
  solves_problems?: string[];
  test_code?: string;
  difficulty?: string;
  estimated_minutes?: number;
  prerequisites?: unknown[];
  dependencies?: Array<{ depends_on?: string; depends_on_id?: string; dependency_type?: string }>;
}

const OPTIONAL_FIELDS = [
  "slug", "description", "domain", "module_type", "why_it_matters",
  "context_markdown", "code_example", "usage_hint", "source_project", "module_group",
  "common_errors", "solves_problems", "test_code", "difficulty", "estimated_minutes",
  "prerequisites", "database_schema", "version",
] as const;

export const registerBatchIngestTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_batch_ingest", {
    description:
      "Ingest multiple modules at once (up to 20 per call). Each module follows the same " +
      "schema as devvault_ingest. Returns per-module results with completeness scores. " +
      "Use this for mass content migration instead of calling devvault_ingest in a loop.",
    inputSchema: {
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Module title (required)" },
              code: { type: "string", description: "Code content (required)" },
              description: { type: "string" },
              slug: { type: "string" },
              domain: { type: "string", enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"] },
              module_type: { type: "string", enum: ["code_snippet", "full_module", "sql_migration", "architecture_doc", "playbook_phase", "pattern_guide"] },
              language: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              why_it_matters: { type: "string" },
              context_markdown: { type: "string" },
              code_example: { type: "string" },
              usage_hint: { type: "string" },
              source_project: { type: "string" },
              module_group: { type: "string" },
              implementation_order: { type: "number" },
              version: { type: "string" },
              database_schema: { type: "string" },
              ai_metadata: { type: "object" },
              common_errors: { type: "array", items: { type: "object" } },
              solves_problems: { type: "array", items: { type: "string" } },
              test_code: { type: "string" },
              difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
              estimated_minutes: { type: "number" },
              prerequisites: { type: "array", items: { type: "object" } },
              dependencies: { type: "array", items: { type: "object" } },
            },
            required: ["title", "code"],
          },
          description: `Array of modules to ingest (max ${MAX_BATCH_SIZE})`,
          maxItems: MAX_BATCH_SIZE,
        },
      },
      required: ["modules"],
    },
    handler: async (params: Record<string, unknown>) => {
      const modules = params.modules as ModuleInput[];

      if (!modules || modules.length === 0) {
        return errorResponse({ code: "INVALID_INPUT", message: "modules array is required and must not be empty." });
      }
      if (modules.length > MAX_BATCH_SIZE) {
        return errorResponse({
          code: "INVALID_INPUT",
          message: `Maximum ${MAX_BATCH_SIZE} modules per batch. Received ${modules.length}.`,
        });
      }

      // Validate required fields
      for (let i = 0; i < modules.length; i++) {
        if (!modules[i].title || !modules[i].code) {
          return errorResponse({
            code: "INVALID_INPUT",
            message: `Module at index ${i} is missing required fields (title, code).`,
          });
        }
      }

      // Build insert rows
      const insertRows = modules.map((mod) => {
        const row: Record<string, unknown> = {
          title: mod.title,
          code: mod.code,
          user_id: auth.userId,
          visibility: "global",
          validation_status: "draft",
          language: mod.language ?? "typescript",
          tags: mod.tags ?? [],
        };

        // Normalize ai_metadata
        const rawMeta = mod.ai_metadata ?? {};
        row.ai_metadata = {
          npm_dependencies: Array.isArray(rawMeta.npm_dependencies) ? rawMeta.npm_dependencies : [],
          env_vars_required: Array.isArray(rawMeta.env_vars_required) ? rawMeta.env_vars_required : [],
          ai_rules: Array.isArray(rawMeta.ai_rules) ? rawMeta.ai_rules : [],
        };

        for (const field of OPTIONAL_FIELDS) {
          if (mod[field as keyof ModuleInput] !== undefined) {
            row[field] = mod[field as keyof ModuleInput];
          }
        }
        if (mod.implementation_order != null) row.implementation_order = mod.implementation_order;

        return row;
      });

      // Batch insert
      const { data: inserted, error } = await client
        .from("vault_modules")
        .insert(insertRows)
        .select("id, slug, title");

      if (error) {
        logger.error("batch insert failed", { error: error.message, count: modules.length });
        return errorResponse({
          code: "RPC_FAILURE",
          message: `Batch insert failed: ${error.message}`,
          details: { attempted: modules.length },
        });
      }

      const results: Array<Record<string, unknown>> = [];
      const insertedModules = inserted as Array<{ id: string; slug: string; title: string }>;

      // Process each inserted module in parallel: embeddings + completeness + dependencies
      await Promise.all(insertedModules.map(async (mod, i) => {
        const moduleInput = modules[i];
        const warnings: string[] = [];

        if (!moduleInput.why_it_matters) warnings.push("why_it_matters missing");
        if (!moduleInput.code_example) warnings.push("code_example missing");
        if (!moduleInput.usage_hint) warnings.push("usage_hint missing");

        // Dependencies
        const deps = moduleInput.dependencies;
        if (deps && deps.length > 0) {
          try {
            const depResult = await batchInsertDependencies(client, mod.id, deps);
            if (depResult.failed.length > 0) {
              warnings.push(`Dependencies not found: ${depResult.failed.join(", ")}`);
            }
          } catch (depError) {
            warnings.push(`Dependencies failed: ${(depError as Error).message}`);
          }
        }

        // Fire-and-forget embedding
        updateModuleEmbedding(client, mod.id, insertRows[i]);

        // Completeness
        const completeness = await getCompleteness(client, mod.id);

        results.push({
          id: mod.id,
          slug: mod.slug,
          title: mod.title,
          _completeness: completeness,
          _warnings: warnings.length > 0 ? warnings : undefined,
        });
      }));

      trackUsage(client, auth, {
        event_type: "batch_ingest",
        tool_name: "devvault_batch_ingest",
        result_count: insertedModules.length,
      });

      logger.info("batch ingest completed", {
        total: modules.length,
        inserted: insertedModules.length,
        userId: auth.userId,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            total_requested: modules.length,
            total_inserted: insertedModules.length,
            modules: results,
            _hint: "All modules created as 'draft'. Use devvault_validate to check each module's quality.",
          }, null, 2),
        }],
      };
    },
  });
};
