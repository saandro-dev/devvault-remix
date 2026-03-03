/**
 * vault-crud/handlers/search.ts — Handles the "search" action.
 *
 * Delegates to the `search_vault_modules` RPC with multi-filter support.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse } from "../../_shared/api-helpers.ts";

export async function handleSearch(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { query, domain, module_type, saas_phase, source_project, validated, limit = 20, offset = 0 } = body;

  const { data, error } = await client.rpc("search_vault_modules", {
    p_user_id: user.id,
    p_query: query || null,
    p_domain: domain || null,
    p_module_type: module_type || null,
    p_saas_phase: saas_phase ?? null,
    p_source: source_project || null,
    p_validated: validated ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;

  const rows = data ?? [];
  const total = rows.length > 0 ? (rows[0] as Record<string, unknown>).total_count as number : 0;
  const items = rows.map((r: Record<string, unknown>) => {
    const { total_count: _, ...rest } = r;
    return rest;
  });

  return createSuccessResponse(req, { items, total });
}
