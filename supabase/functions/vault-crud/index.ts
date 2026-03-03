/**
 * vault-crud — Edge Function for vault module CRUD operations.
 *
 * Actions:
 *   - list:              Paginated, scoped module listing
 *   - get:               Single module fetch with access checks
 *   - create:            Insert a new module
 *   - update:            Partial update of owned module
 *   - delete:            Delete an owned module
 *   - search:            Multi-filter search via RPC
 *   - domain_counts:     Aggregated counts per domain
 *   - get_playbook:      Playbook phases grouped by saas_phase
 *   - share:             Share a module with another user
 *   - unshare:           Revoke a share
 *   - list_shares:       List shares for a module
 *   - add_dependency:    Add a module dependency
 *   - remove_dependency: Remove a module dependency
 *   - list_dependencies: List dependencies for a module
 *
 * Architecture: Modular handler delegation pattern.
 * Each action is handled by a dedicated module in ./handlers/.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsV2, createErrorResponse, ERROR_CODES, getClientIp } from "../_shared/api-helpers.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { withSentry } from "../_shared/sentry.ts";
import { createLogger } from "../_shared/logger.ts";
import { checkRateLimit } from "../_shared/rate-limit-guard.ts";
import { sanitizeFields, sanitizeStringArray } from "../_shared/input-sanitizer.ts";

import { handleList } from "./handlers/list.ts";
import { handleGet } from "./handlers/get.ts";
import { handleCreate } from "./handlers/create.ts";
import { handleUpdate } from "./handlers/update.ts";
import { handleDelete } from "./handlers/delete.ts";
import { handleSearch } from "./handlers/search.ts";
import { handleDomainCounts, handleGetPlaybook } from "./handlers/domain-counts.ts";
import { handleShare, handleUnshare, handleListShares } from "./handlers/sharing.ts";
import { handleAddDependency, handleRemoveDependency, handleListDependencies } from "./handlers/dependencies.ts";

const log = createLogger("vault-crud");

const TEXT_FIELDS = [
  "title", "description", "why_it_matters", "usage_hint",
  "code_example", "source_project", "phase_title", "context_markdown",
  "database_schema", "module_group",
];

serve(withSentry("vault-crud", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST allowed", 405);
  }

  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user, client } = auth;

  const rateCheck = await checkRateLimit(getClientIp(req), "vault-crud");
  if (rateCheck.blocked) {
    return createErrorResponse(req, ERROR_CODES.RATE_LIMITED, `Rate limited. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  try {
    const rawBody = await req.json();
    const body = sanitizeFields(rawBody, TEXT_FIELDS);
    if (body.tags) body.tags = sanitizeStringArray(body.tags);
    const { action } = body;
    log.info(`action=${action} user=${user.id}`);

    switch (action) {
      case "list":              return handleList(req, client, user, body);
      case "get":               return handleGet(req, client, user, body);
      case "create":            return handleCreate(req, client, user, body);
      case "update":            return handleUpdate(req, client, user, body);
      case "delete":            return handleDelete(req, client, user, body);
      case "search":            return handleSearch(req, client, user, body);
      case "domain_counts":     return handleDomainCounts(req, client, user, body);
      case "get_playbook":      return handleGetPlaybook(req, client, user);
      case "share":             return handleShare(req, client, user, body);
      case "unshare":           return handleUnshare(req, client, user, body);
      case "list_shares":       return handleListShares(req, client, user, body);
      case "add_dependency":    return handleAddDependency(req, client, user.id, body);
      case "remove_dependency": return handleRemoveDependency(req, client, body);
      case "list_dependencies": return handleListDependencies(req, client, body);
      default:
        return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, `Unknown action: ${action}`, 422);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error(message, { userId: user.id });
    throw err;
  }
}));
