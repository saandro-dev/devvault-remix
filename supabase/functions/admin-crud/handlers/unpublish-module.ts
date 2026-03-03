import {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  getClientIp,
} from "../../_shared/api-helpers.ts";
import { requireRole } from "../../_shared/role-validator.ts";
import { logApiCall } from "../../_shared/api-audit-logger.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleUnpublishModule(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  await requireRole(client, user.id, "admin");

  const { moduleId } = body;

  if (!moduleId) {
    return createErrorResponse(
      req,
      ERROR_CODES.VALIDATION_ERROR,
      "Missing moduleId",
      422,
    );
  }

  const { error } = await client
    .from("vault_modules")
    .update({ visibility: "private" })
    .eq("id", moduleId as string)
    .eq("visibility", "global");

  if (error) throw error;

  logApiCall({
    userId: user.id,
    ipAddress: getClientIp(req),
    action: "admin.unpublish-module",
    success: true,
    httpStatus: 200,
    requestBody: { moduleId },
  });

  return createSuccessResponse(req, { success: true });
}
