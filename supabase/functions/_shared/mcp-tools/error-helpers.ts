/**
 * mcp-tools/error-helpers.ts — Actionable error response factory.
 *
 * Every MCP tool error should go through this factory so agents always receive:
 * - A structured error_code for programmatic handling
 * - A recovery_hint telling the agent what to do next
 * - The raw message for debugging
 */

export type ErrorCode =
  | "MODULE_NOT_FOUND"
  | "INVALID_INPUT"
  | "RPC_FAILURE"
  | "PERMISSION_DENIED"
  | "DEPENDENCY_NOT_FOUND"
  | "DUPLICATE_ENTRY"
  | "VALIDATION_FAILED"
  | "INTERNAL_ERROR"
  | "PLAYBOOK_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "BUG_NOT_FOUND"
  | "MISSING_PARAM"
  | "VERSION_NOT_FOUND";

const RECOVERY_HINTS: Record<ErrorCode, string> = {
  MODULE_NOT_FOUND:
    "Module not found. Try devvault_search({query: 'your keywords'}) to find it by content, " +
    "or devvault_list({domain: 'backend'}) to browse available modules.",
  INVALID_INPUT:
    "Check the inputSchema for this tool. Ensure all required fields are provided with correct types.",
  RPC_FAILURE:
    "A database function call failed. This is usually a server-side issue. " +
    "Retry once, then report via devvault_diary_bug if it persists.",
  PERMISSION_DENIED:
    "You don't have permission for this action. Verify your API key is valid and not expired.",
  DEPENDENCY_NOT_FOUND:
    "One or more dependency modules were not found. Use devvault_search to find the correct slug or UUID.",
  DUPLICATE_ENTRY:
    "A module with this slug already exists. Use devvault_search({query: 'slug-name'}) to find it, " +
    "then devvault_update to modify it instead.",
  VALIDATION_FAILED:
    "The data failed validation. Check the error message for specific field issues.",
  INTERNAL_ERROR:
    "An unexpected server error occurred. Retry once. If it persists, " +
    "report via devvault_diary_bug with the full error message.",
  PLAYBOOK_NOT_FOUND:
    "Playbook not found. Call devvault_get_playbook() without params to list all available playbooks.",
  TASK_NOT_FOUND:
    "Task not found. Ensure you called devvault_task_start first to create a task.",
  BUG_NOT_FOUND:
    "Bug entry not found. Use devvault_diary_list to find existing bug IDs.",
};

interface ErrorResponseOptions {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Creates a standardized MCP tool error response that agents can act on.
 */
export function errorResponse(opts: ErrorResponseOptions) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: true,
        _error_code: opts.code,
        _message: opts.message,
        _recovery_hint: RECOVERY_HINTS[opts.code],
        ...(opts.details ? { _details: opts.details } : {}),
      }, null, 2),
    }],
  };
}

/**
 * Detects common error patterns and returns the appropriate ErrorCode.
 */
export function classifyRpcError(message: string): ErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes("not found") || lower.includes("no rows")) return "MODULE_NOT_FOUND";
  if (lower.includes("duplicate") || lower.includes("unique constraint")) return "DUPLICATE_ENTRY";
  if (lower.includes("permission") || lower.includes("denied")) return "PERMISSION_DENIED";
  if (lower.includes("validation") || lower.includes("invalid")) return "VALIDATION_FAILED";
  return "RPC_FAILURE";
}
