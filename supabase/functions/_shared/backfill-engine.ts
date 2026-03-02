/**
 * backfill-engine.ts — Reusable batch processing engine for vault backfills.
 *
 * Implements the Strategy pattern: each backfill defines a strategy
 * (fetch, process, validate, persist), and this engine handles the
 * orchestration (batching, retry, delay, progress tracking, dry_run).
 *
 * Zero code duplication across backfill operations.
 */

import { createLogger, type Logger } from "./logger.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Public Interfaces ─────────────────────────────────────────────────────

export interface BackfillStrategy<TRow, TResult> {
  /** Unique name for logging */
  readonly name: string;

  /** Fetch candidates using SQL-native filtering (no JS filtering) */
  fetchCandidates(client: SupabaseClient, limit: number): Promise<TRow[]>;

  /** Process a single row — may call external APIs */
  process(row: TRow): Promise<TResult>;

  /** Validate the result before persisting. Return false to skip. */
  validate(result: TResult): boolean;

  /** Persist the validated result to the database */
  persist(client: SupabaseClient, row: TRow, result: TResult): Promise<void>;
}

export interface BackfillConfig {
  batchSize: number;
  delayMs: number;
  maxRetries: number;
  retryBaseMs: number;
}

export interface BackfillOptions {
  limit: number;
  dryRun: boolean;
}

export interface BackfillResult {
  strategy: string;
  total_candidates: number;
  processed: number;
  failed: number;
  skipped_validation: number;
  duration_ms: number;
  dry_run: boolean;
  errors: Array<{ id: string; error: string }>;
  sample?: unknown[];
}

// ─── Default Configs ────────────────────────────────────────────────────────

export const DEFAULT_AI_CONFIG: BackfillConfig = {
  batchSize: 10,
  delayMs: 2000,
  maxRetries: 3,
  retryBaseMs: 1000,
};

export const DEFAULT_DATA_CONFIG: BackfillConfig = {
  batchSize: 50,
  delayMs: 0,
  maxRetries: 1,
  retryBaseMs: 500,
};

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Runs a backfill strategy with batching, retry, and progress tracking.
 */
export async function runBackfill<TRow extends { id: string }, TResult>(
  client: SupabaseClient,
  strategy: BackfillStrategy<TRow, TResult>,
  config: BackfillConfig,
  options: BackfillOptions,
): Promise<BackfillResult> {
  const logger = createLogger(`backfill:${strategy.name}`);
  const startTime = Date.now();

  // 1. Fetch candidates (SQL-native filtering)
  const candidates = await strategy.fetchCandidates(client, options.limit);

  logger.info("candidates fetched", { count: candidates.length });

  if (options.dryRun) {
    return {
      strategy: strategy.name,
      total_candidates: candidates.length,
      processed: 0,
      failed: 0,
      skipped_validation: 0,
      duration_ms: Date.now() - startTime,
      dry_run: true,
      errors: [],
      sample: candidates.slice(0, 5).map((r) => ({ id: r.id })),
    };
  }

  let processed = 0;
  let failed = 0;
  let skippedValidation = 0;
  const errors: Array<{ id: string; error: string }> = [];

  // 2. Process in batches
  for (let i = 0; i < candidates.length; i += config.batchSize) {
    const batch = candidates.slice(i, i + config.batchSize);
    const batchNum = Math.floor(i / config.batchSize) + 1;

    const results = await Promise.allSettled(
      batch.map((row) => processWithRetry(strategy, row, config, logger)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const row = batch[j];

      if (result.status === "rejected") {
        failed++;
        const msg = result.reason?.message ?? String(result.reason);
        errors.push({ id: row.id, error: msg });
        logger.warn("process failed", { id: row.id, error: msg });
        continue;
      }

      // Validate before persist
      if (!strategy.validate(result.value)) {
        skippedValidation++;
        errors.push({ id: row.id, error: "validation_failed" });
        logger.warn("validation failed", { id: row.id });
        continue;
      }

      try {
        await strategy.persist(client, row, result.value);
        processed++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ id: row.id, error: `persist: ${msg}` });
        logger.error("persist failed", { id: row.id, error: msg });
      }
    }

    logger.info("batch complete", { batch: batchNum, processed, failed, skippedValidation });

    // Delay between batches (except last)
    if (config.delayMs > 0 && i + config.batchSize < candidates.length) {
      await delay(config.delayMs);
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info("backfill complete", { processed, failed, skippedValidation, durationMs });

  return {
    strategy: strategy.name,
    total_candidates: candidates.length,
    processed,
    failed,
    skipped_validation: skippedValidation,
    duration_ms: durationMs,
    dry_run: false,
    errors: errors.slice(0, 50),
  };
}

// ─── Retry Logic ────────────────────────────────────────────────────────────

async function processWithRetry<TRow, TResult>(
  strategy: BackfillStrategy<TRow, TResult>,
  row: TRow,
  config: BackfillConfig,
  logger: Logger,
): Promise<TResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await strategy.process(row);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable = isTransientError(lastError);

      if (!isRetryable || attempt >= config.maxRetries) {
        throw lastError;
      }

      const waitMs = config.retryBaseMs * Math.pow(2, attempt);
      logger.warn("retrying", {
        id: (row as { id?: string }).id,
        attempt: attempt + 1,
        waitMs,
        error: lastError.message,
      });
      await delay(waitMs);
    }
  }

  throw lastError!;
}

function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("timeout") ||
    msg.includes("econnreset")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
