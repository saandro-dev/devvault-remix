import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES, getClientIp } from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";
import { sanitizeFields } from "../_shared/input-sanitizer.ts";

const TEXT_FIELDS = ["name"];

serve(withSentry("folders-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  const rateCheck = await checkRateLimit(getClientIp(req), "folders-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  try {
    const rawBody = await req.json();
    const body = sanitizeFields(rawBody, TEXT_FIELDS);
    const { action } = body;

    switch (action) {
      case "list": {
        const { project_id } = body;
        if (!project_id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing project_id", 422);
        const { data, error } = await client
          .from("key_folders")
          .select("*")
          .eq("project_id", project_id)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return createSuccessResponse(req, { items: data });
      }

      case "get": {
        const { id } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const { data, error } = await client
          .from("key_folders")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data);
      }

      case "create": {
        const { project_id, name, color } = body;
        if (!project_id || !name) {
          return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing project_id or name", 422);
        }
        const { data, error } = await client
          .from("key_folders")
          .insert({
            user_id: user.id,
            project_id,
            name,
            color: color || "#6B7280",
          })
          .select()
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data, 201);
      }

      case "delete": {
        const { id } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const { error } = await client
          .from("key_folders")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return createSuccessResponse(req, { success: true });
      }

      default:
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, `Unknown action: ${action}`, 422);
    }
  } catch (err) {
    throw err;
  }
}));
