/**
 * mcp-tools/diagnose-troubleshoot.ts — Troubleshooting orchestrator for devvault_diagnose.
 *
 * Multi-strategy error resolution pipeline (SQL-native architecture):
 *   1. match_common_errors (Postgres RPC)
 *   2. match_solves_problems (Postgres RPC)
 *   3. resolved knowledge gaps (DB query)
 *   4. hybrid search fallback (pgvector + tsvector RPC)
 *   5. tag-based fallback (keyword extraction → tag overlap)
 *
 * Domain inference is handled by Postgres via infer_domain_from_text().
 * Strategies 1 & 2 run entirely in SQL — zero in-memory iteration.
 */

import { createLogger } from "../logger.ts";
import { generateEmbedding } from "../embedding-client.ts";
import { errorResponse } from "./error-helpers.ts";
import { trackUsage } from "./usage-tracker.ts";
import type { ToolRegistrar } from "./types.ts";

const logger = createLogger("mcp-tool:diagnose-troubleshoot");

type SupabaseClient = Parameters<ToolRegistrar>[1];
type AuthContext = Parameters<ToolRegistrar>[2];

/** Extract meaningful keywords from an error message for tag matching */
function extractKeywords(errorMsg: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "about",
    "not", "no", "but", "or", "and", "if", "then", "than", "too", "very",
    "just", "don", "t", "s", "it", "its", "this", "that", "there", "error",
    "cannot", "get", "set", "null", "undefined", "true", "false",
  ]);

  return errorMsg
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

export async function handleTroubleshooting(
  client: SupabaseClient,
  auth: AuthContext,
  errorMsg: string,
  domain: string | undefined,
  limit: number,
) {
  logger.info("troubleshooting", { errorMsg: errorMsg.substring(0, 100), domain });

  try {
    // ── Step 0: Infer domain if not explicitly provided ──────────────
    let effectiveDomain = domain;
    if (!effectiveDomain) {
      const { data: inferredDomain } = await client.rpc("infer_domain_from_text", {
        p_text: errorMsg,
      });
      if (inferredDomain) {
        effectiveDomain = inferredDomain as string;
        logger.info("domain inferred", { inferred: effectiveDomain });
      }
    }

    const errorTokens = extractKeywords(errorMsg);

    // ── Strategies 1-5 (parallel where possible) ─────────────────────
    const [errorMatchesRes, solvesMatchesRes, gapMatches, ilikeMatches, tagMatches] =
      await Promise.all([
        // Strategy 1: common_errors (SQL-native)
        client.rpc("match_common_errors", {
          p_error_text: errorMsg,
          p_domain: effectiveDomain ?? null,
          p_limit: limit,
        }),
        // Strategy 2: solves_problems (SQL-native)
        client.rpc("match_solves_problems", {
          p_error_text: errorMsg,
          p_tokens: errorTokens,
          p_domain: effectiveDomain ?? null,
          p_limit: limit,
        }),
        // Strategy 3: resolved knowledge gaps
        matchResolvedGaps(client, errorMsg),
        // Strategy 4: hybrid search fallback
        hybridSearchFallback(client, errorMsg, effectiveDomain, limit),
        // Strategy 5: tag-based fallback
        matchByTags(client, errorTokens, effectiveDomain),
      ]);

    // ── Normalize results ────────────────────────────────────────────
    const errorMatches = ((errorMatchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      ...m, match_type: "common_errors", relevance: 0.95,
    }));

    const solvesMatches = ((solvesMatchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      ...m,
      match_type: m.match_quality === "exact" ? "solves_problems" : "solves_problems_partial",
      relevance: m.match_quality === "exact" ? 0.8 : 0.65,
    }));

    // ── Deduplicate + merge + sort ───────────────────────────────────
    const seenIds = new Set<string>();
    const allMatches: Record<string, unknown>[] = [];

    for (const batch of [errorMatches, solvesMatches, gapMatches, ilikeMatches, tagMatches]) {
      for (const match of batch) {
        const mid = match.id as string;
        if (!seenIds.has(mid)) {
          seenIds.add(mid);
          allMatches.push(match);
        }
      }
    }

    allMatches.sort((a, b) => (b.relevance as number) - (a.relevance as number));
    const finalMatches = allMatches.slice(0, limit);

    // ── Track usage ──────────────────────────────────────────────────
    trackUsage(client, auth, {
      event_type: finalMatches.length > 0 ? "diagnose" : "search_miss",
      tool_name: "devvault_diagnose",
      query_text: errorMsg,
      result_count: finalMatches.length,
    });

    logger.info("diagnosis complete", {
      total: finalMatches.length,
      errorMatches: errorMatches.length,
      solvesMatches: solvesMatches.length,
      gapMatches: gapMatches.length,
      ilikeMatches: ilikeMatches.length,
      tagMatches: tagMatches.length,
      inferredDomain: effectiveDomain ?? "none",
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          mode: "troubleshooting",
          diagnosis: {
            query: errorMsg,
            inferred_domain: effectiveDomain ?? null,
            total_matches: finalMatches.length,
            match_breakdown: {
              common_errors: errorMatches.length,
              solves_problems: solvesMatches.length,
              resolved_gaps: gapMatches.length,
              hybrid_search: ilikeMatches.length,
              tag_match: tagMatches.length,
            },
          },
          matching_modules: finalMatches,
          _hint: finalMatches.length > 0
            ? "Use devvault_get with a module's slug to fetch the full code and implementation details."
            : "No solution found. Use devvault_report_bug to register this gap. " +
              "When you solve it, call devvault_resolve_bug to document the solution.",
        }, null, 2),
      }],
    };
  } catch (err) {
    logger.error("uncaught error", { error: String(err) });
    return errorResponse({ code: "INTERNAL_ERROR", message: String(err) });
  }
}

// ── Strategy 3: resolved knowledge gaps ──────────────────────────────────────

async function matchResolvedGaps(
  client: SupabaseClient,
  errorMsg: string,
): Promise<Array<Record<string, unknown>>> {
  const { data: resolvedGaps } = await client
    .from("vault_knowledge_gaps")
    .select("id, error_message, resolution, resolution_code, domain, resolved_at, promoted_module_id")
    .in("status", ["resolved", "promoted_to_module"])
    .ilike("error_message", `%${errorMsg.substring(0, 100)}%`)
    .limit(5);

  return ((resolvedGaps ?? []) as Record<string, unknown>[]).map((gap) => ({
    id: gap.id, match_type: "resolved_gap", relevance: 0.7,
    error_message: gap.error_message, resolution: gap.resolution,
    resolution_code: gap.resolution_code, domain: gap.domain,
    promoted_module_id: gap.promoted_module_id, resolved_at: gap.resolved_at,
  }));
}

// ── Strategy 4: Hybrid search fallback ───────────────────────────────────────

async function hybridSearchFallback(
  client: SupabaseClient,
  errorMsg: string,
  domain: string | undefined,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  let queryEmbedding: string | null = null;
  try {
    const embArr = await generateEmbedding(errorMsg);
    queryEmbedding = `[${embArr.join(",")}]`;
  } catch {
    logger.warn("diagnose: embedding generation failed, using full-text only");
  }

  const { data: ilikeFallback } = await client.rpc("hybrid_search_vault_modules", {
    p_query_text: errorMsg,
    p_query_embedding: queryEmbedding,
    p_domain: domain ?? null,
    p_match_count: limit,
  });

  return ((ilikeFallback ?? []) as Record<string, unknown>[]).map((mod) => ({
    id: mod.id, slug: mod.slug, title: mod.title, domain: mod.domain,
    match_type: "hybrid_search", relevance: Number(mod.relevance_score ?? 0.5),
    difficulty: mod.difficulty, estimated_minutes: mod.estimated_minutes,
  }));
}

// ── Strategy 5: Tag-based fallback ───────────────────────────────────────────

async function matchByTags(
  client: SupabaseClient,
  errorTokens: string[],
  domain: string | undefined,
): Promise<Array<Record<string, unknown>>> {
  if (errorTokens.length === 0) return [];

  const candidateTags = errorTokens.slice(0, 10);

  let query = client
    .from("vault_modules")
    .select("id, slug, title, description, domain, tags, usage_hint, difficulty, estimated_minutes")
    .eq("visibility", "global")
    .in("validation_status", ["validated", "draft"])
    .overlaps("tags", candidateTags);

  if (domain) query = query.eq("domain", domain);
  const { data: tagModules } = await query.limit(10);

  const matches: Array<Record<string, unknown>> = [];
  for (const mod of (tagModules ?? []) as Record<string, unknown>[]) {
    const tags = mod.tags as string[];
    const overlapCount = candidateTags.filter((t) => tags.some((tag) => tag.toLowerCase().includes(t))).length;
    if (overlapCount >= 1) {
      matches.push({
        id: mod.id, slug: mod.slug, title: mod.title, domain: mod.domain,
        match_type: "tag_match", relevance: 0.4 + (overlapCount * 0.1),
        matched_tags: tags.filter((tag) => candidateTags.some((t) => tag.toLowerCase().includes(t))),
        difficulty: mod.difficulty, estimated_minutes: mod.estimated_minutes,
      });
    }
  }

  return matches;
}
