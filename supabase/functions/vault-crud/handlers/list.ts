/**
 * vault-crud/handlers/list.ts — Handles the "list" action.
 *
 * Delegates to the `get_visible_modules` RPC for paginated, scoped listing.
 */

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { createSuccessResponse } from "../../_shared/api-helpers.ts";

export async function handleList(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const { scope = "owned", domain, module_type, query, limit = 50, offset = 0 } = body;

  const { data, error } = await client.rpc("get_visible_modules", {
    p_user_id: user.id,
    p_scope: scope,
    p_domain: domain || null,
    p_module_type: module_type || null,
    p_query: query || null,
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
