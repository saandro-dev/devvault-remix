/**
 * admin-crud/handlers/mcp-health.ts — MCP Health analytics handler.
 *
 * Returns aggregated MCP usage metrics: tool usage ranking,
 * open knowledge gaps, agent task stats, and top searches.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../../_shared/logger.ts";

const log = createLogger("admin:mcp-health");

export async function handleMcpHealth(client: SupabaseClient) {
  log.info("fetching MCP health data");

  const [toolUsage, gaps, taskStats, topSearches, events24h] = await Promise.all([
    // Tool usage ranking
    client.rpc("get_tool_usage_ranking").then((r) => r.data ?? []),
    // Open knowledge gaps
    client
      .from("vault_knowledge_gaps")
      .select("id, error_message, hit_count, status, domain")
      .eq("status", "open")
      .order("hit_count", { ascending: false })
      .limit(20),
    // Agent task stats
    client
      .from("vault_agent_tasks")
      .select("status"),
    // Top searches (last 30 days)
    client.rpc("get_top_searches").then((r) => r.data ?? []),
    // Events last 24h count
    client
      .from("vault_usage_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
  ]);

  // Aggregate task stats
  const tasks = (taskStats.data ?? []) as Array<{ status: string }>;
  const agentTasks = {
    total: tasks.length,
    success: tasks.filter((t) => t.status === "success").length,
    failure: tasks.filter((t) => t.status === "failure").length,
    active: tasks.filter((t) => t.status === "active").length,
  };

  return {
    tool_usage: toolUsage,
    recent_gaps: gaps.data ?? [],
    agent_tasks: agentTasks,
    top_searches: topSearches,
    total_events_24h: events24h.count ?? 0,
  };
}
