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

interface UsageEvent {
  event_type: "search" | "get" | "list" | "get_group" | "diagnose" | "search_miss" | "bug_reported" | "bug_resolved" | "success_reported" | "export_tree" | "check_updates" | "get_playbook" | "task_start" | "task_end" | "validate" | "validate_batch";
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
