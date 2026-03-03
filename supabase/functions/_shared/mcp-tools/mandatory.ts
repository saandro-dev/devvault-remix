/**
 * mcp-tools/mandatory.ts — devvault_mandatory tool (Tool 29).
 *
 * Returns mandatory modules with enforcement levels, dependency trees,
 * and compliance status for the requesting agent's context.
 *
 * Agents use this to understand which modules MUST be implemented
 * before starting any new project or task.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";

const logger = createLogger("mcp-tool:mandatory");

export const registerMandatoryTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_mandatory", {
    description:
      "Returns all mandatory modules that MUST be implemented in any new project. " +
      "Includes enforcement level (hard = blocker, soft = warning), dependency order, " +
      "and reasons why each module is required. " +
      "Use this before starting implementation to understand the required foundation. " +
      "Filter by scope (global/domain/project_type) and layer (1-6).",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["global", "domain", "project_type"],
          description:
            "Filter scope. 'global' returns rules that apply everywhere. " +
            "'domain' returns domain-specific rules. Default: returns all global rules.",
        },
        scope_value: {
          type: "string",
          description:
            "When scope is 'domain', specify the domain (e.g. 'backend'). " +
            "When scope is 'project_type', specify the type (e.g. 'saas-with-auth').",
        },
        layer: {
          type: "integer",
          description:
            "Filter by architectural layer (1-6). " +
            "1=Edge Infrastructure, 2=Security/Audit, 3=Frontend Core, " +
            "4=Architecture/Patterns, 5=Auth/Sessions, 6=Compliance.",
        },
        check_compliance: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional: Array of module slugs already implemented. " +
            "Returns a compliance report showing which mandatory modules are missing.",
        },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      try {
        const scope = (params.scope as string) ?? "global";
        const scopeValue = (params.scope_value as string) ?? null;
        const layer = params.layer as number | undefined;
        const checkCompliance = params.check_compliance as string[] | undefined;

        // Call the DB function
        const { data, error } = await client.rpc("get_mandatory_modules", {
          p_scope: scope,
          p_scope_value: scopeValue,
          p_layer: layer ?? null,
        });

        if (error) {
          logger.error("Failed to fetch mandatory modules", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        const result = data as Record<string, unknown>;
        const rules = (result.rules ?? []) as Array<Record<string, unknown>>;

        // Build compliance report if check_compliance provided
        let complianceReport: Record<string, unknown> | null = null;
        if (checkCompliance && checkCompliance.length > 0) {
          const implementedSet = new Set(checkCompliance.map((s) => s.toLowerCase()));

          const missing: Array<Record<string, unknown>> = [];
          const satisfied: string[] = [];

          for (const rule of rules) {
            const slug = (rule.slug as string) ?? "";
            if (implementedSet.has(slug.toLowerCase())) {
              satisfied.push(slug);
            } else {
              missing.push({
                slug,
                title: rule.title,
                enforcement: rule.enforcement,
                layer: rule.layer,
                layer_name: rule.layer_name,
                reason: rule.reason,
              });
            }
          }

          const hardMissing = missing.filter((m) => m.enforcement === "hard");
          const softMissing = missing.filter((m) => m.enforcement === "soft");

          complianceReport = {
            total_mandatory: rules.length,
            satisfied_count: satisfied.length,
            missing_count: missing.length,
            hard_blockers: hardMissing.length,
            soft_warnings: softMissing.length,
            compliant: hardMissing.length === 0,
            satisfied_modules: satisfied,
            missing_modules: missing,
            _verdict:
              hardMissing.length > 0
                ? `BLOCKED: ${hardMissing.length} hard-enforcement module(s) missing. ` +
                  `You MUST implement these before proceeding: ${hardMissing.map((m) => m.slug).join(", ")}.`
                : softMissing.length > 0
                  ? `WARNING: ${softMissing.length} soft-enforcement module(s) missing. ` +
                    `Recommended but not blocking: ${softMissing.map((m) => m.slug).join(", ")}.`
                  : "COMPLIANT: All mandatory modules are implemented. You may proceed.",
          };
        }

        // Fetch dependency info for mandatory modules
        const moduleIds = rules.map((r) => r.module_id as string);
        let dependencyMap: Record<string, Array<Record<string, unknown>>> = {};

        if (moduleIds.length > 0) {
          const { data: deps } = await client
            .from("vault_module_dependencies")
            .select("module_id, depends_on_id, dependency_type")
            .in("module_id", moduleIds);

          if (deps && deps.length > 0) {
            const depModuleIds = [...new Set((deps as Array<Record<string, unknown>>).map((d) => d.depends_on_id as string))];
            const { data: depModules } = await client
              .from("vault_modules")
              .select("id, slug, title")
              .in("id", depModuleIds);

            const slugMap: Record<string, string> = {};
            for (const dm of (depModules ?? []) as Array<Record<string, unknown>>) {
              slugMap[dm.id as string] = dm.slug as string;
            }

            for (const dep of deps as Array<Record<string, unknown>>) {
              const mid = dep.module_id as string;
              if (!dependencyMap[mid]) dependencyMap[mid] = [];
              dependencyMap[mid].push({
                slug: slugMap[dep.depends_on_id as string] ?? dep.depends_on_id,
                type: dep.dependency_type,
              });
            }
          }
        }

        // Enrich rules with dependencies
        const enrichedRules = rules.map((r) => ({
          ...r,
          dependencies: dependencyMap[r.module_id as string] ?? [],
        }));

        trackUsage(client, auth, {
          event_type: "mandatory_check",
          tool_name: "devvault_mandatory",
        });

        logger.info("Mandatory modules returned", {
          total: rules.length,
          scope,
          has_compliance: !!complianceReport,
        });

        const response: Record<string, unknown> = {
          ...result,
          rules: enrichedRules,
          _instructions:
            "These modules are REQUIRED for any new project. " +
            "Modules with enforcement='hard' MUST be implemented — they are blockers. " +
            "Modules with enforcement='soft' are strongly recommended but won't block progress. " +
            "Use check_compliance parameter with your implemented module slugs to get a compliance report. " +
            "Implementation order: follow the 'layer' field (lower layers first).",
        };

        if (complianceReport) {
          response.compliance_report = complianceReport;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response, null, 2),
          }],
        };
      } catch (err) {
        logger.error("Unexpected error in mandatory", { error: (err as Error).message });
        return errorResponse({ code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    },
  });
};
