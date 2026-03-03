/**
 * project-api-keys-crud — CRUD for Project API Keys (Vault-backed).
 *
 * All keys are stored encrypted in Supabase Vault.
 * The key_value field in the api_keys table contains only '***' as a placeholder.
 * The real value is only returned on demand via the "read" action.
 *
 * Available actions:
 *   - list:   Lists keys in a folder (without the real value)
 *   - create: Stores a new key in Vault via store_project_api_key()
 *   - read:   Returns the decrypted value of a key via read_project_api_key()
 *   - delete: Removes the key from the table AND from Vault via delete_project_api_key()
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  handleCorsV2,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  getClientIp,
} from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";
import { sanitizeFields } from "../_shared/input-sanitizer.ts";

const TEXT_FIELDS = ["label"];

serve(withSentry("project-api-keys-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  const rateCheck = await checkRateLimit(getClientIp(req), "project-api-keys-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  try {
    const rawBody = await req.json();
    const body = sanitizeFields(rawBody, TEXT_FIELDS);
    const { action } = body;

    switch (action) {
      case "list": {
        const { folder_id } = body;
        if (!folder_id) {
          return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing folder_id", 422);
        }

        const { data, error } = await client
          .from("api_keys")
          .select("id, label, environment, created_at, vault_secret_id")
          .eq("folder_id", folder_id)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const items = (data ?? []).map((k: Record<string, unknown>) => ({
          id: k.id,
          label: k.label,
          environment: k.environment,
          created_at: k.created_at,
          has_value: k.vault_secret_id !== null,
        }));

        return createSuccessResponse(req, { items });
      }

      case "create": {
        const { project_id, folder_id, label, key_value, environment } = body;

        if (!project_id || !folder_id || !label || !key_value) {
          return createErrorResponse(
            req,
            ERROR_CODES.VALIDATION_ERROR,
            "Missing required fields: project_id, folder_id, label, key_value",
            422,
          );
        }

        const { data, error } = await client.rpc("store_project_api_key", {
          p_user_id: user.id,
          p_project_id: project_id,
          p_folder_id: folder_id,
          p_label: label,
          p_key_value: key_value,
          p_environment: environment || "dev",
        });

        if (error) throw error;

        return createSuccessResponse(req, { id: data }, 201);
      }

      case "read": {
        const { id } = body;
        if (!id) {
          return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        }

        const { data, error } = await client.rpc("read_project_api_key", {
          p_key_id: id,
          p_user_id: user.id,
        });

        if (error) throw error;
        if (!data) {
          return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Key not found or access denied", 404);
        }

        return createSuccessResponse(req, { value: data });
      }

      case "delete": {
        const { id } = body;
        if (!id) {
          return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Missing id", 422);
        }

        const { data, error } = await client.rpc("delete_project_api_key", {
          p_key_id: id,
          p_user_id: user.id,
        });

        if (error) throw error;
        if (!data) {
          return createErrorResponse(req, ERROR_CODES.NOT_FOUND, "Key not found or access denied", 404);
        }

        return createSuccessResponse(req, { success: true });
      }

      default:
        return createErrorResponse(
          req,
          ERROR_CODES.VALIDATION_ERROR,
          `Unknown action: ${action}. Valid: list, create, read, delete`,
          422,
        );
    }
  } catch (err) {
    throw err;
  }
}));
