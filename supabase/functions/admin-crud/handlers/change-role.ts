import {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  getClientIp,
} from "../../_shared/api-helpers.ts";
import { requireRole, isValidRole, type AppRole } from "../../_shared/role-validator.ts";
import { logApiCall } from "../../_shared/api-audit-logger.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleChangeRole(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  await requireRole(client, user.id, "owner");

  const { targetUserId, newRole } = body;

  if (!targetUserId || !newRole) {
    return createErrorResponse(
      req,
      ERROR_CODES.VALIDATION_ERROR,
      "Missing targetUserId or newRole",
      422,
    );
  }

  if (!isValidRole(newRole as string)) {
    return createErrorResponse(
      req,
      ERROR_CODES.VALIDATION_ERROR,
      `Invalid role: ${newRole}. Must be one of: owner, admin, moderator, user`,
      422,
    );
  }

  if (targetUserId === user.id) {
    return createErrorResponse(
      req,
      ERROR_CODES.VALIDATION_ERROR,
      "Cannot change your own role",
      422,
    );
  }

  const { data: existingRole } = await client
    .from("user_roles")
    .select("id")
    .eq("user_id", targetUserId as string)
    .maybeSingle();

  if (existingRole) {
    const { error } = await client
      .from("user_roles")
      .update({ role: newRole as AppRole })
      .eq("user_id", targetUserId as string);
    if (error) throw error;
  } else {
    const { error } = await client
      .from("user_roles")
      .insert({ user_id: targetUserId as string, role: newRole as AppRole });
    if (error) throw error;
  }

  logApiCall({
    userId: user.id,
    ipAddress: getClientIp(req),
    action: "admin.change-role",
    success: true,
    httpStatus: 200,
    requestBody: { targetUserId, newRole },
  });

  return createSuccessResponse(req, { success: true, newRole });
}
