import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { handleCorsV2, createErrorResponse, createSuccessResponse, ERROR_CODES, getClientIp } from "../_shared/api-helpers.ts";
import { withSentry } from "../_shared/sentry.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";
import { sanitizeFields } from "../_shared/input-sanitizer.ts";

const TEXT_FIELDS = ["display_name", "bio"];

Deno.serve(withSentry("profiles-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  const authResult = await authenticateRequest(req);
  if (isResponse(authResult)) return authResult;

  const { user, client } = authResult;

  const rateCheck = await checkRateLimit(getClientIp(req), "profiles-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  try {
    const rawBody = await req.json();
    const { action, payload: rawPayload } = rawBody;

    switch (action) {
      case "get": {
        const { data, error } = await client
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error) return createErrorResponse(req, ERROR_CODES.INTERNAL_ERROR, error.message, 500);
        return createSuccessResponse(req, data);
      }

      case "update": {
        const payload = sanitizeFields(rawPayload ?? {}, TEXT_FIELDS);
        const { display_name, bio, avatar_url } = payload;

        if (!display_name || typeof display_name !== "string" || display_name.trim().length === 0) {
          return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "display_name is required", 400);
        }

        const { data, error } = await client
          .from("profiles")
          .update({
            display_name: display_name.trim(),
            bio: bio ?? null,
            avatar_url: avatar_url ?? null,
          })
          .eq("id", user.id)
          .select()
          .single();

        if (error) return createErrorResponse(req, ERROR_CODES.INTERNAL_ERROR, error.message, 500);
        return createSuccessResponse(req, data);
      }

      default:
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, `Unknown action: ${action}`, 400);
    }
  } catch (err) {
    throw err;
  }
}));
