/**
 * context-fields strategy — Generates context_markdown and test_code
 * using OpenAI gpt-4o-mini.
 *
 * context_markdown: 300-600 word documentation with structured headers.
 * test_code: 5-15 line validation snippet in the module's language.
 */

import type { BackfillStrategy } from "../backfill-engine.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CODE_CHARS = 3000;

export interface ContextRow {
  id: string;
  title: string;
  code: string;
  description: string | null;
  domain: string | null;
  module_type: string | null;
  language: string;
  tags: string[];
  why_it_matters: string | null;
  usage_hint: string | null;
  code_example: string | null;
}

export interface ContextResult {
  context_markdown: string;
  test_code: string;
}

export const contextFieldsStrategy: BackfillStrategy<ContextRow, ContextResult> = {
  name: "context-fields",

  async fetchCandidates(client: SupabaseClient, limit: number): Promise<ContextRow[]> {
    const { data, error } = await client
      .from("vault_modules")
      .select("id, title, code, description, domain, module_type, language, tags, why_it_matters, usage_hint, code_example, context_markdown, test_code")
      .eq("visibility", "global")
      .or("context_markdown.is.null,test_code.is.null")
      .limit(limit);

    if (error) throw error;

    // Filter further: include modules where fields are null or empty strings
    return ((data ?? []) as (ContextRow & { context_markdown: string | null; test_code: string | null })[])
      .filter((m) => {
        const needsContext = !m.context_markdown || m.context_markdown.trim() === "";
        const needsTest = !m.test_code || m.test_code.trim() === "";
        return needsContext || needsTest;
      })
      .map(({ context_markdown: _cm, test_code: _tc, ...rest }) => rest as ContextRow);
  },

  async process(row: ContextRow): Promise<ContextResult> {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const codeSnippet = row.code ? row.code.substring(0, MAX_CODE_CHARS) : "(no code)";

    const prompt = `You are a senior technical writer for a developer knowledge base consumed by AI agents.
Generate TWO fields for the following code module:

1. **context_markdown**: Detailed Markdown documentation (300-600 words) with these REQUIRED sections:
   ## Overview
   ## How it Works
   ## When to Use
   ## When NOT to Use
   ## Considerations

2. **test_code**: A short validation snippet (5-15 lines) in ${row.language} that an AI agent can run to verify the module works. Use assertions or console.log checks. Must be self-contained.

Return ONLY valid JSON: { "context_markdown": "...", "test_code": "..." }
No markdown fences around the JSON.

Module: ${row.title}
Language: ${row.language}
Domain: ${row.domain ?? "(none)"}
Type: ${row.module_type ?? "(none)"}
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
        max_tokens: 2000,
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
    return JSON.parse(cleaned) as ContextResult;
  },

  validate(result: ContextResult): boolean {
    // context_markdown: at least 200 chars, at least 2 markdown headers
    if (typeof result.context_markdown !== "string" || result.context_markdown.length < 200) {
      return false;
    }
    const headerCount = (result.context_markdown.match(/^##\s/gm) ?? []).length;
    if (headerCount < 2) return false;

    // test_code: at least 3 lines, no placeholder content
    if (typeof result.test_code !== "string") return false;
    const lines = result.test_code.trim().split("\n").length;
    if (lines < 3) return false;
    const lower = result.test_code.toLowerCase();
    if (lower.includes("todo") || lower.includes("implement me") || lower.includes("your code here")) {
      return false;
    }

    return true;
  },

  async persist(client: SupabaseClient, row: ContextRow, result: ContextResult): Promise<void> {
    const { error } = await client
      .from("vault_modules")
      .update({
        context_markdown: result.context_markdown,
        test_code: result.test_code,
      })
      .eq("id", row.id);

    if (error) throw error;
  },
};
