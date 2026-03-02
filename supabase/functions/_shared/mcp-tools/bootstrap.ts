/**
 * mcp-tools/bootstrap.ts — devvault_bootstrap tool.
 *
 * Returns the full index of the Knowledge Graph (domains, playbook phases,
 * top validated modules, playbooks index) PLUS an _agent_guide with workflow
 * instructions, tool catalog, behavioral rules, and anti-patterns.
 *
 * This is the ONLY entry point an AI agent needs — no external docs required.
 *
 * Tools: 25 total.
 */

import { createLogger } from "../logger.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:bootstrap");

// ─── AGENT GUIDE (inline workflow documentation) ────────────────────────────
// Lives here so it's impossible to desynchronize from the actual tool set.
// Update this object whenever a tool is added, removed, or renamed.

const AGENT_GUIDE = {
  _purpose:
    "This guide teaches AI agents how to use DevVault's 25 MCP tools effectively. " +
    "Read it once after bootstrap, then follow the workflow. " +
    "CRITICAL: When debugging errors, ALWAYS consult devvault_diagnose BEFORE manual fixes.",

  recommended_workflow: [
    "0. TASK START — Call devvault_task_start with your objective to begin tracking this work session.",
    "1. BOOTSTRAP — You already called this. Review domains, phases, playbooks, and top modules below.",
    "2. CHECK PLAYBOOKS — Review playbooks_index below. If a playbook matches your goal, call devvault_get_playbook to get the full plan.",
    "3. DISCOVER — Use devvault_search (semantic + full-text) or devvault_list (browsing with filters) to find relevant modules.",
    "4. RETRIEVE — Use devvault_get (by id or slug) to fetch full code, dependencies, and context_markdown.",
    "5. CHECK DEPENDENCIES — If the module has prerequisites, fetch each one with devvault_get before implementing.",
    "6. IMPLEMENT — Apply the code. If you encounter problems, use devvault_diagnose or devvault_diary_bug.",
    "7. REPORT OUTCOME — Use devvault_report_success on success, or devvault_diary_bug on failure.",
    "8. CONTRIBUTE BACK — Use devvault_ingest to add new reusable knowledge you created during implementation.",
    "9. TASK END — Call devvault_task_end with your task_id, status (success/failure/abandoned), and modules_used.",
  ],

  tool_catalog: {
    discovery: {
      devvault_bootstrap:
        "Returns knowledge graph index + this guide. ALWAYS call first.",
      devvault_search:
        "Hybrid search (semantic + full-text). Use for finding modules by problem description or keywords.",
      devvault_list:
        "Paginated listing with filters (domain, module_type, saas_phase, tags). Use for browsing.",
      devvault_domains:
        "Lists all domains with module counts and available module_types.",
      devvault_get:
        "Fetches a single module's full content (code, dependencies, context_markdown). Use after search/list.",
      devvault_get_group:
        "Fetches all modules in a module_group. Useful for multi-part implementations.",
      devvault_get_playbook:
        "Fetches a curated playbook — an ordered sequence of modules with full code, " +
        "aggregated database migrations, and implementation checklist. " +
        "Without params: lists all published playbooks. With slug/id: returns the full plan.",
      devvault_load_context:
        "Loads all modules for a source_project OR matching specific tags. Use tags for cross-project discovery " +
        "(e.g. tags: ['evolution-api'] finds modules regardless of source_project). Call without params to list projects.",
      devvault_quickstart:
        "Returns a curated onboarding sequence for a specific domain.",
    },
    crud: {
      devvault_ingest:
        "Creates a new module. MUST include: title, code, language, why_it_matters, code_example.",
      devvault_update:
        "Updates an existing module's fields. Supports ai_metadata, tags, code, description, etc.",
      devvault_delete:
        "Permanently deletes a module by id. Ownership enforced.",
      devvault_validate:
        "Returns completeness score and missing fields for a module. " +
        "Includes intelligent detection of database_schema requirement for backend/architecture modules. " +
        "Use before marking as validated.",
      devvault_changelog:
        "Records a version bump with a list of changes for a module.",
    },
    diagnostics: {
      devvault_diagnose:
        "Analyzes an error message against the knowledge base. Returns matching modules and suggested fixes.",
      devvault_check_updates:
        "Checks if modules used in a project have newer versions available.",
      devvault_export_tree:
        "Exports the full module dependency tree as a structured object.",
    },
    bug_diary: {
      devvault_report_bug:
        "Reports a bug found in a vault module (not user project bugs — use diary_bug for those).",
      devvault_resolve_bug:
        "Marks a vault module bug as resolved with a solution.",
      devvault_diary_bug:
        "Records a bug in the user's personal bug diary. Auto-sets status based on whether solution is provided.",
      devvault_diary_resolve:
        "Resolves an existing bug diary entry with cause_code and solution. Ownership enforced.",
      devvault_diary_list:
        "Lists and searches the user's bug diary entries. Filter by status, tags, project, or text. Use to find bug_ids for resolving and to avoid duplicates.",
    },
    reporting: {
      devvault_report_success:
        "Records that a module was successfully used. Helps track which modules are battle-tested.",
    },
    task_tracking: {
      devvault_task_start:
        "Start tracking a high-level task. Returns a task_id. Call at the BEGINNING of every work session.",
      devvault_task_end:
        "End a task with status (success/failure/abandoned), modules_used, and outcome_notes. " +
        "Call at the END of every work session. This data helps measure module ROI.",
    },
  },

  behavioral_rules: [
    "ALWAYS call devvault_bootstrap first to understand available knowledge before searching.",
    "ALWAYS call devvault_task_start at the beginning of a work session to track your objective.",
    "ALWAYS call devvault_task_end at the end of a work session with the correct status and modules_used.",
    "CHECK playbooks_index for curated implementation plans before searching module by module.",
    "ALWAYS fetch required dependencies (prerequisites) before implementing a module.",
    "ALWAYS check devvault_validate before marking a module as validated.",
    "When debugging errors in Edge Functions or external APIs, ALWAYS call devvault_diagnose with the error message BEFORE attempting manual fixes.",
    "Use devvault_diary_bug to document ANY problem encountered during implementation — this builds institutional memory.",
    "ALWAYS search existing bugs with devvault_diary_list before creating new ones to avoid duplicates.",
    "Use devvault_report_success after successful implementation — this tracks module reliability.",
    "Prefer devvault_search over devvault_list when you know what problem you're solving.",
    "Prefer devvault_list over devvault_search when browsing a domain or exploring available knowledge.",
    "When a module has context_markdown, ALWAYS read it — it contains critical architecture decisions.",
    "When ingesting new modules, include why_it_matters and code_example — modules without these are considered incomplete.",
    "Use devvault_load_context with 'tags' parameter to find modules across projects (e.g. tags: ['evolution-api'] finds all Evolution API modules regardless of source_project).",
  ],

  anti_patterns: [
    "Do NOT ingest modules without why_it_matters and code_example — they will fail validation.",
    "Do NOT implement a module without first fetching its dependencies — you will miss required context.",
    "Do NOT skip devvault_diagnose when encountering errors — the knowledge base likely has a solution.",
    "Do NOT create duplicate modules — always search first to check if similar knowledge exists.",
    "Do NOT ignore _hint and _instructions fields in tool responses — they guide your next action.",
    "Do NOT use devvault_report_bug for user project bugs — use devvault_diary_bug instead.",
    "Do NOT forget to call devvault_task_end — abandoned tasks without closure pollute analytics.",
  ],
};

export const registerBootstrapTool: ToolRegistrar = (server, client) => {
  server.tool("devvault_bootstrap", {
    description:
      "ALWAYS call this first. Returns the full index of the DevVault Knowledge Graph: " +
      "domains, playbook phases, published playbooks, top validated modules, AND a complete " +
      "workflow guide explaining how to use all 25 tools effectively.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => {
      logger.info("invoked");
      try {
        const { data, error } = await client.rpc("bootstrap_vault_context");
        logger.info("RPC result", {
          success: !error,
          error: error?.message,
        });
        if (error) {
          logger.error("bootstrap failed", { error: error.message });
          return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        }

        // Fetch published playbooks index
        const { data: playbooks } = await client
          .from("vault_playbooks")
          .select("id, slug, title, description, domain, difficulty, status")
          .eq("status", "published")
          .order("title", { ascending: true });

        let playbooksIndex: Record<string, unknown>[] = [];
        if (playbooks && playbooks.length > 0) {
          const pbIds = (playbooks as Array<{ id: string }>).map((p) => p.id);
          const { data: junctions } = await client
            .from("vault_playbook_modules")
            .select("playbook_id")
            .in("playbook_id", pbIds);

          const countMap: Record<string, number> = {};
          for (const j of (junctions ?? []) as Array<{ playbook_id: string }>) {
            countMap[j.playbook_id] = (countMap[j.playbook_id] || 0) + 1;
          }

          playbooksIndex = (playbooks as Record<string, unknown>[]).map((p) => ({
            slug: p.slug,
            title: p.title,
            description: p.description,
            domain: p.domain,
            difficulty: p.difficulty,
            module_count: countMap[p.id as string] || 0,
          }));
        }

        const response = {
          _agent_guide: AGENT_GUIDE,
          knowledge_graph: data,
          playbooks_index: playbooksIndex,
        };

        return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
      } catch (err) {
        logger.error("uncaught error", { error: String(err) });
        return { content: [{ type: "text", text: `Uncaught error: ${String(err)}` }] };
      }
    },
  });
};
