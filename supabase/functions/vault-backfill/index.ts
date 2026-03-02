/**
 * vault-backfill — Unified entry point for all vault enrichment backfills.
 *
 * POST { action, limit?, dry_run? }
 *
 * Actions:
 *   - "diagnose-fields": Populate common_errors + solves_problems (AI)
 *   - "context-fields":  Populate context_markdown + test_code (AI)
 *   - "changelog-seed":  Seed v1 changelog entries (no AI)
 *   - "embeddings":      Generate vector embeddings (AI)
 *
 * Uses the shared backfill engine with strategy pattern.
 * Standard pattern: withSentry + api-helpers + cors-v2.
 */

import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES } from "../_shared/api-helpers.ts";
import { withSentry } from "../_shared/sentry.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { runBackfill, DEFAULT_AI_CONFIG, DEFAULT_DATA_CONFIG } from "../_shared/backfill-engine.ts";
import type { BackfillStrategy, BackfillConfig } from "../_shared/backfill-engine.ts";
import { diagnoseFieldsStrategy } from "../_shared/backfill-strategies/diagnose-fields.ts";
import { contextFieldsStrategy } from "../_shared/backfill-strategies/context-fields.ts";
import { changelogSeedStrategy } from "../_shared/backfill-strategies/changelog-seed.ts";
import { embeddingsStrategy } from "../_shared/backfill-strategies/embeddings.ts";

interface StrategyEntry {
  // deno-lint-ignore no-explicit-any
  strategy: BackfillStrategy<any, any>;
  config: BackfillConfig;
}

const STRATEGY_MAP: Record<string, StrategyEntry> = {
  "diagnose-fields": { strategy: diagnoseFieldsStrategy, config: DEFAULT_AI_CONFIG },
  "context-fields": { strategy: contextFieldsStrategy, config: DEFAULT_AI_CONFIG },
  "changelog-seed": { strategy: changelogSeedStrategy, config: DEFAULT_DATA_CONFIG },
  "embeddings": { strategy: embeddingsStrategy, config: DEFAULT_AI_CONFIG },
};

Deno.serve(withSentry("vault-backfill", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST is accepted.", 405);
  }

  let action: string | undefined;
  let limit = 500;
  let dryRun = false;

  try {
    const body = await req.json();
    action = body.action;
    if (body.limit) limit = Math.min(Number(body.limit), 1000);
    if (body.dry_run === true) dryRun = true;
  } catch {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Invalid JSON body.", 400);
  }

  if (!action || !(action in STRATEGY_MAP)) {
    const validActions = Object.keys(STRATEGY_MAP).join(", ");
    return createErrorResponse(
      req,
      ERROR_CODES.VALIDATION_ERROR,
      `Invalid action "${action}". Valid actions: ${validActions}`,
      400,
    );
  }

  const { strategy, config } = STRATEGY_MAP[action];
  const client = getSupabaseClient("general");

  const result = await runBackfill(client, strategy, config, { limit, dryRun });

  return createSuccessResponse(req, result);
}));
