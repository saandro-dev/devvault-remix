import { createSuccessResponse } from "../../_shared/api-helpers.ts";
import { getUserRole } from "../../_shared/role-validator.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleGetMyRole(
  req: Request,
  client: SupabaseClient,
  user: User,
): Promise<Response> {
  const role = await getUserRole(client, user.id);
  return createSuccessResponse(req, { role });
}
