/**
 * mcp-tools/domains.ts — devvault_domains tool.
 *
 * Lists all available knowledge domains with module counts and types.
 */

import { createLogger } from "../logger.ts";
import { errorResponse, classifyRpcError } from "./error-helpers.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:domains");

export const registerDomainsTool: ToolRegistrar = (server, client) => {
  server.tool("devvault_domains", {
    description:
      "List all available knowledge domains with module counts and types. " +
      "Use this to discover what areas of knowledge are available.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => {
      logger.info("invoked");
      try {
        const { data, error } = await client.rpc("list_vault_domains");
        logger.info("RPC result", {
          success: !error,
          resultCount: Array.isArray(data) ? data.length : 0,
          error: error?.message,
        });
        if (error) {
          logger.error("domains failed", { error: error.message });
          return errorResponse({ code: classifyRpcError(error.message), message: error.message });
        }
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        logger.error("uncaught error", { error: String(err) });
        return errorResponse({ code: "INTERNAL_ERROR", message: String(err) });
      }
    },
  });
};
