/**
 * mcp-tools/load-context.ts — devvault_load_context tool.
 *
 * Loads all modules associated with a source_project OR matching tags,
 * returning complete code and metadata for project-scoped scaffolding.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:load-context");

export const registerLoadContextTool: ToolRegistrar = (server, client, auth) => {
  server.tool("devvault_load_context", {
    description:
      "Load all modules for a specific project or matching specific tags. Returns complete code, " +
      "metadata, and dependencies. Use 'project' to filter by source_project, or 'tags' to find " +
      "modules across all projects that match specific tags (e.g. ['evolution-api', 'whatsapp']). " +
      "Call without parameters to list all available projects.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "The source_project name (e.g. 'rise-zap'). Omit to list available projects.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter modules by tag overlap (e.g. ['evolution-api']). " +
            "Works in discovery mode (no project) to find cross-project modules, " +
            "or combined with project for narrower filtering.",
        },
        domain: {
          type: "string",
          enum: ["security", "backend", "frontend", "architecture", "devops", "saas_playbook"],
          description: "Optional domain filter within the project",
        },
        limit: { type: "number", description: "Max modules (default 50, max 100)" },
      },
      required: [],
    },
    handler: async (params: Record<string, unknown>) => {
      const project = params.project as string | undefined;
      const tags = params.tags as string[] | undefined;
      const domain = params.domain as string | undefined;
      const limit = Math.min(Number(params.limit ?? 50), 100);

      // ── Tag-based cross-project discovery ──
      if (!project && tags && tags.length > 0) {
        return await handleTagDiscovery(client, auth, tags, domain, limit);
      }

      // ── Discovery mode: list available projects ──
      if (!project) {
        return await handleProjectDiscovery(client);
      }

      // ── Load project context ──
      return await handleProjectLoad(client, auth, project, domain, limit, tags);
    },
  });
};

async function handleTagDiscovery(
  client: Parameters<ToolRegistrar>[1],
  auth: Parameters<ToolRegistrar>[2],
  tags: string[],
  domain: string | undefined,
  limit: number,
) {
  let query = client
    .from("vault_modules")
    .select(`
      id, slug, title, description, domain, module_type, language,
      code, code_example, context_markdown, tags, source_project,
      validation_status, related_modules, module_group,
      implementation_order, difficulty, estimated_minutes,
      why_it_matters, usage_hint, common_errors, prerequisites,
      solves_problems, test_code, created_at, updated_at
    `)
    .eq("visibility", "global")
    .in("validation_status", ["validated", "draft"])
    .overlaps("tags", tags)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (domain) query = query.eq("domain", domain);

  const { data: modules, error } = await query;
  if (error) {
    return errorResponse({ code: classifyRpcError(error.message), message: error.message });
  }

  const moduleList = (modules ?? []) as Record<string, unknown>[];
  const moduleIds = moduleList.map((m) => m.id as string);
  const deps = moduleIds.length > 0 ? await fetchDependencies(client, moduleIds) : new Map();

  const enriched = moduleList.map((m) => ({
    ...m,
    dependencies: deps.get(m.id as string) ?? [],
  }));

  trackUsage(client, auth, {
    event_type: "load_context",
    tool_name: "devvault_load_context",
    query_text: `tags:${tags.join(",")}`,
    result_count: enriched.length,
  });

  // Group by source_project for clarity
  const byProject: Record<string, number> = {};
  for (const m of enriched) {
    const sp = (m.source_project as string) || "unassigned";
    byProject[sp] = (byProject[sp] ?? 0) + 1;
  }

  logger.info("tag-based context loaded", { tags, count: enriched.length });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        mode: "tag_discovery",
        matched_tags: tags,
        total_modules: enriched.length,
        projects_found: byProject,
        modules: enriched,
        _hint:
          "Modules matched by tag overlap across all projects. " +
          "Use devvault_get with a slug for full details on any module.",
      }, null, 2),
    }],
  };
}

async function handleProjectDiscovery(client: Parameters<ToolRegistrar>[1]) {
  const { data, error } = await client
    .from("vault_modules")
    .select("source_project, tags")
    .eq("visibility", "global")
    .in("validation_status", ["validated", "draft"])
    .not("source_project", "is", null)
    .not("source_project", "eq", "");

  if (error) {
    return errorResponse({ code: classifyRpcError(error.message), message: error.message });
  }

  // Aggregate projects with counts and top tags
  const projectData: Record<string, { count: number; tags: Set<string> }> = {};
  for (const row of (data ?? []) as Array<{ source_project: string; tags: string[] }>) {
    if (!projectData[row.source_project]) {
      projectData[row.source_project] = { count: 0, tags: new Set() };
    }
    projectData[row.source_project].count++;
    for (const tag of (row.tags ?? [])) {
      projectData[row.source_project].tags.add(tag);
    }
  }

  const projects = Object.entries(projectData)
    .map(([name, d]) => ({
      name,
      module_count: d.count,
      top_tags: [...d.tags].slice(0, 10),
    }))
    .sort((a, b) => b.module_count - a.module_count);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        mode: "discovery",
        total_projects: projects.length,
        projects,
        _hint:
          "Use devvault_load_context with a project name to load all its modules, " +
          "OR use 'tags' parameter to find modules across projects by tag " +
          "(e.g. tags: ['evolution-api'] finds Evolution API modules regardless of source_project).",
      }, null, 2),
    }],
  };
}

async function handleProjectLoad(
  client: Parameters<ToolRegistrar>[1],
  auth: Parameters<ToolRegistrar>[2],
  project: string,
  domain: string | undefined,
  limit: number,
  tags: string[] | undefined,
) {
  let query = client
    .from("vault_modules")
    .select(`
      id, slug, title, description, domain, module_type, language,
      code, code_example, context_markdown, tags, source_project,
      validation_status, related_modules, module_group,
      implementation_order, difficulty, estimated_minutes,
      why_it_matters, usage_hint, common_errors, prerequisites,
      solves_problems, test_code, created_at, updated_at
    `)
    .eq("visibility", "global")
    .in("validation_status", ["validated", "draft"])
    .eq("source_project", project)
    .order("implementation_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (domain) query = query.eq("domain", domain);
  if (tags && tags.length > 0) query = query.overlaps("tags", tags);

  const { data: modules, error } = await query;
  if (error) {
    return errorResponse({ code: classifyRpcError(error.message), message: error.message });
  }

  const moduleList = (modules ?? []) as Record<string, unknown>[];
  const moduleIds = moduleList.map((m) => m.id as string);
  const depsMap = moduleIds.length > 0 ? await fetchDependencies(client, moduleIds) : new Map();

  const enriched = moduleList.map((m) => ({
    ...m,
    dependencies: depsMap.get(m.id as string) ?? [],
  }));

  trackUsage(client, auth, {
    event_type: "load_context",
    tool_name: "devvault_load_context",
    query_text: project,
    result_count: enriched.length,
  });

  logger.info("context loaded", { project, count: enriched.length });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        mode: "project_context",
        project,
        total_modules: enriched.length,
        modules: enriched,
        _hint:
          "Modules are ordered by implementation_order. " +
          "Each module includes its dependencies — implement required deps first.",
      }, null, 2),
    }],
  };
}

async function fetchDependencies(
  client: Parameters<ToolRegistrar>[1],
  moduleIds: string[],
): Promise<Map<string, Array<Record<string, unknown>>>> {
  const { data: allDeps } = await client
    .from("vault_module_dependencies")
    .select("module_id, depends_on_id, dependency_type")
    .in("module_id", moduleIds);

  const depsMap = new Map<string, Array<Record<string, unknown>>>();
  for (const dep of (allDeps ?? []) as Array<Record<string, unknown>>) {
    const key = dep.module_id as string;
    if (!depsMap.has(key)) depsMap.set(key, []);
    depsMap.get(key)!.push(dep);
  }
  return depsMap;
}
