import {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  getClientIp,
} from "../../_shared/api-helpers.ts";
import { requireRole } from "../../_shared/role-validator.ts";
import { logApiCall } from "../../_shared/api-audit-logger.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export async function handleAdminRevokeApiKey(
  req: Request,
  client: SupabaseClient,
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  await requireRole(client, user.id, "owner");

  const { keyId } = body;

  if (!keyId) {
    return createErrorResponse(
      req,
      ERROR_CODES.VALIDATION_ERROR,
      "Missing keyId",
      422,
    );
  }

  const { error } = await client
    .from("devvault_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId as string)
    .is("revoked_at", null);

  if (error) throw error;

  logApiCall({
    userId: user.id,
    ipAddress: getClientIp(req),
    action: "admin.revoke-api-key",
    success: true,
    httpStatus: 200,
    requestBody: { keyId },
  });

  return createSuccessResponse(req, { success: true });
}
