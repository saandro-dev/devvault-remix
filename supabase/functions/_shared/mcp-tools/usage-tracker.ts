/**
 * mcp-tools/usage-tracker.ts — Fire-and-forget analytics tracker.
 *
 * Records usage events in vault_usage_events without blocking the response.
 * Uses the admin client to bypass RLS (service_role only).
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../logger.ts";
import type { AuthContext } from "./types.ts";

const logger = createLogger("mcp-usage-tracker");

/**
 * Comprehensive union of all event types used across MCP tools.
 * Keep in sync when adding new tools.
 */
type UsageEventType =
  // Discovery
  | "search"
  | "search_miss"
  | "get"
  | "list"
  | "get_group"
  | "get_playbook"
  | "load_context"
  | "quickstart"
  // CRUD
  | "ingest"
  | "batch_ingest"
  | "update"
  | "delete"
  | "validate"
  | "validate_batch"
  | "changelog"
  | "changelog_global"
  // Diagnostics
  | "diagnose"
  | "health_check"
  | "check_updates"
  | "export_tree"
  | "export_tree_roots"
  // Bug diary
  | "bug_reported"
  | "bug_resolved"
  | "success_reported"
  | "diary_listed"
  // Task tracking
  | "task_start"
  | "task_end"
  // Analytics
  | "similar"
  | "stats";

interface UsageEvent {
  event_type: UsageEventType;
  tool_name: string;
  module_id?: string;
  query_text?: string;
  result_count?: number;
}

/**
 * Records a usage event asynchronously (fire-and-forget).
 * Never throws — errors are logged but do not propagate.
 */
export function trackUsage(
  client: SupabaseClient,
  auth: AuthContext,
  event: UsageEvent,
): void {
  const row = {
    event_type: event.event_type,
    tool_name: event.tool_name,
    module_id: event.module_id ?? null,
    query_text: event.query_text ?? null,
    result_count: event.result_count ?? 0,
    user_id: auth.userId || null,
    api_key_id: auth.keyId || null,
  };

  // Fire-and-forget: do not await
  client
    .from("vault_usage_events")
    .insert(row)
    .then(({ error }) => {
      if (error) {
        logger.warn("Failed to track usage event", {
          event_type: event.event_type,
          error: error.message,
        });
      }
    });
}
