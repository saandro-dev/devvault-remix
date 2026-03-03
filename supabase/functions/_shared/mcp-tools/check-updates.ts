/**
 * mcp-tools/check-updates.ts — devvault_check_updates tool.
 *
 * Accepts a list of {slug, version} pairs from a project and compares
 * them against the current versions in the vault. Returns which modules
 * have newer versions available, enabling agents to suggest upgrades.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:check-updates");

/** Strips leading "v"/"V" prefix and trims whitespace for consistent comparison. */
function normalizeVersion(v: string): string {
  return v.replace(/^v/i, "").trim();
}

interface ModuleVersionInput {
  slug: string;
  version: string;
}

interface UpdateCheckResult {
  slug: string;
  local_version: string;
  vault_version: string;
  needs_update: boolean;
  module_id: string;
  title: string;
  changelog: Array<{ version: string; changes: string[]; created_at: string }>;
}

export const registerCheckUpdatesTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_check_updates", {
    description:
      "Check if modules used in a project have newer versions in the vault. " +
      "Pass an array of {slug, version} pairs. Returns which modules are outdated " +
      "and includes the changelog of changes since the local version. " +
      "Use this to keep projects up-to-date with the latest vault knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slug: { type: "string", description: "Module slug" },
              version: { type: "string", description: "Current version in the project (e.g. 'v1')" },
            },
            required: ["slug", "version"],
          },
          description: "Array of {slug, version} pairs to check",
        },
      },
      required: ["modules"],
    },
    handler: async (params: Record<string, unknown>) => {
      const modules = params.modules as ModuleVersionInput[] | undefined;

      if (!modules || modules.length === 0) {
        return errorResponse({ code: "INVALID_INPUT", message: "Provide at least one module in 'modules' array." });
      }

      if (modules.length > 50) {
        return errorResponse({ code: "INVALID_INPUT", message: "Maximum 50 modules per check." });
      }

      const slugs = modules.map((m) => m.slug);

      // Fetch current vault versions for all slugs in one query
      const { data: vaultModules, error } = await client
        .from("vault_modules")
        .select("id, slug, title, version")
        .in("slug", slugs)
        .eq("visibility", "global");

      if (error) {
        logger.error("check_updates failed", { error: error.message });
        return errorResponse({ code: classifyRpcError(error.message), message: error.message });
      }

      const vaultMap = new Map(
        (vaultModules ?? []).map((vm: Record<string, unknown>) => [
          vm.slug as string,
          vm,
        ]),
      );

      const results: UpdateCheckResult[] = [];
      const notFound: string[] = [];
      const outdatedIds: string[] = [];

      for (const mod of modules) {
        const vaultMod = vaultMap.get(mod.slug) as Record<string, unknown> | undefined;

        if (!vaultMod) {
          notFound.push(mod.slug);
          continue;
        }

        const vaultVersion = (vaultMod.version as string) ?? "v1";
        const needsUpdate = normalizeVersion(vaultVersion) !== normalizeVersion(mod.version);

        if (needsUpdate) {
          outdatedIds.push(vaultMod.id as string);
        }

        results.push({
          slug: mod.slug,
          local_version: mod.version,
          vault_version: vaultVersion,
          needs_update: needsUpdate,
          module_id: vaultMod.id as string,
          title: vaultMod.title as string,
          changelog: [],
        });
      }

      // Fetch changelogs for outdated modules in one query
      if (outdatedIds.length > 0) {
        const { data: changelogs } = await client
          .from("vault_module_changelog")
          .select("module_id, version, changes, created_at")
          .in("module_id", outdatedIds)
          .order("created_at", { ascending: false })
          .limit(100);

        if (changelogs) {
          const changelogMap = new Map<string, Array<{ version: string; changes: string[]; created_at: string }>>();
          for (const cl of changelogs as Record<string, unknown>[]) {
            const moduleId = cl.module_id as string;
            if (!changelogMap.has(moduleId)) {
              changelogMap.set(moduleId, []);
            }
            changelogMap.get(moduleId)!.push({
              version: cl.version as string,
              changes: cl.changes as string[],
              created_at: cl.created_at as string,
            });
          }

          for (const result of results) {
            if (result.needs_update) {
              result.changelog = changelogMap.get(result.module_id) ?? [];
            }
          }
        }
      }

      const outdatedCount = results.filter((r) => r.needs_update).length;

      trackUsage(client, auth, {
        event_type: "check_updates",
        tool_name: "devvault_check_updates",
        result_count: outdatedCount,
      });

      logger.info("check_updates completed", {
        checked: modules.length,
        outdated: outdatedCount,
        notFound: notFound.length,
        userId: auth.userId,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            checked: modules.length,
            outdated: outdatedCount,
            not_found: notFound.length > 0 ? notFound : undefined,
            results,
            _hint: outdatedCount > 0
              ? `${outdatedCount} module(s) have newer versions. Use devvault_get to fetch the latest code and refactor your project.`
              : "All modules are up to date.",
          }, null, 2),
        }],
      };
    },
  });
};
