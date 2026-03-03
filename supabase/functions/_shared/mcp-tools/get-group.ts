/**
 * mcp-tools/get-group.ts — devvault_get_group tool.
 *
 * Fetches all modules in a named group, ordered by implementation_order,
 * with dependencies pre-resolved and an implementation checklist in markdown.
 */

import { createLogger } from "../logger.ts";
import { enrichModuleDependencies } from "../dependency-helpers.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:get-group");

export const registerGetGroupTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_get_group", {
    description:
      "Fetch all modules in a group, ordered by implementation_order, with dependencies " +
      "pre-resolved and an implementation checklist in markdown. This is the " +
      "'give me everything I need to implement X' tool. " +
      "Example: devvault_get_group({ group: 'whatsapp-integration' }) returns all " +
      "WhatsApp modules in the correct implementation sequence.",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "string", description: "The module_group name (e.g. 'whatsapp-integration')" },
      },
      required: ["group"],
    },
    handler: async (params: Record<string, unknown>) => {
      const groupName = params.group as string;

      const { data: modules, error } = await client
        .from("vault_modules")
        .select("id, slug, title, description, domain, module_type, language, tags, why_it_matters, code_example, usage_hint, module_group, implementation_order, validation_status, difficulty, estimated_minutes")
        .eq("module_group", groupName)
        .order("implementation_order", { ascending: true, nullsFirst: false });

      if (error) {
        logger.error("get_group failed", { error: error.message });
        return errorResponse({ code: classifyRpcError(error.message), message: error.message });
      }

      if (!modules || modules.length === 0) {
        return errorResponse({ code: "MODULE_NOT_FOUND", message: `No modules found in group: ${groupName}` });
      }

      const enriched = await Promise.all(
        (modules as Record<string, unknown>[]).map(async (mod) => {
          const deps = await enrichModuleDependencies(client, mod.id as string);
          return { ...mod, dependencies: deps };
        }),
      );

      // Generate implementation checklist in markdown
      const totalMinutes = enriched.reduce((sum, m) => sum + (Number(m.estimated_minutes) || 0), 0);
      const checklist = generateChecklist(enriched, groupName, totalMinutes);

      trackUsage(client, auth, {
        event_type: "get_group",
        tool_name: "devvault_get_group",
        query_text: groupName,
        result_count: enriched.length,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            group: groupName,
            total_modules: enriched.length,
            total_estimated_minutes: totalMinutes || null,
            modules: enriched,
            _implementation_checklist: checklist,
            _instructions:
              "Implement these modules in order (by implementation_order). " +
              "For each module, call devvault_get to fetch the full code before implementing. " +
              "Respect required dependencies — implement them first.",
          }, null, 2),
        }],
      };
    },
  });
};

function generateChecklist(
  modules: Record<string, unknown>[],
  groupName: string,
  totalMinutes: number,
): string {
  const lines: string[] = [
    `# Implementation Checklist: ${groupName}`,
    "",
    `**Total modules:** ${modules.length}`,
  ];

  if (totalMinutes > 0) {
    lines.push(`**Estimated total time:** ~${totalMinutes} minutes`);
  }

  lines.push("", "## Steps", "");

  for (const mod of modules) {
    const order = mod.implementation_order ?? "?";
    const diff = mod.difficulty ? ` [${mod.difficulty}]` : "";
    const time = mod.estimated_minutes ? ` (~${mod.estimated_minutes}min)` : "";
    const deps = mod.dependencies as Array<Record<string, unknown>> | undefined;
    const requiredDeps = deps?.filter((d) => d.dependency_type === "required") ?? [];

    lines.push(`- [ ] **Step ${order}:** ${mod.title}${diff}${time}`);
    if (mod.description) lines.push(`  - ${mod.description}`);
    if (requiredDeps.length > 0) {
      lines.push(`  - ⚠️ Requires: ${requiredDeps.map((d) => d.title || d.slug || d.depends_on_id).join(", ")}`);
    }
  }

  return lines.join("\n");
}
