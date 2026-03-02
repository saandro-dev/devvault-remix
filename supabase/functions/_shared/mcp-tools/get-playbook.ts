/**
 * mcp-tools/get-playbook.ts — devvault_get_playbook tool (Tool 23).
 *
 * Two modes:
 * - List mode (no params): Returns all published playbooks with module counts.
 * - Detail mode (slug or id): Returns full playbook with ordered modules,
 *   complete code, aggregated database_schema, aggregated ai_metadata,
 *   and an implementation checklist.
 */

import { createLogger } from "../logger.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:get-playbook");

export const registerGetPlaybookTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_get_playbook", {
    description:
      "Fetch a structured playbook — a curated, ordered sequence of modules " +
      "representing a complete implementation plan. " +
      "Without parameters: lists all published playbooks with module counts. " +
      "With 'slug' or 'id': returns the full playbook with all modules in order, " +
      "complete code, aggregated database migrations, aggregated npm dependencies " +
      "and env vars, plus an implementation checklist. " +
      "This is the 'give me a complete project plan' tool.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Playbook slug (e.g. 'saas-mvp-v1'). Use this OR id.",
        },
        id: {
          type: "string",
          description: "Playbook UUID. Use this OR slug.",
        },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      const slug = params.slug as string | undefined;
      const id = params.id as string | undefined;

      // ─── LIST MODE ──────────────────────────────────────────────
      if (!slug && !id) {
        return await handleListMode(client, auth);
      }

      // ─── DETAIL MODE ───────────────────────────────────────────
      return await handleDetailMode(client, auth, { slug, id });
    },
  });
};

async function handleListMode(
  client: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient,
  auth: import("./types.ts").AuthContext,
) {
  const { data: playbooks, error } = await client
    .from("vault_playbooks")
    .select("id, slug, title, description, domain, tags, difficulty, status")
    .eq("status", "published")
    .order("title", { ascending: true });

  if (error) {
    logger.error("list playbooks failed", { error: error.message });
    return { content: [{ type: "text", text: `Error: ${error.message}` }] };
  }

  if (!playbooks || playbooks.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: 0,
          playbooks: [],
          _hint: "No published playbooks found. Playbooks are curated sequences of modules — ask the vault owner to create one.",
        }, null, 2),
      }],
    };
  }

  // Fetch module counts per playbook
  const playbookIds = playbooks.map((p: Record<string, unknown>) => p.id as string);
  const { data: junctions } = await client
    .from("vault_playbook_modules")
    .select("playbook_id")
    .in("playbook_id", playbookIds);

  const countMap: Record<string, number> = {};
  for (const j of (junctions ?? []) as Array<{ playbook_id: string }>) {
    countMap[j.playbook_id] = (countMap[j.playbook_id] || 0) + 1;
  }

  const enriched = playbooks.map((p: Record<string, unknown>) => ({
    ...p,
    module_count: countMap[p.id as string] || 0,
  }));

  trackUsage(client, auth, {
    event_type: "get_playbook",
    tool_name: "devvault_get_playbook",
    result_count: enriched.length,
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        total: enriched.length,
        playbooks: enriched,
        _hint: "Call devvault_get_playbook with a slug or id to get the full playbook with all modules and code.",
      }, null, 2),
    }],
  };
}

async function handleDetailMode(
  client: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient,
  auth: import("./types.ts").AuthContext,
  filter: { slug?: string; id?: string },
) {
  // Fetch playbook
  let query = client.from("vault_playbooks").select("*");
  if (filter.slug) {
    query = query.eq("slug", filter.slug);
  } else if (filter.id) {
    query = query.eq("id", filter.id);
  }

  const { data: playbook, error: pbError } = await query.single();

  if (pbError || !playbook) {
    const identifier = filter.slug || filter.id;
    logger.error("playbook not found", { identifier, error: pbError?.message });
    return {
      content: [{
        type: "text",
        text: `Playbook not found: ${identifier}. Use devvault_get_playbook() without params to list available playbooks.`,
      }],
    };
  }

  // Fetch junction entries ordered by position
  const { data: junctions, error: jError } = await client
    .from("vault_playbook_modules")
    .select("module_id, position, notes")
    .eq("playbook_id", (playbook as Record<string, unknown>).id)
    .order("position", { ascending: true });

  if (jError) {
    logger.error("fetch playbook modules failed", { error: jError.message });
    return { content: [{ type: "text", text: `Error fetching modules: ${jError.message}` }] };
  }

  if (!junctions || junctions.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          playbook,
          modules: [],
          _hint: "This playbook has no modules yet.",
        }, null, 2),
      }],
    };
  }

  // Fetch full module data
  const moduleIds = (junctions as Array<{ module_id: string }>).map((j) => j.module_id);
  const { data: modules, error: mError } = await client
    .from("vault_modules")
    .select(
      "id, slug, title, description, domain, module_type, language, tags, " +
      "why_it_matters, usage_hint, code, code_example, context_markdown, " +
      "database_schema, ai_metadata, difficulty, estimated_minutes, " +
      "common_errors, solves_problems, test_code, validation_status"
    )
    .in("id", moduleIds);

  if (mError) {
    logger.error("fetch modules failed", { error: mError.message });
    return { content: [{ type: "text", text: `Error fetching modules: ${mError.message}` }] };
  }

  // Build module map for ordering
  const moduleMap = new Map<string, Record<string, unknown>>();
  for (const m of (modules ?? []) as Record<string, unknown>[]) {
    moduleMap.set(m.id as string, m);
  }

  // Order modules by position and attach junction notes
  const orderedModules = (junctions as Array<{ module_id: string; position: number; notes: string | null }>)
    .map((j) => {
      const mod = moduleMap.get(j.module_id);
      if (!mod) return null;
      return {
        ...mod,
        _position: j.position,
        _playbook_notes: j.notes,
      };
    })
    .filter(Boolean);

  // Aggregate database_schema into combined migration
  const schemas = orderedModules
    .filter((m) => m && (m as Record<string, unknown>).database_schema)
    .map((m) => {
      const mod = m as Record<string, unknown>;
      return `-- Step ${mod._position}: ${mod.title}\n${mod.database_schema}`;
    });

  const combinedMigration = schemas.length > 0
    ? schemas.join("\n\n")
    : null;

  // Aggregate ai_metadata
  const allNpmDeps = new Set<string>();
  const allEnvVars = new Set<string>();
  const allAiRules = new Set<string>();

  for (const mod of orderedModules) {
    const meta = (mod as Record<string, unknown>).ai_metadata as Record<string, unknown> | undefined;
    if (!meta) continue;
    for (const dep of (meta.npm_dependencies as string[]) ?? []) allNpmDeps.add(dep);
    for (const env of (meta.env_vars_required as string[]) ?? []) allEnvVars.add(env);
    for (const rule of (meta.ai_rules as string[]) ?? []) allAiRules.add(rule);
  }

  // Generate checklist
  const totalMinutes = orderedModules.reduce(
    (sum, m) => sum + (Number((m as Record<string, unknown>).estimated_minutes) || 0),
    0,
  );
  const checklist = generatePlaybookChecklist(
    orderedModules as Record<string, unknown>[],
    (playbook as Record<string, unknown>).title as string,
    totalMinutes,
  );

  trackUsage(client, auth, {
    event_type: "get_playbook",
    tool_name: "devvault_get_playbook",
    query_text: filter.slug || filter.id,
    result_count: orderedModules.length,
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        playbook: {
          id: (playbook as Record<string, unknown>).id,
          slug: (playbook as Record<string, unknown>).slug,
          title: (playbook as Record<string, unknown>).title,
          description: (playbook as Record<string, unknown>).description,
          domain: (playbook as Record<string, unknown>).domain,
          tags: (playbook as Record<string, unknown>).tags,
          difficulty: (playbook as Record<string, unknown>).difficulty,
          status: (playbook as Record<string, unknown>).status,
        },
        total_modules: orderedModules.length,
        total_estimated_minutes: totalMinutes || null,
        modules: orderedModules,
        _combined_migration: combinedMigration,
        _aggregated_dependencies: {
          npm_dependencies: [...allNpmDeps],
          env_vars_required: [...allEnvVars],
          ai_rules: [...allAiRules],
        },
        _implementation_checklist: checklist,
        _instructions:
          "Implement these modules in order (by _position). " +
          "Each module includes complete code — no need to call devvault_get separately. " +
          "Run _combined_migration FIRST to set up the database, then implement modules in order.",
      }, null, 2),
    }],
  };
}

function generatePlaybookChecklist(
  modules: Record<string, unknown>[],
  title: string,
  totalMinutes: number,
): string {
  const lines: string[] = [
    `# Playbook: ${title}`,
    "",
    `**Total modules:** ${modules.length}`,
  ];

  if (totalMinutes > 0) {
    lines.push(`**Estimated total time:** ~${totalMinutes} minutes`);
  }

  lines.push("", "## Implementation Steps", "");

  for (const mod of modules) {
    const pos = mod._position ?? "?";
    const diff = mod.difficulty ? ` [${mod.difficulty}]` : "";
    const time = mod.estimated_minutes ? ` (~${mod.estimated_minutes}min)` : "";
    const hasSchema = mod.database_schema ? " 🗄️" : "";

    lines.push(`- [ ] **Step ${pos}:** ${mod.title}${diff}${time}${hasSchema}`);
    if (mod.description) lines.push(`  - ${mod.description}`);
    if (mod._playbook_notes) lines.push(`  - 📝 ${mod._playbook_notes}`);
  }

  return lines.join("\n");
}
