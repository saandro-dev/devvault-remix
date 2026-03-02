

# Phase 6 — Diagnose and Validation Quality (Revised: True 10/10)

## Why the Previous Plan Was a 9, Not a 10

The previous plan had a fundamental architectural flaw that I initially tolerated: **it kept the wrong layer doing the heavy lifting.**

```text
CURRENT ARCHITECTURE (9/10):
  Edge Function (JS) fetches N modules → iterates in-memory → matches strings

  Problems:
  - .limit(50) or .limit(200) is a MAGIC NUMBER — arbitrary ceiling
  - JS does string matching on data that LIVES IN POSTGRES
  - Adding domain inference keywords requires CODE DEPLOYMENT
  - At 700 modules it works; at 70,000 it collapses
```

```text
10/10 ARCHITECTURE:
  Postgres does ALL matching via SQL functions → Edge Function only orchestrates

  Why:
  - ZERO arbitrary limits — Postgres checks ALL rows natively
  - String matching on JSONB is what Postgres was BUILT for
  - Domain keywords live in a DB table — no deployment needed
  - Scales to millions of modules without code changes
```

---

## The Core Insight

Strategies 1 (common_errors) and 2 (solves_problems) currently:
1. Fetch N modules into JS memory (arbitrary limit)
2. Loop through each module's JSONB/array fields
3. Do string comparison in JavaScript

This is **using JavaScript as a database engine**. It is architecturally wrong. Postgres has JSONB operators, `ILIKE`, `ANY()`, and full-text search that do this faster, without limits, and at the data layer where the data lives.

---

## Revised Solution Analysis

### Solution B (Previous): Increase limits + JS-based inferDomain
- Manutenibilidade: 9/10 — inferDomain map hardcoded in TS, requires deployment to update
- Zero DT: 9/10 — .limit(200) is still a magic number, will need increasing as data grows
- Arquitetura: 9/10 — JS doing string matching on data that lives in Postgres = wrong layer
- Escalabilidade: 9/10 — in-memory iteration doesn't scale past thousands
- Seguranca: 10/10
- **NOTA FINAL: 9.2/10**

### Solution C (Revised): SQL-native matching + DB-stored domain inference
- Manutenibilidade: 10/10 — domain keywords in DB table, matching logic in SQL functions, zero hardcoded maps
- Zero DT: 10/10 — no magic numbers, no arbitrary limits, no "increase later"
- Arquitetura: 10/10 — each layer does what it was designed for (Postgres matches data, JS orchestrates)
- Escalabilidade: 10/10 — SQL functions scale with Postgres indexes, not JS memory
- Seguranca: 10/10
- **NOTA FINAL: 10.0/10**

### Why Solution B is Inferior
Increasing `.limit(50)` to `.limit(200)` is a band-aid with a larger bandage. It will need to be 500 next year, then 1000. The JS string matching loop is the wrong abstraction — we're reimplementing SQL `ILIKE` in JavaScript. The hardcoded domain inference map requires a code deployment to add a keyword. All three issues stem from the same root cause: **logic that belongs in Postgres is running in JavaScript.**

---

## Implementation Plan

### Step 1 — Create SQL function `match_common_errors`

New Postgres function that replaces the JS `matchCommonErrors`:

```sql
CREATE OR REPLACE FUNCTION match_common_errors(
  p_error_text TEXT,
  p_domain TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
) RETURNS TABLE(
  id UUID, slug TEXT, title TEXT, domain TEXT,
  matched_error TEXT, quick_fix TEXT, error_cause TEXT,
  difficulty TEXT, estimated_minutes INT
)
```

Logic: Uses `jsonb_array_elements` to unnest `common_errors`, then `ILIKE` to match against the error text. **No arbitrary fetch limit** — Postgres scans all modules with non-null `common_errors` using its own query optimizer and indexes.

### Step 2 — Create SQL function `match_solves_problems`

Replaces JS `matchSolvesProblems`:

```sql
CREATE OR REPLACE FUNCTION match_solves_problems(
  p_error_text TEXT,
  p_tokens TEXT[] DEFAULT '{}',
  p_domain TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
) RETURNS TABLE(
  id UUID, slug TEXT, title TEXT, domain TEXT,
  matched_problem TEXT, match_quality TEXT,
  difficulty TEXT, estimated_minutes INT
)
```

Logic: Uses `unnest(solves_problems)` + `ILIKE` for exact substring match (high relevance), then token overlap via `array_length(ARRAY(SELECT ... WHERE problem ILIKE '%' || token || '%'), 1) >= 2` for partial match.

### Step 3 — Create table `domain_inference_keywords`

```sql
CREATE TABLE domain_inference_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  priority INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Populated with ~50 initial keywords:
- security: rls, row level security, policy, security definer, jwt, auth, rbac, csrf, xss, permission
- backend: edge function, supabase, database, migration, trigger, postgres, sql, rpc, webhook, api, cors, deno
- frontend: react, component, hook, useState, useEffect, tailwind, css, render, jsx, tsx, router
- architecture: clean architecture, solid, dependency injection, repository pattern
- devops: docker, ci, cd, deploy, pipeline, github actions, vercel

New SQL function:

```sql
CREATE OR REPLACE FUNCTION infer_domain_from_text(p_text TEXT)
RETURNS TEXT
```

Logic: Counts keyword matches per domain from the table, returns the domain with the most hits. Returns NULL if no matches — preserving current behavior (no filter applied).

Adding a new keyword = one INSERT. Zero deployments.

### Step 4 — Rewrite `diagnose-troubleshoot.ts`

The file becomes an **orchestrator** instead of a matching engine:

```text
BEFORE (current):
  handleTroubleshooting:
    1. extractKeywords (JS)
    2. matchCommonErrors: fetch 50 modules → JS loop → string match
    3. matchSolvesProblems: fetch 50 modules → JS loop → string match
    4. matchResolvedGaps: DB query (already correct)
    5. hybridSearchFallback: DB RPC (already correct)
    6. matchByTags: DB query + JS loop
    → merge + sort + return

AFTER (revised):
  handleTroubleshooting:
    1. infer domain: client.rpc('infer_domain_from_text', { p_text: errorMsg })
    2. client.rpc('match_common_errors', { p_error_text, p_domain })
    3. client.rpc('match_solves_problems', { p_error_text, p_tokens, p_domain })
    4. matchResolvedGaps: DB query (unchanged)
    5. hybridSearchFallback: DB RPC (unchanged, now receives inferred domain)
    6. matchByTags: DB query (unchanged, now receives inferred domain)
    → merge + sort + return
```

The file shrinks significantly. The `matchCommonErrors` and `matchSolvesProblems` JS functions are **deleted entirely** — their logic now lives in Postgres where it belongs. The `extractKeywords` function stays (used by Strategy 5 tag matching which is already DB-driven, just needs tokens). The `inferDomain` function is removed from JS — it's a DB function now.

### Step 5 — Update `vault_module_completeness` (SQL)

Add domain-aware logic: `database_schema` only penalizes when `domain IN ('backend', 'architecture', 'security')`.

For `frontend`, `devops`, `saas_playbook`: the field is excluded from both `v_total` and `v_missing`.

Impact: ~380 frontend/devops modules gain ~7 points each. Scores stop being uniformly 61.

### Step 6 — Deploy and Verify

- Deploy SQL migration (4 new functions + 1 table + 1 altered function)
- Deploy `devvault-mcp`
- Test `devvault_diagnose` with "RLS recursion infinite loop" — must return security/backend modules first
- Test `devvault_validate` on frontend module — `database_schema` must NOT appear in `missing_fields`
- Verify backend module still penalizes missing `database_schema`

---

## Files

### Create (1 SQL migration)
```text
supabase/migrations/XXXXXX_diagnose_sql_functions.sql
  - CREATE FUNCTION match_common_errors(...)
  - CREATE FUNCTION match_solves_problems(...)
  - CREATE TABLE domain_inference_keywords + seed data
  - CREATE FUNCTION infer_domain_from_text(...)
  - ALTER FUNCTION vault_module_completeness(...) — domain-aware database_schema
```

### Modify (1 file)
```text
supabase/functions/_shared/mcp-tools/diagnose-troubleshoot.ts
  - Delete matchCommonErrors JS function
  - Delete matchSolvesProblems JS function
  - Replace with client.rpc() calls
  - Add inferred domain logic at top of handleTroubleshooting
  - Keep extractKeywords, matchResolvedGaps, matchByTags, hybridSearchFallback
```

### Deploy (1)
```text
devvault-mcp
```

---

## Execution Sequence

```text
1. Create SQL migration with all 4 functions + 1 table + completeness fix
2. Seed domain_inference_keywords table (~50 keywords)
3. Rewrite diagnose-troubleshoot.ts as orchestrator
4. Deploy devvault-mcp
5. Test diagnose: "RLS recursion" → must prioritize security
6. Test diagnose: "React hook" → must prioritize frontend
7. Test validate: frontend module → database_schema not penalized
8. Test validate: backend module → database_schema still penalized
```

