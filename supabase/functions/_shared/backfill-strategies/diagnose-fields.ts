/**
 * diagnose-fields strategy — Generates common_errors and solves_problems
 * using OpenAI gpt-4o-mini.
 *
 * SQL-native filtering: only fetches modules that actually need backfill.
 * Structural validation: every AI output is validated before persistence.
 */

import type { BackfillStrategy } from "../backfill-engine.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CODE_CHARS = 2000;

export interface DiagnoseRow {
  id: string;
  title: string;
  code: string;
  description: string | null;
  why_it_matters: string | null;
  usage_hint: string | null;
  tags: string[];
}

export interface DiagnoseResult {
  common_errors: Array<{ error: string; cause: string; fix: string }>;
  solves_problems: string[];
}

export const diagnoseFieldsStrategy: BackfillStrategy<DiagnoseRow, DiagnoseResult> = {
  name: "diagnose-fields",

  async fetchCandidates(client: SupabaseClient, limit: number): Promise<DiagnoseRow[]> {
    const { data, error } = await client
      .from("vault_modules")
      .select("id, title, code, description, why_it_matters, usage_hint, tags")
      .eq("visibility", "global")
      .or("common_errors.is.null,common_errors.eq.[]")
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as DiagnoseRow[];
  },

  async process(row: DiagnoseRow): Promise<DiagnoseResult> {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const codeSnippet = row.code ? row.code.substring(0, MAX_CODE_CHARS) : "(no code)";

    const prompt = `You are a technical analyst for a developer knowledge base consumed by AI agents.
Given a code module, generate TWO fields:

1. **common_errors**: 2-4 common errors developers encounter when using this code pattern. Each entry:
   - "error": the error message or symptom
   - "cause": root cause (1-2 sentences)
   - "fix": how to fix (1-2 sentences)

2. **solves_problems**: 3-5 problem descriptions this module solves. Each must be a natural language sentence of at least 10 characters.

Return ONLY valid JSON with keys "common_errors" and "solves_problems". No markdown.

Module: ${row.title}
Description: ${row.description ?? "(none)"}
Tags: ${row.tags.join(", ") || "(none)"}
Why it matters: ${row.why_it_matters ?? "(none)"}
Usage hint: ${row.usage_hint ?? "(none)"}
Code (first ${MAX_CODE_CHARS} chars):
${codeSnippet}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from OpenAI");

    const cleaned = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned) as DiagnoseResult;
  },

  validate(result: DiagnoseResult): boolean {
    if (!Array.isArray(result.common_errors) || !Array.isArray(result.solves_problems)) {
      return false;
    }
    // Validate each common_error entry
    for (const entry of result.common_errors) {
      if (
        typeof entry.error !== "string" || !entry.error.trim() ||
        typeof entry.cause !== "string" || !entry.cause.trim() ||
        typeof entry.fix !== "string" || !entry.fix.trim()
      ) {
        return false;
      }
    }
    // Validate each solves_problems entry
    for (const problem of result.solves_problems) {
      if (typeof problem !== "string" || problem.length < 10) {
        return false;
      }
    }
    return result.common_errors.length >= 1 && result.solves_problems.length >= 1;
  },

  async persist(client: SupabaseClient, row: DiagnoseRow, result: DiagnoseResult): Promise<void> {
    const { error } = await client
      .from("vault_modules")
      .update({
        common_errors: result.common_errors,
        solves_problems: result.solves_problems,
      })
      .eq("id", row.id);

    if (error) throw error;
  },
};
