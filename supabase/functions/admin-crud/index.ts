/**
 * admin-crud — Edge Function for admin panel operations.
 *
 * Actions:
 *   - get-my-role:          Returns the authenticated user's role
 *   - list-users:           Returns all users with profiles and roles (admin+)
 *   - change-role:          Changes a target user's role (owner only)
 *   - admin-stats:          System health metrics (admin+)
 *   - list-api-keys:        All API keys with owner info (admin+)
 *   - admin-revoke-api-key: Force-revoke any user's API key (owner only)
 *   - list-global-modules:  All modules with visibility = 'global' (admin+)
 *   - unpublish-module:     Set module visibility back to 'private' (admin+)
 *
 * Architecture: Modular handler delegation pattern.
 * Each action is handled by a dedicated module in ./handlers/.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  handleCorsV2,
  createErrorResponse,
  ERROR_CODES,
  getClientIp,
} from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";

import { handleGetMyRole } from "./handlers/get-my-role.ts";
import { handleListUsers } from "./handlers/list-users.ts";
import { handleChangeRole } from "./handlers/change-role.ts";
import { handleAdminStats } from "./handlers/admin-stats.ts";
import { handleListApiKeys } from "./handlers/list-api-keys.ts";
import { handleAdminRevokeApiKey } from "./handlers/admin-revoke-api-key.ts";
import { handleListGlobalModules } from "./handlers/list-global-modules.ts";
import { handleUnpublishModule } from "./handlers/unpublish-module.ts";

serve(withSentry("admin-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  const rateCheck = await checkRateLimit(getClientIp(req), "admin-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(
      req,
      ERROR_CODES.RATE_LIMITED,
      `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`,
      429,
    );
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "get-my-role":
        return handleGetMyRole(req, client, user);
      case "list-users":
        return handleListUsers(req, client, user);
      case "change-role":
        return handleChangeRole(req, client, user, body);
      case "admin-stats":
        return handleAdminStats(req, client, user);
      case "list-api-keys":
        return handleListApiKeys(req, client, user);
      case "admin-revoke-api-key":
        return handleAdminRevokeApiKey(req, client, user, body);
      case "list-global-modules":
        return handleListGlobalModules(req, client, user);
      case "unpublish-module":
        return handleUnpublishModule(req, client, user, body);
      default:
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, `Unknown action: ${action}`, 422);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.startsWith("Insufficient permissions")) {
      return createErrorResponse(req, ERROR_CODES.FORBIDDEN, message, 403);
    }

    throw err;
  }
}));
