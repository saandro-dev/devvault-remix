

# Audit Report v5.3.2 — Post-Implementation Verification

## Status: 3 Issues Found (2 bugs, 1 doc inconsistency)

---

## What Was Successfully Implemented

1. **vault-ingest REST endpoint** — All 12 missing fields correctly added to both ingest mapping (lines 142-153) and update `allowedFields` (lines 200-203). Fully aligned with MCP `update.ts`. PASS.
2. **vault-backfill-diagnose-fields** — Edge function created, deployed, and verified with a 5-module test. PASS (with caveats below).
3. **v5.3.1 and v5.3.2 changelogs** — Documented in `EDGE_FUNCTIONS_REGISTRY.md`. PASS.
4. **Previous bug fixes (BUG-4 through BUG-7)** — All confirmed working via agent tests. PASS.

---

## Issues Found

### Issue 1 (BUG): vault-backfill-diagnose-fields — Dead Client-Side Filter

**File:** `supabase/functions/vault-backfill-diagnose-fields/index.ts` (lines 126-143)

**Problem:** The SELECT on line 126 fetches `id, title, code, why_it_matters, usage_hint, tags, description` — but the client-side filter on lines 137-142 references `m.common_errors` and `m.solves_problems`, which are NOT in the SELECT. These will always be `undefined`, making the filter a no-op (all modules pass).

The `ModuleRow` interface (lines 22-30) also omits these fields, confirming the type mismatch.

**Impact:** The PostgREST `.or("common_errors.is.null,common_errors.eq.[]")` filter on line 128 partially compensates, but:
- Modules with non-null `common_errors` but empty `solves_problems` are NOT caught by the server filter
- The client-side filter was intended as a safety net but is dead code

**Root Cause:** Architectural oversight — the SELECT and the filter were written independently without verifying column alignment.

**Fix:**
- Add `common_errors, solves_problems` to the SELECT query
- Add `common_errors` and `solves_problems` to the `ModuleRow` interface
- Remove the server-side `.or()` filter (redundant with a correct client-side filter) OR fix the server-side filter to also cover `solves_problems`

### Issue 2 (BUG): vault-backfill-diagnose-fields — Missing Sentry Wrapper

**File:** `supabase/functions/vault-backfill-diagnose-fields/index.ts` (line 102)

**Problem:** Uses bare `Deno.serve(async (req) => {...})` instead of `Deno.serve(withSentry("vault-backfill-diagnose-fields", async (req) => {...}))`. Every other non-utility edge function in the project uses `withSentry` for error tracking. This is an inconsistency that could mask runtime errors during a 500+ module backfill.

**Fix:** Import `withSentry` from `../_shared/sentry.ts` and wrap the handler.

### Issue 3 (DOC): EDGE_FUNCTIONS_REGISTRY.md — Count Mismatch

**File:** `docs/EDGE_FUNCTIONS_REGISTRY.md` (lines 15, 19, 74, 79, 90)

**Problem:** Multiple references still say "16 functions" or "16 config.toml entries" despite the addition of `vault-backfill-diagnose-fields` making it 17 total:
- Badge line 15: `17 Edge Functions` — CORRECT
- Badge line 19: `verify_jwt: false (ALL 16 functions)` — WRONG, should be 17
- Summary line 79: `config.toml entries: 16` — WRONG, should be 17
- Line 90: `All 16 functions use verify_jwt = false` — WRONG, should be 17

**Fix:** Update all occurrences of "16" to "17" in the badge and summary section.

---

## Backfill Data Status

- **Total global modules:** 578
- **Modules with common_errors populated:** 5 (from test run)
- **Modules still needing backfill:** 573
- The backfill function works but has not been run at full scale yet

---

## Protocol Compliance Check (Section 3 / Section 4)

| Criterion | Status |
|---|---|
| Zero Remendos (4.1) | Issue 1 is dead code, not a band-aid — but it needs root-cause fix |
| Arquiteto Antes de Pedreiro (4.2) | The SELECT/filter mismatch shows code was written before verifying data flow |
| MVP Arquitetural (4.3) | The overall architecture is sound |
| Divida Tecnica Zero (4.4) | 3 issues above constitute minor technical debt |
| Code Hygiene (5.4) | File is 211 lines, under 300 limit. PASS |
| Clean Architecture (5.3) | Single Responsibility maintained. PASS |

---

## Execution Plan

### 1. Fix vault-backfill-diagnose-fields (Issues 1 + 2)

- Add `common_errors, solves_problems` to SELECT query
- Add both fields to `ModuleRow` interface
- Improve server-side filter: `.or("common_errors.is.null,common_errors.eq.[],solves_problems.is.null,solves_problems.eq.{}")`
- Wrap handler with `withSentry`

### 2. Fix documentation counts (Issue 3)

- Update badge: "ALL 16 functions" to "ALL 17 functions"
- Update summary: "config.toml entries" from 16 to 17
- Update text: "All 16 functions" to "All 17 functions"

### Files Affected

```text
supabase/functions/vault-backfill-diagnose-fields/index.ts  -- Fix: SELECT + types + Sentry
docs/EDGE_FUNCTIONS_REGISTRY.md                             -- Fix: 16 -> 17 counts
```

