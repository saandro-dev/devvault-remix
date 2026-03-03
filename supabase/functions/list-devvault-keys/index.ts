import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES } from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("list-devvault-keys");

serve(withSentry("list-devvault-keys", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  try {
    log.info("listing keys", { userId: user.id });
    const { data, error } = await client
      .from("devvault_api_keys")
      .select("id, key_name, key_prefix, created_at, last_used_at, revoked_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return createSuccessResponse(req, { items: data });
  } catch (err) {
    throw err;
  }
}));
