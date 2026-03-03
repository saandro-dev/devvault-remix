/**
 * mcp-tools/changelog.ts — devvault_changelog tool.
 *
 * Exposes the vault_module_changelog table, allowing agents to inspect
 * version history and understand the evolution of a module's decisions.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:changelog");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const registerChangelogTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_changelog", {
    description:
      "View version history of a module. Returns all changelog entries with version, " +
      "changes list, and timestamps. Use this to understand how a module evolved over time " +
      "and what decisions led to the current implementation. " +
      "Without id: returns the most recent changelog entries across all modules.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Module UUID or slug (auto-detected). Omit for recent changes across all modules.",
        },
        limit: { type: "number", description: "Max entries (default 20, max 50)" },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      const limit = Math.min(Number(params.limit ?? 20), 50);

      // ── Global recent changes mode ──
      if (!params.id) {
        const { data, error } = await client
          .from("vault_module_changelog")
          .select(`
            id, module_id, version, changes, created_at
          `)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) {
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }

        const entries = data as Array<Record<string, unknown>>;

        // Resolve module titles
        const moduleIds = [...new Set(entries.map((e) => e.module_id as string))];
        const { data: moduleMeta } = await client
          .from("vault_modules")
          .select("id, slug, title")
          .in("id", moduleIds);

        const metaMap = new Map(
          (moduleMeta as Array<{ id: string; slug: string; title: string }> ?? [])
            .map((m) => [m.id, { slug: m.slug, title: m.title }]),
        );

        const enriched = entries.map((e) => ({
          ...e,
          module_slug: metaMap.get(e.module_id as string)?.slug ?? null,
          module_title: metaMap.get(e.module_id as string)?.title ?? null,
        }));

        trackUsage(client, auth, {
          event_type: "changelog_global",
          tool_name: "devvault_changelog",
          result_count: enriched.length,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              mode: "global_recent",
              total_entries: enriched.length,
              entries: enriched,
              _hint: "Use devvault_changelog with a module id/slug for its full version history.",
            }, null, 2),
          }],
        };
      }

      // ── Single module changelog ──
      let moduleId = params.id as string;

      if (!UUID_RE.test(moduleId)) {
        const { data: found } = await client
          .from("vault_modules")
          .select("id, slug, title")
          .eq("slug", moduleId)
          .single();

        if (!found) {
          return errorResponse({ code: "MODULE_NOT_FOUND", message: `Module not found with slug: ${moduleId}` });
        }
        moduleId = found.id;
      }

      const [{ data: entries, error }, { data: modMeta }] = await Promise.all([
        client
          .from("vault_module_changelog")
          .select("id, version, changes, created_at")
          .eq("module_id", moduleId)
          .order("created_at", { ascending: false })
          .limit(limit),
        client
          .from("vault_modules")
          .select("slug, title, version")
          .eq("id", moduleId)
          .single(),
      ]);

      if (error) {
        return errorResponse({ code: classifyRpcError(error.message), message: error.message });
      }

      trackUsage(client, auth, {
        event_type: "changelog",
        tool_name: "devvault_changelog",
        module_id: moduleId,
        result_count: (entries as unknown[])?.length ?? 0,
      });

      logger.info("changelog fetched", { moduleId, entries: (entries as unknown[])?.length });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            mode: "single_module",
            module_id: moduleId,
            module_slug: (modMeta as Record<string, unknown>)?.slug ?? null,
            module_title: (modMeta as Record<string, unknown>)?.title ?? null,
            current_version: (modMeta as Record<string, unknown>)?.version ?? null,
            total_entries: (entries as unknown[])?.length ?? 0,
            entries: entries ?? [],
            _hint: "Entries are ordered newest first. Each entry shows what changed in that version.",
          }, null, 2),
        }],
      };
    },
  });
};
