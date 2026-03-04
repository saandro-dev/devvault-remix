/**
 * duplicate-checker.ts — Shared helper for duplicate detection.
 *
 * Calls the `check_duplicate_modules` RPC to find modules with similar titles.
 * Used by: devvault_ingest, devvault_check_duplicates, vault-crud/create.
 *
 * Single Responsibility: duplicate detection via trigram similarity.
 */

import { createLogger } from "./logger.ts";

const logger = createLogger("duplicate-checker");

export interface DuplicateMatch {
  id: string;
  slug: string;
  title: string;
  domain: string;
  module_type: string;
  similarity_score: number;
}

export interface DuplicateCheckResult {
  has_duplicates: boolean;
  matches: DuplicateMatch[];
}

/**
 * Checks if a module with a similar title already exists in the vault.
 *
 * @param client - Supabase client with RPC access
 * @param title - Title to check against existing modules
 * @param threshold - Minimum trigram similarity (0-1). Default: 0.65
 * @param limit - Maximum matches to return. Default: 5
 */
export async function checkDuplicates(
  client: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  title: string,
  threshold = 0.65,
  limit = 5,
): Promise<DuplicateCheckResult> {
  const { data, error } = await client.rpc("check_duplicate_modules", {
    p_title: title,
    p_threshold: threshold,
    p_limit: limit,
  });

  if (error) {
    logger.error("duplicate check failed", { error: error.message, title });
    return { has_duplicates: false, matches: [] };
  }

  const matches = (data as DuplicateMatch[]) ?? [];
  logger.info("duplicate check completed", {
    title,
    matchCount: matches.length,
    topScore: matches[0]?.similarity_score ?? 0,
  });

  return {
    has_duplicates: matches.length > 0,
    matches,
  };
}
