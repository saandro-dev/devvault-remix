/**
 * changelog-seed strategy — Creates initial "v1" changelog entries.
 *
 * Pure data operation (no AI). Uses SQL RPC with LEFT JOIN to only
 * fetch modules that have zero changelog records. Idempotent and re-runnable.
 */

import type { BackfillStrategy } from "../backfill-engine.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ChangelogRow {
  id: string;
  title: string;
  version: string | null;
  created_at: string;
}

export interface ChangelogResult {
  version: string;
  changes: string[];
}

export const changelogSeedStrategy: BackfillStrategy<ChangelogRow, ChangelogResult> = {
  name: "changelog-seed",

  async fetchCandidates(client: SupabaseClient, limit: number): Promise<ChangelogRow[]> {
    const { data, error } = await client.rpc("fetch_modules_without_changelog", {
      p_limit: limit,
    });

    if (error) throw error;
    return (data ?? []) as ChangelogRow[];
  },

  async process(row: ChangelogRow): Promise<ChangelogResult> {
    return {
      version: row.version ?? "v1",
      changes: [`Initial version — module "${row.title}" published to global vault`],
    };
  },

  validate(_result: ChangelogResult): boolean {
    return true; // Deterministic data, always valid
  },

  async persist(client: SupabaseClient, row: ChangelogRow, result: ChangelogResult): Promise<void> {
    const { error } = await client
      .from("vault_module_changelog")
      .insert({
        module_id: row.id,
        version: result.version,
        changes: result.changes,
      });

    if (error) throw error;
  },
};
