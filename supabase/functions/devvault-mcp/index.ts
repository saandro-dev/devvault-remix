/**
 * devvault-mcp/index.ts — Universal MCP Server for AI Agents (v6.0).
 *
 * Thin shell: Hono router, CORS, auth middleware, MCP transport.
 * All tool logic lives in _shared/mcp-tools/ (one file per tool).
 *
 * IMPORTANT: McpServer, transport, and tools are singletons (module-level).
 * Auth is a mutable object updated per-request — safe because Edge Functions
 * are single-threaded.
 *
 * Tools (25): devvault_bootstrap, devvault_search, devvault_get,
 *             devvault_list, devvault_domains, devvault_ingest,
 *             devvault_update, devvault_get_group, devvault_validate,
 *             devvault_delete, devvault_diagnose, devvault_report_bug,
 *             devvault_resolve_bug, devvault_report_success,
 *             devvault_export_tree, devvault_check_updates,
 *             devvault_load_context, devvault_quickstart, devvault_changelog,
 *             devvault_diary_bug, devvault_diary_resolve, devvault_diary_list,
 *             devvault_get_playbook, devvault_task_start, devvault_task_end.
 */

import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import { authenticateRequest } from "../_shared/mcp-tools/auth.ts";
import { registerAllTools } from "../_shared/mcp-tools/register.ts";
import type { AuthContext } from "../_shared/mcp-tools/types.ts";

const logger = createLogger("devvault-mcp");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, accept, authorization, x-devvault-key, x-api-key, " +
    "mcp-session-id, mcp-protocol-version, " +
    "x-client-info, apikey, x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ─── MODULE-LEVEL SINGLETONS ────────────────────────────────────────────────
const client = getSupabaseClient("general");
const mcp = new McpServer({
  name: "devvault",
  version: "6.0.0",
  logger: {
    error: (...args: unknown[]) => console.error("[MCP:LIB]", ...args),
    warn: (...args: unknown[]) => console.warn("[MCP:LIB]", ...args),
    info: (...args: unknown[]) => console.info("[MCP:LIB]", ...args),
    debug: (...args: unknown[]) => console.debug("[MCP:LIB]", ...args),
  },
});

// Mutable auth — updated per-request, captured by reference in tool handlers.
// Edge Functions are single-threaded, so no race conditions.
const requestAuth: AuthContext = { userId: "", keyId: "" };
registerAllTools(mcp, client, requestAuth);

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);
// ─────────────────────────────────────────────────────────────────────────────

const app = new Hono();

app.all("/*", async (c) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  logger.info("incoming request", {
    method: c.req.method,
    hasDevVaultKey: c.req.raw.headers.has("x-devvault-key"),
    hasApiKey: c.req.raw.headers.has("x-api-key"),
    hasAuthorization: c.req.raw.headers.has("authorization"),
    url: c.req.url,
  });

  const authResult = await authenticateRequest(c.req.raw);

  if (authResult instanceof Response) {
    return withCors(authResult);
  }

  logger.info("auth passed", { userId: authResult.userId });

  // Mutate shared reference — tools see updated values
  requestAuth.userId = authResult.userId;
  requestAuth.keyId = authResult.keyId;

  try {
    const mcpResponse = await httpHandler(c.req.raw);
    const cloned = mcpResponse.clone();
    const bodyText = await cloned.text();
    logger.info("transport response", {
      status: mcpResponse.status,
      contentType: mcpResponse.headers.get("content-type"),
      bodyLength: bodyText.length,
      bodyPreview: bodyText.substring(0, 500),
    });
    return withCors(mcpResponse);
  } catch (err) {
    logger.error("transport error", {
      message: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return withCors(new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal MCP error: ${String(err)}` },
        id: null,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    ));
  }
});

Deno.serve(app.fetch);
