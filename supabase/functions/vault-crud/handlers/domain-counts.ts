/**
 * vault-crud/handlers/domain-counts.ts — Handles "domain_counts" and "get_playbook" actions.
 *
 * domain_counts: Aggregated module counts per domain via RPC.
 * get_playbook:  Playbook phases organized by saas_phase.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse } from "../../_shared/api-helpers.ts";

export async function handleDomainCounts(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { scope = "owned" } = body;

  const { data, error } = await client.rpc("get_domain_counts", {
    p_user_id: user.id,
    p_scope: scope,
  });
  if (error) throw error;

  const counts: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    counts[r.domain as string] = Number(r.count);
    grandTotal = Number(r.grand_total);
  }

  return createSuccessResponse(req, { counts, total: grandTotal });
}

export async function handleGetPlaybook(
  req: Request,
  client: SupabaseClient,
  user: User,
): Promise<Response> {
  const { data, error } = await client
    .from("vault_modules")
    .select("id,title,description,domain,module_type,saas_phase,phase_title,why_it_matters,code_example,tags,validation_status,source_project,language,visibility")
    .or(`user_id.eq.${user.id},visibility.eq.global`)
    .eq("module_type", "playbook_phase")
    .order("saas_phase", { ascending: true });
  if (error) throw error;

  const phases: Record<number, unknown[]> = {};
  for (const mod of data ?? []) {
    const phase = (mod as Record<string, unknown>).saas_phase as number ?? 0;
    if (!phases[phase]) phases[phase] = [];
    phases[phase].push(mod);
  }

  return createSuccessResponse(req, { phases, total: data?.length ?? 0 });
}
