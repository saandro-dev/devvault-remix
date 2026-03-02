/**
 * changelog-seed strategy — Creates initial "v1" changelog entries.
 *
 * Pure data operation (no AI). Uses LEFT JOIN to only fetch modules
 * that have zero changelog records. Idempotent and re-runnable.
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
    // Use RPC or raw query to do LEFT JOIN — PostgREST can't do LEFT JOIN natively.
    // Instead, fetch all global modules and existing changelog module_ids, then diff.
    const { data: modules, error: modErr } = await client
      .from("vault_modules")
      .select("id, title, version, created_at")
      .eq("visibility", "global")
      .limit(limit);

    if (modErr) throw modErr;
    if (!modules || modules.length === 0) return [];

    const { data: existingLogs, error: logErr } = await client
      .from("vault_module_changelog")
      .select("module_id");

    if (logErr) throw logErr;

    const existingIds = new Set((existingLogs ?? []).map((l: { module_id: string }) => l.module_id));

    return (modules as ChangelogRow[]).filter((m) => !existingIds.has(m.id));
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
