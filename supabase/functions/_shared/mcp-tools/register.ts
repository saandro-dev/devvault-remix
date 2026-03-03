/**
 * mcp-tools/register.ts — Central wiring for all MCP tools.
 *
 * Imports every tool registrar and calls them against the McpServer instance.
 * Adding a new tool = one import + one line in registerAllTools.
 *
 * Total tools: 29
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AuthContext, McpServerLike } from "./types.ts";

import { registerBootstrapTool } from "./bootstrap.ts";
import { registerSearchTool } from "./search.ts";
import { registerGetTool } from "./get.ts";
import { registerListTool } from "./list.ts";
import { registerDomainsTool } from "./domains.ts";
import { registerIngestTool } from "./ingest.ts";
import { registerBatchIngestTool } from "./batch-ingest.ts";
import { registerUpdateTool } from "./update.ts";
import { registerGetGroupTool } from "./get-group.ts";
import { registerValidateTool } from "./validate.ts";
import { registerDeleteTool } from "./delete.ts";
import { registerDiagnoseTool } from "./diagnose.ts";
import { registerReportBugTool } from "./report-bug.ts";
import { registerResolveBugTool } from "./resolve-bug.ts";
import { registerReportSuccessTool } from "./report-success.ts";
import { registerExportTreeTool } from "./export-tree.ts";
import { registerCheckUpdatesTool } from "./check-updates.ts";
import { registerLoadContextTool } from "./load-context.ts";
import { registerQuickstartTool } from "./quickstart.ts";
import { registerChangelogTool } from "./changelog.ts";
import { registerDiaryBugTool } from "./diary-bug.ts";
import { registerDiaryResolveTool } from "./diary-resolve.ts";
import { registerDiaryListTool } from "./diary-list.ts";
import { registerGetPlaybookTool } from "./get-playbook.ts";
import { registerTaskStartTool } from "./task-start.ts";
import { registerTaskEndTool } from "./task-end.ts";
import { registerSimilarTool } from "./similar.ts";
import { registerStatsTool } from "./stats.ts";
import { registerMandatoryTool } from "./mandatory.ts";

export function registerAllTools(
  server: McpServerLike,
  client: SupabaseClient,
  auth: AuthContext,
): void {
  registerBootstrapTool(server, client, auth);
  registerSearchTool(server, client, auth);
  registerGetTool(server, client, auth);
  registerListTool(server, client, auth);
  registerDomainsTool(server, client, auth);
  registerIngestTool(server, client, auth);
  registerBatchIngestTool(server, client, auth);
  registerUpdateTool(server, client, auth);
  registerGetGroupTool(server, client, auth);
  registerValidateTool(server, client, auth);
  registerDeleteTool(server, client, auth);
  registerDiagnoseTool(server, client, auth);
  registerReportBugTool(server, client, auth);
  registerResolveBugTool(server, client, auth);
  registerReportSuccessTool(server, client, auth);
  registerExportTreeTool(server, client, auth);
  registerCheckUpdatesTool(server, client, auth);
  registerLoadContextTool(server, client, auth);
  registerQuickstartTool(server, client, auth);
  registerChangelogTool(server, client, auth);
  registerDiaryBugTool(server, client, auth);
  registerDiaryResolveTool(server, client, auth);
  registerDiaryListTool(server, client, auth);
  registerGetPlaybookTool(server, client, auth);
  registerTaskStartTool(server, client, auth);
  registerTaskEndTool(server, client, auth);
  registerSimilarTool(server, client, auth);
  registerStatsTool(server, client, auth);
  registerMandatoryTool(server, client, auth);
}
