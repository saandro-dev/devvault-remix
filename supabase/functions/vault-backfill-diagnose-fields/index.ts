/**
 * vault-backfill-diagnose-fields — One-shot administrative function.
 *
 * Populates `common_errors` and `solves_problems` on global vault_modules
 * using OpenAI to analyze each module's content.
 *
 * Authentication: Service role (manual invocation only).
 * Rate: Processes in batches of 10, 2s delay between batches.
 */

import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from "../_shared/api-helpers.ts";
import { handleCorsV2 } from "../_shared/cors-v2.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("vault-backfill-diagnose-fields");

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;
const MAX_CODE_CHARS = 2000;

interface ModuleRow {
  id: string;
  title: string;
  code: string;
  why_it_matters: string | null;
  usage_hint: string | null;
  tags: string[];
  description: string | null;
}

interface GeneratedFields {
  common_errors: { error: string; cause: string; fix: string }[];
  solves_problems: string[];
}

async function generateDiagnoseFields(mod: ModuleRow): Promise<GeneratedFields> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

  const codeSnippet = mod.code ? mod.code.substring(0, MAX_CODE_CHARS) : "(no code)";

  const prompt = `You are a technical analyst for a developer knowledge base consumed by AI agents.
Given a code module, generate TWO fields:

1. **common_errors**: 2-4 common errors developers encounter when using or implementing this code pattern. Each entry has:
   - "error": the error message or symptom (e.g., "TypeError: Cannot read property 'x' of undefined")
   - "cause": root cause explanation (1-2 sentences)
   - "fix": how to fix it (1-2 sentences)

2. **solves_problems**: 3-5 problem descriptions this module solves. Each should be a natural language sentence describing a problem an AI agent might encounter (e.g., "How to implement rate limiting on API endpoints").

Return ONLY valid JSON with keys "common_errors" and "solves_problems". No markdown, no explanation.

Module title: ${mod.title}
Description: ${mod.description ?? "(none)"}
Tags: ${mod.tags.join(", ") || "(none)"}
Why it matters: ${mod.why_it_matters ?? "(none)"}
Usage hint: ${mod.usage_hint ?? "(none)"}
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

  // Strip markdown code fences if present
  const cleaned = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as GeneratedFields;

  // Validate structure
  if (!Array.isArray(parsed.common_errors) || !Array.isArray(parsed.solves_problems)) {
    throw new Error("Invalid structure from OpenAI");
  }

  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST is accepted.", 405);
  }

  // Parse optional params
  let limit = 500;
  let dryRun = false;
  try {
    const body = await req.json();
    if (body.limit) limit = Math.min(Number(body.limit), 1000);
    if (body.dry_run) dryRun = true;
  } catch {
    // No body is fine, use defaults
  }

  const supabase = getSupabaseClient("general");

  // Fetch modules needing backfill
  const { data: modules, error: fetchError } = await supabase
    .from("vault_modules")
    .select("id, title, code, why_it_matters, usage_hint, tags, description")
    .eq("visibility", "global")
    .or("common_errors.is.null,common_errors.eq.[]")
    .limit(limit);

  if (fetchError) {
    logger.error("Failed to fetch modules", { error: fetchError.message });
    throw fetchError;
  }

  // Also filter solves_problems empty on the app side (OR conditions in postgrest are limited)
  const candidates = (modules ?? []).filter((m: ModuleRow) => {
    const ce = m.common_errors as unknown;
    const sp = m.solves_problems as unknown;
    const ceEmpty = !ce || (Array.isArray(ce) && ce.length === 0) || ce === "[]";
    const spEmpty = !sp || (Array.isArray(sp) && sp.length === 0);
    return ceEmpty || spEmpty;
  });

  logger.info("Backfill started", { total_candidates: candidates.length, limit, dryRun });

  if (dryRun) {
    return createSuccessResponse(req, {
      dry_run: true,
      total_candidates: candidates.length,
      sample: candidates.slice(0, 5).map((m: ModuleRow) => ({ id: m.id, title: m.title })),
    });
  }

  let processed = 0;
  let failed = 0;
  const errors: { id: string; title: string; error: string }[] = [];

  // Process in batches
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (mod: ModuleRow) => {
        const fields = await generateDiagnoseFields(mod);

        const { error: updateError } = await supabase
          .from("vault_modules")
          .update({
            common_errors: fields.common_errors,
            solves_problems: fields.solves_problems,
          })
          .eq("id", mod.id);

        if (updateError) throw updateError;
        return mod.id;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        processed++;
      } else {
        failed++;
        errors.push({
          id: batch[j].id,
          title: batch[j].title,
          error: result.reason?.message ?? "Unknown error",
        });
        logger.warn("Module backfill failed", { id: batch[j].id, error: result.reason?.message });
      }
    }

    logger.info("Batch completed", { batch: Math.floor(i / BATCH_SIZE) + 1, processed, failed });

    // Delay between batches (except last)
    if (i + BATCH_SIZE < candidates.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  logger.info("Backfill completed", { processed, failed, total: candidates.length });

  return createSuccessResponse(req, {
    total_candidates: candidates.length,
    processed,
    failed,
    errors: errors.slice(0, 20), // Cap error list
  });
});
