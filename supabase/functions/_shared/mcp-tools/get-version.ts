/**
 * mcp-tools/get-version.ts — devvault_get_version tool (Tool 31).
 *
 * Retrieves version history for a vault module.
 * Two modes:
 * - History mode (module_id only): Lists all version snapshots with metadata.
 * - Detail mode (module_id + version): Returns full code snapshot for that version.
 */

import { createLogger } from "../logger.ts";
import { errorResponse } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:get-version");

export const registerGetVersionTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_get_version", {
    description:
      "Retrieve version history for a module. " +
      "With only module_id or slug: returns list of all version snapshots (version, date, change summary). " +
      "With module_id + version: returns the full code snapshot for that specific version. " +
      "Useful for comparing changes, rolling back, or understanding evolution of a module.",
    inputSchema: {
      type: "object",
      properties: {
        module_id: { type: "string", description: "Module UUID" },
        slug: { type: "string", description: "Module slug (alternative to module_id)" },
        version: { type: "string", description: "Specific version to retrieve (e.g. 'v1'). Omit for history list." },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      logger.info("invoked", { params });
      try {
        let moduleId = params.module_id as string | undefined;
        const slug = params.slug as string | undefined;
        const version = params.version as string | undefined;

        // Resolve slug to module_id
        if (!moduleId && slug) {
          const { data: mod } = await client
            .from("vault_modules")
            .select("id")
            .eq("slug", slug)
            .eq("visibility", "global")
            .single();
          if (!mod) {
            return errorResponse({ code: "MODULE_NOT_FOUND", message: `No module found with slug: ${slug}` });
          }
          moduleId = (mod as Record<string, unknown>).id as string;
        }

        if (!moduleId) {
          return errorResponse({ code: "MISSING_PARAM", message: "Provide module_id or slug." });
        }

        // Specific version
        if (version) {
          const { data, error } = await client
            .from("vault_module_versions")
            .select("*")
            .eq("module_id", moduleId)
            .eq("version", version)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (error || !data) {
            return errorResponse({ code: "VERSION_NOT_FOUND", message: `Version '${version}' not found for this module.` });
          }

          trackUsage(client, auth, {
            event_type: "get_version",
            tool_name: "devvault_get_version",
            module_id: moduleId,
            query_text: version,
            result_count: 1,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        // History list
        const { data, error } = await client
          .from("vault_module_versions")
          .select("id, version, change_summary, created_at")
          .eq("module_id", moduleId)
          .order("created_at", { ascending: false });

        if (error) {
          logger.error("fetch versions failed", { error: error.message });
          return errorResponse({ code: "RPC_FAILURE", message: error.message });
        }

        const versions = (data ?? []) as Record<string, unknown>[];

        trackUsage(client, auth, {
          event_type: "get_version",
          tool_name: "devvault_get_version",
          module_id: moduleId,
          result_count: versions.length,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              module_id: moduleId,
              total_versions: versions.length,
              versions,
              _hint: versions.length > 0
                ? "Call devvault_get_version with module_id + version to get the full code snapshot."
                : "No version history yet. Versions are created automatically when code or context changes.",
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
