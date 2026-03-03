import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES, getClientIp } from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";
import { sanitizeFields, sanitizeStringArray } from "../_shared/input-sanitizer.ts";

const TEXT_FIELDS = ["title", "symptom", "cause_code", "solution"];

serve(withSentry("bugs-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  const rateCheck = await checkRateLimit(getClientIp(req), "bugs-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  try {
    const rawBody = await req.json();
    const body = sanitizeFields(rawBody, TEXT_FIELDS);
    const { action } = body;

    switch (action) {
      case "list": {
        const { data, error } = await client
          .from("bugs")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return createSuccessResponse(req, { items: data });
      }

      case "create": {
        const { title, symptom, cause_code, solution, project_id, vault_module_id, tags } = body;
        if (!title || !symptom) {
          return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing title or symptom", 422);
        }
        const { data, error } = await client
          .from("bugs")
          .insert({
            user_id: user.id,
            title,
            symptom,
            cause_code: cause_code || null,
            solution: solution || null,
            status: solution ? "resolved" : "open",
            project_id: project_id || null,
            vault_module_id: vault_module_id || null,
            tags: sanitizeStringArray(tags),
          })
          .select()
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data, 201);
      }

      case "update": {
        const { id, status, title, symptom, cause_code, solution, tags } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const updateFields: Record<string, unknown> = {};
        if (status !== undefined) updateFields.status = status;
        if (title !== undefined) updateFields.title = title;
        if (symptom !== undefined) updateFields.symptom = symptom;
        if (cause_code !== undefined) updateFields.cause_code = cause_code || null;
        if (solution !== undefined) updateFields.solution = solution || null;
        if (tags !== undefined) updateFields.tags = sanitizeStringArray(tags);

        const { data, error } = await client
          .from("bugs")
          .update(updateFields)
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();
        if (error) throw error;
        return createSuccessResponse(req, data);
      }

      case "delete": {
        const { id } = body;
        if (!id) return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        const { error } = await client
          .from("bugs")
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
