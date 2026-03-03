/**
 * mcp-tools/quickstart.ts — devvault_quickstart tool.
 *
 * Returns the most important/used modules for a given domain,
 * prioritizing validated modules and those with highest usage counts.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:quickstart");

export const registerQuickstartTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_quickstart", {
    description:
      "Get the top essential modules for a domain. Returns the most important modules " +
      "ranked by usage frequency and validation status. Use this when starting a new task " +
      "in a domain and need quick orientation on available building blocks. " +
      "Without domain: returns top modules across all domains.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
          description: "Domain to get quickstart modules for. Omit for cross-domain overview.",
        },
        module_type: {
          type: "string",
          enum: ["code_snippet", "full_module", "sql_migration", "architecture_doc", "playbook_phase", "pattern_guide"],
          description: "Optional module type filter",
        },
        limit: { type: "number", description: "Max results (default 10, max 20)" },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      const domain = params.domain as string | undefined;
      const moduleType = params.module_type as string | undefined;
      const limit = Math.min(Number(params.limit ?? 10), 20);

      logger.info("invoked", { domain, moduleType, limit });

      try {
        // Get usage counts for ranking
        const { data: usageData } = await client
          .from("vault_usage_events")
          .select("module_id")
          .not("module_id", "is", null)
          .in("event_type", ["get", "export_tree", "load_context"]);

        const usageCounts = new Map<string, number>();
        for (const event of (usageData ?? []) as Array<{ module_id: string }>) {
          usageCounts.set(event.module_id, (usageCounts.get(event.module_id) ?? 0) + 1);
        }

        // Fetch candidate modules
        let query = client
          .from("vault_modules")
          .select(`
            id, slug, title, description, domain, module_type, language,
            tags, why_it_matters, usage_hint, difficulty, estimated_minutes,
            validation_status, related_modules, module_group,
            source_project, solves_problems, created_at, updated_at
          `)
          .eq("visibility", "global")
          .in("validation_status", ["validated", "draft"])
          .order("updated_at", { ascending: false })
          .limit(100); // Fetch more to rank

        if (domain) query = query.eq("domain", domain);
        if (moduleType) query = query.eq("module_type", moduleType);

        const { data: modules, error } = await query;

        if (error) {
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        // Score and rank modules
        const scored = (modules ?? []).map((m: Record<string, unknown>) => {
          const usage = usageCounts.get(m.id as string) ?? 0;
          const isValidated = m.validation_status === "validated";
          const hasWhyItMatters = !!(m.why_it_matters as string);
          const hasSolvesProblems = ((m.solves_problems as string[])?.length ?? 0) > 0;

          // Composite score: validated (40) + usage (30) + metadata quality (30)
          const score =
            (isValidated ? 40 : 0) +
            Math.min(usage * 5, 30) +
            (hasWhyItMatters ? 15 : 0) +
            (hasSolvesProblems ? 15 : 0);

          return { ...m, _usage_count: usage, _quickstart_score: score };
        });

        scored.sort((a, b) => b._quickstart_score - a._quickstart_score);
        const topModules = scored.slice(0, limit);

        trackUsage(client, auth, {
          event_type: "quickstart",
          tool_name: "devvault_quickstart",
          query_text: domain ?? "all",
          result_count: topModules.length,
        });

        logger.info("quickstart complete", { domain, count: topModules.length });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              domain: domain ?? "all",
              total_results: topModules.length,
              modules: topModules,
              _hint:
                "Modules are ranked by importance (validated status + usage frequency + metadata quality). " +
                "Use devvault_get with a slug to fetch complete code and dependencies.",
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
