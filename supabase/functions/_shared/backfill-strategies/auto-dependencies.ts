/**
 * auto-dependencies strategy — Links grouped modules by implementation_order.
 *
 * Pure data operation (no AI). Each module with implementation_order = N
 * gets a dependency on a module with implementation_order = N-1 in the
 * same module_group. Deterministic, idempotent, and re-runnable.
 *
 * Optimized: pre-computes all predecessors in fetchCandidates to avoid
 * per-row queries during persist.
 */

import type { BackfillStrategy } from "../backfill-engine.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AutoDepRow {
  id: string;
  module_group: string;
  implementation_order: number;
  /** Pre-resolved predecessor ID */
  predecessor_id: string;
}

export interface AutoDepResult {
  depends_on_id: string;
}

export const autoDependenciesStrategy: BackfillStrategy<AutoDepRow, AutoDepResult> = {
  name: "auto-dependencies",

  async fetchCandidates(client: SupabaseClient, limit: number): Promise<AutoDepRow[]> {
    // 1. Fetch ALL global modules with module_group (both candidates and potential predecessors)
    const allModules: Array<{ id: string; module_group: string; implementation_order: number; updated_at: string }> = [];
    let offset = 0;
    const pageSize = 500;

    while (true) {
      const { data, error } = await client
        .from("vault_modules")
        .select("id, module_group, implementation_order, updated_at")
        .eq("visibility", "global")
        .not("module_group", "is", null)
        .not("implementation_order", "is", null)
        .order("module_group")
        .order("implementation_order")
        .range(offset, offset + pageSize - 1);

      if (error) throw new Error(`fetchAll: ${error.message}`);
      if (!data || data.length === 0) break;
      allModules.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // 2. Build predecessor map: for each module, find the best predecessor
    //    (same group, highest order < current order)
    // Group modules by module_group
    const groupMap = new Map<string, typeof allModules>();
    for (const m of allModules) {
      const list = groupMap.get(m.module_group) ?? [];
      list.push(m);
      groupMap.set(m.module_group, list);
    }

    // For each candidate (order > 1), find predecessor with highest order < current
    const predecessorLookup = new Map<string, string>(); // module_id → predecessor_id
    for (const [, members] of groupMap) {
      // Sort by implementation_order ASC
      members.sort((a, b) => a.implementation_order - b.implementation_order);

      for (const m of members) {
        if (m.implementation_order <= 1) continue;
        // Find highest order < m.implementation_order
        let bestPred: typeof allModules[0] | null = null;
        for (const p of members) {
          if (p.implementation_order < m.implementation_order) {
            if (!bestPred || p.implementation_order > bestPred.implementation_order) {
              bestPred = p;
            }
          }
        }
        if (bestPred && bestPred.id !== m.id) {
          predecessorLookup.set(m.id, bestPred.id);
        }
      }
    }

    // 4. Get candidate IDs (all modules with order > 1 that have a predecessor)
    const candidateIds = [...predecessorLookup.keys()];

    // 5. Check existing deps (batch chunks)
    const hasDepSet = new Set<string>();
    for (let i = 0; i < candidateIds.length; i += 100) {
      const chunk = candidateIds.slice(i, i + 100);
      const { data: existingDeps, error: depErr } = await client
        .from("vault_module_dependencies")
        .select("module_id")
        .in("module_id", chunk);

      if (depErr) throw new Error(`checkDeps: ${depErr.message}`);
      for (const d of existingDeps ?? []) {
        hasDepSet.add(d.module_id);
      }
    }

    // 6. Build final list with pre-resolved predecessors
    const result: AutoDepRow[] = [];
    for (const m of allModules) {
      if (m.implementation_order <= 1) continue;
      if (hasDepSet.has(m.id)) continue;
      const predecessorId = predecessorLookup.get(m.id);
      if (!predecessorId) continue;

      result.push({
        id: m.id,
        module_group: m.module_group,
        implementation_order: m.implementation_order,
        predecessor_id: predecessorId,
      });

      if (result.length >= limit) break;
    }

    return result;
  },

  async process(row: AutoDepRow): Promise<AutoDepResult> {
    // Predecessor already resolved in fetchCandidates
    return { depends_on_id: row.predecessor_id };
  },

  validate(result: AutoDepResult): boolean {
    return typeof result.depends_on_id === "string" && result.depends_on_id.length > 10;
  },

  async persist(client: SupabaseClient, row: AutoDepRow, result: AutoDepResult): Promise<void> {
    const { error: insertErr } = await client
      .from("vault_module_dependencies")
      .insert({
        module_id: row.id,
        depends_on_id: result.depends_on_id,
        dependency_type: "required",
      });

    // Ignore unique constraint violations (idempotent)
    if (insertErr && !insertErr.message.includes("duplicate key")) {
      throw new Error(`insert: ${insertErr.message}`);
    }
  },
};
