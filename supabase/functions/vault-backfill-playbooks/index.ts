/**
 * vault-backfill-playbooks — One-shot administrative Edge Function.
 *
 * Converts existing `module_group` values in `vault_modules` into
 * `vault_playbooks` and `vault_playbook_modules` records.
 *
 * Logic:
 * 1. Query all distinct `module_group` values with >= `min_modules` global modules.
 * 2. For each group, create a `vault_playbooks` record (idempotent — skip if slug exists).
 * 3. For each module in the group, create a `vault_playbook_modules` junction record.
 *
 * Body params:
 *   - owner_user_id (required): UUID of the user who will own the playbooks.
 *   - min_modules (optional, default 3): Minimum modules per group to qualify.
 *   - dry_run (optional, default false): If true, returns plan without inserting.
 *
 * Auth: Manual execution only (no JWT, no API key). Protected by manual invocation.
 */

import { getSupabaseClient } from "../_shared/supabase-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const ownerUserId: string | undefined = body.owner_user_id;
    const minModules: number = body.min_modules ?? 3;
    const dryRun: boolean = body.dry_run ?? false;

    if (!ownerUserId) {
      return new Response(
        JSON.stringify({ error: "owner_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    if (fetchErr) {
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Group by module_group
    const groups = new Map<string, GroupModule[]>();
    for (const m of modules as GroupModule[]) {
      const key = (m as unknown as { module_group: string }).module_group;
      if (!key || key.trim() === "") continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    // 3. Filter groups with >= min_modules
    const qualifiedGroups = [...groups.entries()].filter(
      ([, mods]) => mods.length >= minModules,
    );

    // 4. Fetch existing playbook slugs to ensure idempotency
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
      return new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 6. Execute inserts
    let playbooksCreated = 0;
    let junctionsCreated = 0;
    const errors: Array<{ slug: string; error: string }> = [];

    for (const plan of plans) {
      // Insert playbook
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

      // Insert junction records
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

    return new Response(
      JSON.stringify({
        success: true,
        playbooks_created: playbooksCreated,
        junctions_created: junctionsCreated,
        skipped_existing: skipped.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
