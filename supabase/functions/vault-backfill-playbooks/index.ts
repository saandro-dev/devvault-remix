/**
 * vault-backfill-playbooks — Administrative Edge Function.
 *
 * Converts existing `module_group` values in `vault_modules` into
 * `vault_playbooks` and `vault_playbook_modules` records.
 *
 * This is NOT a field enrichment backfill — it creates new entities.
 * Therefore it does NOT use the backfill engine (different output pattern).
 *
 * Standardized to use: withSentry + api-helpers + cors-v2.
 */

import { handleCorsV2, createSuccessResponse, createErrorResponse, ERROR_CODES } from "../_shared/api-helpers.ts";
import { withSentry } from "../_shared/sentry.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { authenticateRequest, isResponse } from "../_shared/auth.ts";
import { requireRole } from "../_shared/role-validator.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("vault-backfill-playbooks");

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mode<T>(arr: T[]): T {
  const freq = new Map<T, number>();
  let maxCount = 0;
  let result = arr[0];
  for (const item of arr) {
    const count = (freq.get(item) || 0) + 1;
    freq.set(item, count);
    if (count > maxCount) {
      maxCount = count;
      result = item;
    }
  }
  return result;
}

function buildDescription(titles: string[]): string {
  if (titles.length <= 5) {
    return `Implementation guide covering: ${titles.join(", ")}.`;
  }
  const shown = titles.slice(0, 5).join(", ");
  return `Implementation guide covering: ${shown}, and ${titles.length - 5} more modules.`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface GroupModule {
  id: string;
  title: string;
  module_group: string;
  domain: string | null;
  difficulty: string | null;
  tags: string[];
  implementation_order: number | null;
  created_at: string;
}

interface PlaybookPlan {
  slug: string;
  title: string;
  description: string;
  domain: string | null;
  difficulty: string | null;
  tags: string[];
  module_count: number;
  modules: Array<{ id: string; position: number }>;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(withSentry("vault-backfill-playbooks", async (req: Request) => {
  const corsResponse = handleCorsV2(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "Only POST is accepted.", 405);
  }

  // Authentication + admin role check
  const auth = await authenticateRequest(req);
  if (isResponse(auth)) return auth;
  const { user } = auth;
  await requireRole(getSupabaseClient("general"), user.id, "admin");

  logger.info("playbook backfill request", { userId: user.id });

  const body = await req.json();
  const ownerUserId: string | undefined = body.owner_user_id;
  const minModules: number = body.min_modules ?? 3;
  const dryRun: boolean = body.dry_run ?? false;

  if (!ownerUserId) {
    return createErrorResponse(req, ERROR_CODES.VALIDATION_ERROR, "owner_user_id is required.", 400);
  }

  const client = getSupabaseClient("general");

  // 1. Fetch all global modules with a module_group
  const { data: modules, error: fetchErr } = await client
    .from("vault_modules")
    .select("id, title, module_group, domain, difficulty, tags, implementation_order, created_at")
    .eq("visibility", "global")
    .not("module_group", "is", null)
    .order("module_group")
    .order("implementation_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (fetchErr) throw fetchErr;

  // 2. Group by module_group
  const groups = new Map<string, GroupModule[]>();
  for (const m of (modules ?? []) as GroupModule[]) {
    const key = m.module_group;
    if (!key || key.trim() === "") continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  // 3. Filter groups with >= min_modules
  const qualifiedGroups = [...groups.entries()].filter(
    ([, mods]) => mods.length >= minModules,
  );

  // 4. Fetch existing playbook slugs for idempotency
  const { data: existingPlaybooks } = await client
    .from("vault_playbooks")
    .select("slug");
  const existingSlugs = new Set(
    (existingPlaybooks ?? []).map((p: { slug: string }) => p.slug),
  );

  // 5. Build plan
  const plans: PlaybookPlan[] = [];
  const skipped: string[] = [];

  for (const [groupSlug, mods] of qualifiedGroups) {
    if (existingSlugs.has(groupSlug)) {
      skipped.push(groupSlug);
      continue;
    }

    const titles = mods.map((m) => m.title);
    const domains = mods.map((m) => m.domain).filter(Boolean) as string[];
    const difficulties = mods.map((m) => m.difficulty).filter(Boolean) as string[];
    const allTags = mods.flatMap((m) => m.tags);
    const uniqueTags = [...new Set(allTags)].slice(0, 10);

    const modulesWithPosition = mods.map((m, idx) => ({
      id: m.id,
      position: m.implementation_order ?? idx + 1,
    }));

    plans.push({
      slug: groupSlug,
      title: humanizeSlug(groupSlug),
      description: buildDescription(titles),
      domain: domains.length > 0 ? mode(domains) : null,
      difficulty: difficulties.length > 0 ? mode(difficulties) : null,
      tags: uniqueTags,
      module_count: mods.length,
      modules: modulesWithPosition,
    });
  }

  if (dryRun) {
    return createSuccessResponse(req, {
      dry_run: true,
      total_groups_found: groups.size,
      qualified_groups: qualifiedGroups.length,
      will_create: plans.length,
      skipped_existing: skipped.length,
      skipped_slugs: skipped,
      plans: plans.map((p) => ({
        slug: p.slug,
        title: p.title,
        domain: p.domain,
        difficulty: p.difficulty,
        module_count: p.module_count,
        tags: p.tags,
        description: p.description.substring(0, 120) + "...",
      })),
    });
  }

  // 6. Execute inserts
  let playbooksCreated = 0;
  let junctionsCreated = 0;
  const errors: Array<{ slug: string; error: string }> = [];

  for (const plan of plans) {
    const { data: pbData, error: pbErr } = await client
      .from("vault_playbooks")
      .insert({
        slug: plan.slug,
        title: plan.title,
        description: plan.description,
        domain: plan.domain,
        difficulty: plan.difficulty,
        tags: plan.tags,
        status: "published",
        user_id: ownerUserId,
      })
      .select("id")
      .single();

    if (pbErr) {
      errors.push({ slug: plan.slug, error: pbErr.message });
      continue;
    }

    playbooksCreated++;

    const junctions = plan.modules.map((m) => ({
      playbook_id: pbData.id,
      module_id: m.id,
      position: m.position,
    }));

    const { error: jErr } = await client
      .from("vault_playbook_modules")
      .insert(junctions);

    if (jErr) {
      errors.push({ slug: plan.slug, error: `Junction: ${jErr.message}` });
    } else {
      junctionsCreated += junctions.length;
    }
  }

  logger.info("playbook backfill complete", { playbooksCreated, junctionsCreated, skipped: skipped.length });

  return createSuccessResponse(req, {
    success: true,
    playbooks_created: playbooksCreated,
    junctions_created: junctionsCreated,
    skipped_existing: skipped.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}));
