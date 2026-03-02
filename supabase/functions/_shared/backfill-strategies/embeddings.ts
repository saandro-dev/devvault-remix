/**
 * embeddings strategy — Generates vector embeddings via OpenAI.
 *
 * Reuses the existing embedding-client.ts helpers.
 * Validates that the embedding has exactly 1536 dimensions.
 */

import type { BackfillStrategy } from "../backfill-engine.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmbeddingInput, generateEmbedding } from "../embedding-client.ts";

export interface EmbeddingRow {
  id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  usage_hint: string | null;
  tags: string[];
  solves_problems: string[] | null;
}

export interface EmbeddingResult {
  embedding: number[];
}

export const embeddingsStrategy: BackfillStrategy<EmbeddingRow, EmbeddingResult> = {
  name: "embeddings",

  async fetchCandidates(client: SupabaseClient, limit: number): Promise<EmbeddingRow[]> {
    const { data, error } = await client
      .from("vault_modules")
      .select("id, title, description, why_it_matters, usage_hint, tags, solves_problems")
      .eq("visibility", "global")
      .is("embedding", null)
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as EmbeddingRow[];
  },

  async process(row: EmbeddingRow): Promise<EmbeddingResult> {
    const input = buildEmbeddingInput(row as unknown as Record<string, unknown>);
    if (!input) throw new Error("No embeddable content");
    const embedding = await generateEmbedding(input);
    return { embedding };
  },

  validate(result: EmbeddingResult): boolean {
    return Array.isArray(result.embedding) && result.embedding.length === 1536;
  },

  async persist(client: SupabaseClient, row: EmbeddingRow, result: EmbeddingResult): Promise<void> {
    const vectorLiteral = `[${result.embedding.join(",")}]`;
    const { error } = await client
      .from("vault_modules")
      .update({ embedding: vectorLiteral })
      .eq("id", row.id);

    if (error) throw error;
  },
};
