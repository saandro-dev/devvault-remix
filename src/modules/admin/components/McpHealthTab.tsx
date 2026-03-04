/**
 * McpHealthTab — Admin tab showing MCP tool usage analytics,
 * knowledge gaps, and agent task metrics from vault_usage_events,
 * vault_knowledge_gaps, and vault_agent_tasks tables.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Search, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/edge-function-client";

interface McpHealthData {
  tool_usage: Array<{ tool_name: string; count: number }>;
  recent_gaps: Array<{ id: string; error_message: string; hit_count: number; status: string; domain: string | null }>;
  agent_tasks: { total: number; success: number; failure: number; active: number };
  top_searches: Array<{ query_text: string; count: number }>;
  total_events_24h: number;
}

function useMcpHealth() {
  return useQuery({
    queryKey: ["admin-mcp-health"],
    queryFn: () =>
      invokeEdgeFunction<McpHealthData>("admin-crud", { action: "mcp-health" }),
    refetchInterval: 60_000,
  });
}

export function McpHealthTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useMcpHealth();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">No data available.</p>;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Events (24h)</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.total_events_24h}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agent Tasks</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.agent_tasks.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.agent_tasks.success} success · {data.agent_tasks.failure} fail · {data.agent_tasks.active} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Knowledge Gaps</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.recent_gaps.length}</div>
            <p className="text-xs text-muted-foreground mt-1">open gaps</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tools Used</CardTitle>
            <Clock className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.tool_usage.length}</div>
            <p className="text-xs text-muted-foreground mt-1">distinct tools</p>
          </CardContent>
        </Card>
      </div>

      {/* Tool usage ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4" /> Tool Usage (All Time)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.tool_usage.map((t) => (
              <div key={t.tool_name} className="flex items-center justify-between">
                <span className="text-sm font-mono text-foreground">{t.tool_name}</span>
                <Badge variant="secondary">{t.count}</Badge>
              </div>
            ))}
            {data.tool_usage.length === 0 && (
              <p className="text-sm text-muted-foreground">No tool usage recorded yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top searches */}
      {data.top_searches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <Search className="h-4 w-4" /> Top Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.top_searches.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-foreground truncate max-w-[300px]">{s.query_text}</span>
                  <Badge variant="outline">{s.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Knowledge gaps */}
      {data.recent_gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Open Knowledge Gaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recent_gaps.map((g) => (
                <div key={g.id} className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-sm text-foreground">{g.error_message}</p>
                  <div className="flex items-center gap-2">
                    {g.domain && <Badge variant="outline" className="text-xs">{g.domain}</Badge>}
                    <Badge variant="secondary" className="text-xs">hits: {g.hit_count}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
