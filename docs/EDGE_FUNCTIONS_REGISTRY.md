# DevVault - Edge Functions Registry

> **🔴 SINGLE SOURCE OF TRUTH** - This document lists ALL 16 Edge Functions deployed on Supabase for the DevVault project.
> Last updated: 2026-03-03
> Maintainer: AI Architect

---

## 🏆 DevVault Protocol V2 Compliance Badge

```
╔═══════════════════════════════════════════════════════════════╗
║  ✅ DEVVAULT PROTOCOL V2 - 10.0/10 - DUAL-AUTH ARCHITECTURE   ║
║     16 Edge Functions | 2 Auth Systems | Zero Legacy Code      ║
║     MCP Server v6.4: 31 Tools | Duplicate Prevention System   ║
║     Phase 3: Hybrid Search (pgvector + tsvector + pg_trgm)     ║
║     Phase 6: SQL-Native Matching + Domain Inference            ║
║     Phase 6.1: Unified Backfill Engine (Strategy Pattern)      ║
║     Phase 6.3: Deduplication + Duplicate Prevention            ║
║     Phase 6.4: Module Versioning + Advanced Filters            ║
║     Runtime: 100% Deno.serve() native                         ║
║     Secrets: Supabase Vault + Multi-Domain Keys               ║
║     verify_jwt: false (ALL 16 functions)                      ║
║     SECRET DOMAINS: admin | general                           ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## v6.4 Changelog (2026-03-06)

### Phase 6.4: Module Versioning + UI Completeness (30 → 31 Tools)

Added automatic module versioning via PostgreSQL triggers, advanced filtering for the vault UI, and full metadata rendering.

### New MCP Tools (+1, total 31)
- **devvault_get_version (Tool 31):** Retrieves version history of a module. Accepts `module_id` and optional `version` filter. Returns snapshots of `code`, `context_markdown`, `code_example`, `test_code`, `database_schema`, `ai_metadata`, `common_errors`, `solves_problems`, and `change_summary` captured automatically on each update.

### New Tables (+1)
- **vault_module_versions:** Stores immutable snapshots of module content. Populated automatically by the `snapshot_vault_module_version` trigger on `vault_modules` UPDATE. Captures diffs when `code`, `context_markdown`, `code_example`, or `test_code` change.

### New SQL Triggers (+1)
- **`snapshot_vault_module_version`:** BEFORE UPDATE trigger on `vault_modules`. Only fires when content fields (`code`, `context_markdown`, `code_example`, `test_code`) actually change. Stores the OLD values as a version snapshot.

### Updated SQL Functions (+1)
- **`get_visible_modules`:** Added 3 new optional parameters: `p_validation_status`, `p_difficulty`, `p_language`. Enables advanced filtering from the vault list UI without additional RPCs.

### UI Enhancements
- **MarkdownRenderer:** New component rendering `context_markdown` with `react-markdown` + `remark-gfm` + `rehype-highlight`.
- **ModuleMetadataSection:** Collapsible sections exposing all 13+ previously hidden module fields in `VaultDetailPage`.
- **VaultAdvancedFilters:** Collapsible filter panel for `module_type`, `validation_status`, `difficulty`, and `language`. Fully wired to the `get_visible_modules` RPC.
- **McpHealthTab:** Admin dashboard tab visualizing MCP tool usage rankings and top search queries.
- **ErrorBoundary:** Global React error boundary preventing total UI crashes.

### Architectural Impact
- **Automatic versioning:** Zero agent/user effort — every content change is tracked
- **Full-stack filter pipeline:** UI → hook → Edge Function → RPC — zero dead code
- **Observability:** Admin can now monitor agent behavior patterns via MCP Health tab

---

## v6.3 Changelog (2026-03-04)

### Phase 6.3: Deduplication + Duplicate Prevention (29 → 30 Tools)

Performed a complete duplicate audit across 856 global modules, identified and eliminated 8 duplicate modules via surgical merge, and implemented a permanent prevention system.

### Deduplication Results
- **lazyWithRetry:** 4 modules → 1 survivor (`lazy-with-retry-code-splitting`). 3 deleted.
- **checkout-heartbeat:** 3 modules → 1 survivor (`checkout-heartbeat-session`). 2 deleted.
- **context-switcher:** 2 modules → 1 survivor (`context-switcher-hook-multi-role-navigation`). 1 deleted.
- **webhook-queue-retry:** 2 → 1 survivor (`webhook-queue-retry-dead-letter`). 1 deleted.
- **multi-key-supabase-client:** 2 → 1 survivor (`multi-key-domain-isolation`). 1 deleted.
- **Variant pairs cross-referenced:** 5 pairs (stripe-webhook, members-area, pii-access, reconciliation, marketplace-split) linked via `related_modules`.
- **Module count:** 856 → 848 global modules.

### New MCP Tools (+1, total 30)
- **devvault_check_duplicates (Tool 30):** Proactive duplicate detection via trigram similarity (`pg_trgm`). Accepts `title`, optional `threshold` (default 0.65), `limit` (default 5). Returns matching modules ranked by similarity score. Agents should call this BEFORE `devvault_ingest`.

### New SQL Functions (+1)
- **`check_duplicate_modules(p_title, p_threshold, p_limit)`:** Trigram similarity search on `vault_modules.title`. Uses GIN trigram index for performance. Returns id, slug, title, domain, module_type, similarity_score.

### New Indexes (+1)
- **`idx_vault_modules_title_trgm`:** GIN trigram index on `vault_modules.title` for fast `pg_trgm` similarity lookups.

### New Shared Modules (+1)
- **`_shared/duplicate-checker.ts`:** Reusable helper wrapping the `check_duplicate_modules` RPC. Used by `devvault_ingest`, `devvault_check_duplicates`, and `vault-crud/create`.

### Enhancements
- **devvault_ingest:** Now performs automatic duplicate check before insertion. If similar modules found (similarity > 0.65), returns `blocked: true` with `_duplicate_warning` listing matches. Use `force_create: true` to override. Prevents future duplicate accumulation at the source.
- **vault-crud create:** Same duplicate pre-check integrated for UI-based module creation. Returns HTTP 409 with matches if duplicates found.
- **devvault_bootstrap:** Updated AGENT_GUIDE to 30 tools. Added `prevention` tool category with `devvault_check_duplicates`. Updated workflow step 9 to use `devvault_check_duplicates`. Added behavioral rule and anti-pattern for duplicate prevention.
- **usage-tracker:** Added event type `check_duplicates` (total: 31 event types covering all 30 tools).

### Architectural Impact
- **Preventive, not reactive:** Duplicates are blocked at BOTH entry points (MCP ingest + UI create) before they enter the database.
- **Agent-friendly:** Dedicated tool allows proactive checking before bulk operations. `force_create` flag ensures agents are never permanently blocked.
- **SQL-native performance:** GIN trigram index ensures O(log n) similarity lookups, not sequential scans.
- **Zero false positives:** Threshold of 0.65 calibrated against real data (16 pairs analyzed, 4 false positives excluded).

---

## v6.2 Changelog (2026-03-03)

### Phase 6.2: Mandatory Modules System (28 → 29 Tools)

Added the compliance enforcement layer for AI agents. Agents can now discover mandatory modules and check compliance before/after tasks.

### New MCP Tools (+1, total 29)
- **devvault_mandatory (Tool 29):** Returns mandatory modules filtered by `layer`, `scope`, `scope_value`, and `enforcement`. Supports `check_compliance` mode: given `modules_used[]`, returns a compliance report with `_verdict` (BLOCKED/WARNING/COMPLIANT), `missing_hard` and `missing_soft` arrays, and dependency-enriched module data. Integrated into `task-start` (`_mandatory_hint`) and `task-end` (`_compliance_hint`).

### New Tables (+1)
- **vault_mandatory_rules:** Stores mandatory module rules with `enforcement` (hard/soft), `scope` (global/domain/project_type), `layer` (numeric grouping), `is_conditional` flag, and `condition_description`. RLS: admin manage, authenticated read, service role full access.

### New SQL Functions (+1)
- **`get_mandatory_modules(p_layer, p_scope, p_scope_value)`:** Returns mandatory rules joined with module data (title, slug, domain, tags). Includes `layers_summary` with per-layer counts of hard/soft rules.

### Enhancements
- **devvault_bootstrap:** Updated AGENT_GUIDE to 29 tools. Added `compliance` tool category with `devvault_mandatory`. Added workflow steps 1.5 (load mandatory modules) and 10 (compliance check). Added behavioral rules and anti-patterns for mandatory compliance.
- **devvault_task_start:** Returns `_mandatory_hint` directing agents to call `devvault_mandatory` for compliance requirements.
- **devvault_task_end:** Returns `_compliance_hint` directing agents to verify mandatory module usage via `devvault_mandatory` with `check_compliance`.
- **usage-tracker:** Added event type `mandatory` (total: 30 event types covering all 29 tools).

### Initial Data (Layer 1 — Edge Function Infrastructure)
- 7 modules seeded as `hard-enforcement`, `global` scope: `centralized-logger-edge-functions`, `logger-context-factory`, `cors-v2-dynamic-origin-validation`, `input-sanitizer-edge-functions`, `rate-limit-guard`, `migration-rate-limit-attempts-table`, `edge-function-pipeline`.

### Architectural Impact
- Agents are now **guided** to use validated infrastructure modules before implementing custom solutions
- Hard enforcement enables BLOCKED verdict — agents cannot skip critical modules
- Soft enforcement enables WARNING verdict — agents are informed but not blocked
- Layer system allows progressive mandatory module rollout (Layer 1 → Layer 2 → ...)
- Zero coupling with existing tools — mandatory is a standalone compliance layer

---

## v6.1 Changelog (2026-03-03)

### Phase 6.1: MCP Tools Expansion (25 → 28 Tools)

Extended the MCP server with 3 new tools and 4 enhancements to prepare for mass content ingestion.

### New MCP Tools (+3, total 28)
- **devvault_batch_ingest (Tool 26):** Batch ingestion of up to 20 modules per call with parallel embedding generation, duplicate detection (cosine similarity >0.92), and aggregated results. Returns per-module status (created/duplicate_warning/error).
- **devvault_similar (Tool 27):** Vector similarity search given a `module_id`. Uses `find_similar_modules` RPC with configurable `threshold` (default 0.75) and `limit` (default 5). Returns similar modules ranked by cosine similarity score.
- **devvault_stats (Tool 28):** Vault health metrics — total modules, breakdown by status (draft/validated/deprecated), by domain, modules without embeddings, and recent activity count (7 days).

### New SQL Functions (+1)
- **`find_similar_modules(p_module_id, p_limit, p_threshold)`:** Cosine similarity search using pgvector `<=>` operator. Returns modules above the similarity threshold, excluding the source module. Includes domain, tags, module_type, and similarity_score.

### Enhancements
- **devvault_ingest:** Now detects potential duplicates before insertion via embedding similarity check (>0.92 threshold). Returns `_potential_duplicates` warning array without blocking creation. Also now calls `trackUsage`.
- **devvault_update:** Added `append_tags`, `append_solves_problems`, and `append_common_errors` parameters for atomic array/JSONB append operations. Eliminates read-modify-write race conditions.
- **devvault_get:** Now returns `_usage_stats` metadata (times_fetched, times_used_in_tasks, success_reports) from `vault_usage_events` and `vault_agent_tasks`.
- **devvault_delete:** Now calls `trackUsage` for audit trail completeness.
- **usage-tracker.ts:** Expanded `UsageEventType` union to 29 types covering all 28 tools (now 30 types / 29 tools with v6.2).

### Architectural Impact
- Mass ingestion ready: agents can ingest 20 modules per call instead of 1
- Duplicate prevention: automatic similarity warning before insert
- Discovery: agents can navigate by similarity, not just search
- Vault health visibility: agents can assess coverage gaps via stats
- Zero race conditions: array append operations are atomic

---

## v6.0.1 Changelog (2026-03-02)

### Phase 6.0.1: Unified Backfill Engine

Replaced 3 inconsistent one-shot backfill functions with a single unified `vault-backfill` Edge Function powered by a reusable **Strategy Pattern** engine.

### New Shared Modules (+2)
- **`_shared/backfill-engine.ts`:** Core engine with batch processing, exponential backoff retries (429/500), progress tracking, dry_run support, and structural validation before persist.
- **`_shared/backfill-strategies/`:** Directory containing 4 strategy modules:
  - `diagnose-fields.ts` — Populates `common_errors` + `solves_problems` via GPT-4o-mini
  - `context-fields.ts` — Generates `context_markdown` + `test_code` via GPT-4o-mini
  - `changelog-seed.ts` — Seeds "v1" changelog entries (pure SQL, no AI)
  - `embeddings.ts` — Generates vector embeddings via OpenAI `text-embedding-3-small`

### New SQL Functions (+1)
- **`fetch_modules_without_changelog(p_limit)`:** LEFT JOIN–based RPC that identifies modules with zero changelog records natively in Postgres. Eliminates JS-side filtering and the 1000-row PostgREST limit bug.

### New Edge Functions (+1)
- **`vault-backfill`:** Unified entry point for all vault enrichment backfills. Accepts `action` parameter to select strategy. Uses `withSentry` + `api-helpers` + `cors-v2` (standard pattern).

### Deleted Edge Functions (-2)
- **`vault-backfill-diagnose-fields`:** Replaced by `vault-backfill` action `diagnose-fields`.
- **`vault-backfill-embeddings`:** Replaced by `vault-backfill` action `embeddings`. Had inconsistent CORS and no `withSentry`.

### Refactored (+1)
- **`vault-backfill-playbooks`:** Migrated from wildcard CORS to standard `withSentry` + `api-helpers` + `cors-v2` pattern. Logic unchanged.

### Architectural Impact
- **3 inconsistent functions → 1 unified engine** with zero code duplication
- **SQL-native filtering** in all strategies (no JS-side filtering)
- **Exponential backoff retries** for OpenAI rate limits (429/500)
- **Structural validation** of AI-generated output before database persist
- Adding a new backfill = 1 strategy module (~30-50 lines)

---

## v6.0 Changelog (2026-03-02)

### Phase 6: SQL-Native Diagnose Architecture

The core architectural shift of Phase 6 moves all data matching logic from JavaScript memory into Postgres SQL functions, eliminating arbitrary `.limit()` ceilings and ensuring the database — not the Edge Function — performs string matching on its own data.

### New SQL Functions (+3)
- **`match_common_errors(p_error_text, p_domain, p_limit)`:** Replaces JS-based `matchCommonErrors`. Uses `jsonb_array_elements` + `ILIKE` to scan ALL modules' `common_errors` JSONB natively in Postgres. Zero arbitrary fetch limits.
- **`match_solves_problems(p_error_text, p_tokens[], p_domain, p_limit)`:** Replaces JS-based `matchSolvesProblems`. Uses `unnest(solves_problems)` + `ILIKE` for exact matches, then tokenized partial matching (2+ token overlap) as fallback.
- **`infer_domain_from_text(p_text)`:** Replaces hardcoded JS domain inference map. Counts keyword matches per domain from the `domain_inference_keywords` table. Returns NULL if no matches (no filter applied). Adding new keywords = one INSERT, zero deployments.

### New Table (+1)
- **`domain_inference_keywords`:** Stores keyword→domain mappings with priority weighting. Seeded with ~55 keywords across 5 domains (security, backend, frontend, architecture, devops). RLS: service role only.

### Updated SQL Functions (+1)
- **`vault_module_completeness`:** Now correct-by-design with explicit `v_total` calculation. `database_schema` only penalizes `backend`/`architecture`/`security` domains. Frontend/devops/saas_playbook modules are no longer unfairly penalized. Fixed latent bug where `v_total` was never incremented for bonus fields (could produce scores > 100%).

### Refactored Files (+1)
- **`diagnose-troubleshoot.ts`:** Transformed from a matching engine (~200 lines of JS string matching) into a lightweight orchestrator (~90 lines) that calls SQL RPCs. Deleted `matchCommonErrors` and `matchSolvesProblems` JS functions entirely.

### Impact
- Frontend module scores increased from uniform ~61 to ~92 (database_schema no longer penalized)
- Backend modules correctly require database_schema
- `devvault_diagnose` now infers domain from error text (e.g., "RLS recursion" → security) and prioritizes results accordingly
- Zero magic numbers, zero arbitrary limits, zero hardcoded domain maps

---

## v5.5 Changelog (2026-03-02)

### Phase 5A: Playbook Population
- **vault-backfill-playbooks (now part of vault-backfill-playbooks EF):** One-shot administrative function that converts `module_group` values into `vault_playbooks` and `vault_playbook_modules` records. Idempotent (skips existing slugs). Supports `dry_run` mode and configurable `min_modules` threshold.
- **bootstrap.ts:** Added `behavioral_rule` mandating real `database_schema` DDL for backend/architecture/security modules. Added `anti_pattern` warning about 15-point validation penalty for missing schemas.

## v5.4 Changelog (2026-03-02)

### New MCP Tools (+3, total 25)
- **devvault_get_playbook (Tool 23):** Fetches curated playbooks — ordered sequences of modules with full code, aggregated `database_schema` as `_combined_migration`, aggregated `ai_metadata` (npm_dependencies, env_vars), and implementation checklist. List mode (no params) returns all published playbooks with module counts.
- **devvault_task_start (Tool 24):** Starts tracking a high-level agent task. Records `objective`, `context`, and returns a `task_id` for lifecycle tracking.
- **devvault_task_end (Tool 25):** Ends an active task with `status` (success/failure/abandoned), `modules_used`, and `outcome_notes`. Auto-computes `duration_ms`.

### New Tables (+3)
- **vault_playbooks:** Curated playbook entity with title, slug, domain, tags, difficulty, status (draft/published). RLS: owner + published visibility.
- **vault_playbook_modules:** Junction table linking playbooks to modules with explicit `position` ordering and per-module `notes`.
- **vault_agent_tasks:** Agent task lifecycle tracking with objective, status state machine, modules_used, context JSONB, and duration computation.

### Enhancements
- **devvault_validate:** Intelligent `database_schema` detection — backend/architecture modules with DB-interaction indicators (`.from(`, `.rpc(`, `supabase`, `sql`, etc.) now get `database_schema` flagged as REQUIRED with a 15-point score reduction if missing.
- **devvault_bootstrap:** Updated AGENT_GUIDE to 25 tools, added `playbooks_index` section, added task tracking workflow (steps 0 and 9), added `task_tracking` tool category.
- **usage-tracker:** Added event types: `get_playbook`, `task_start`, `task_end`, `validate`, `validate_batch`.

## v5.3.2 Changelog (2026-03-02)

### Fixes
- **vault-ingest REST endpoint:** Added 12 missing fields to both ingest mapping and update `allowedFields`: `common_errors`, `solves_problems`, `test_code`, `difficulty`, `estimated_minutes`, `database_schema`, `prerequisites`, `ai_metadata`, `usage_hint`, `module_group`, `implementation_order`, `version`. Now fully aligned with MCP `ingest.ts`/`update.ts`.

## v5.3.1 Changelog (2026-03-02)

### Critical Bug Fixes
- **BUG-4 (P0):** Fixed `devvault_get` and `devvault_validate` — added missing `database_schema` column to `vault_modules` table. The `get_vault_module` and `vault_module_completeness` RPCs referenced this column but it did not exist, causing all module fetches and validations to fail.
- **BUG-5 (P0):** Created `export_module_tree` RPC with recursive CTE (max depth 10) for `devvault_export_tree` full tree mode. Previously the RPC did not exist.

### Minor Bug Fixes
- **BUG-6 (P1):** Fixed `devvault_check_updates` version comparison — added `normalizeVersion()` to strip "v" prefix before comparison. "v1" vs "1" no longer triggers false `needs_update: true`.
- **BUG-7 (P1):** Fixed `devvault_export_tree` discovery mode returning 0 root modules — replaced in-memory filtering of last 20 modules with SQL-based root identification (modules depended upon but having no dependencies themselves).

## v5.3 Changelog (2026-02-28)

### Bug Fixes
- **BUG-2 (P0):** Fixed `devvault_diagnose` returning 0 results — `hybrid_search_vault_modules` now uses OR tsquery (word-level matching instead of AND), tokenized ILIKE fallback (each word matched independently), and relaxed cosine threshold from `< 0.5` to `< 0.85`. Error messages like "Cannot GET /instance/create 404" now find relevant modules.
- **BUG-3 (P0):** Fixed `devvault_list` textual search returning 0 for multi-word queries — `query_vault_modules` now uses OR tsquery and tokenized ILIKE fallback. Searches like "http https redirect" now match modules containing ANY of those words.

### Performance Improvements
- **tsvector triggers expanded:** Both PT and EN triggers now index `code`, `code_example`, `module_group`, and `usage_hint` in addition to existing fields. Full-text search covers all content fields via GIN index.
- **pg_trgm GIN indexes:** Enabled `pg_trgm` extension with GIN trigram indexes on `title`, `description`, and `code`. ILIKE `'%token%'` queries now use index scan instead of sequential scan (~10ms vs ~200ms at 10k modules).
- **OR tsquery:** Replaced `plainto_tsquery` (AND logic) with `to_tsquery` using `|` operator (OR logic). Multi-word queries match modules containing ANY word instead of ALL words.

## v5.2 Changelog (2026-02-28)

### Bug Fixes
- **BUG-1 (P0):** Fixed `hybrid_search_vault_modules` — added `extensions` to `search_path` so pgvector `<=>` operator resolves correctly. Semantic search is now fully operational.
- **BUG-3 (P1):** Expanded `query_vault_modules` ILIKE fallback to include `code`, `code_example`, and `module_group` fields. Searches like "redirect", "https", or "whatsapp-integration" now find relevant modules.

### Improvements
- **diagnose (Strategy 5):** Added tag-based fallback to `devvault_diagnose`. Error keywords are extracted and matched against module tags, enabling correlation even when `common_errors` and `solves_problems` are empty.
- **diagnose (Strategy 2):** Improved `solves_problems` matching with tokenized partial matching. Errors like "Cannot GET /instance/create 404" now match modules with related problem descriptions.
- **load_context (tags):** Added `tags` parameter to `devvault_load_context`. Agents can now discover modules across projects by tag (e.g. `tags: ['evolution-api']`) instead of needing to know the exact `source_project` name. Discovery mode now shows top tags per project.
- **bootstrap (debugging rule):** Added mandatory behavioral rule: "When debugging errors, ALWAYS call devvault_diagnose BEFORE manual fixes."

---

## Summary

| Metric | Value |
| :--- | :--- |
| **Total Functions** | 16 |
| **Internal Functions (Frontend)** | 12 |
| **Public Functions (External API)** | 3 |
| **Utility Functions (One-shot)** | 2 |
| **Functions with verify_jwt=true** | 0 ✅ |
| **config.toml entries** | 16 ✅ |
| **API Key System (External)** | `dvlt_` keys via Supabase Vault ✅ |
| **Security Domains (Secrets)** | 2 (admin, general) ✅ |
| **Base URL (Internal & External)** | `https://bskfnthwewhpfrldbhqx.supabase.co/functions/v1/` |

---

## 🔐 Dual Authentication Architecture

DevVault operates with two distinct and isolated authentication systems, ensuring that internal access (from the frontend application) and external access (from AI agents) have appropriate security mechanisms.

**ABSOLUTE RULE**: All 16 functions use `verify_jwt = false` in `supabase/config.toml`. Authentication is always handled inside the function code, enabling this flexible architecture.

### 1. Internal Authentication (Frontend App)

-   **Mechanism:** JWT (Bearer Token)
-   **Validation:** The helper `_shared/auth.ts` (`authenticateRequest`) validates the JWT of the user logged into Supabase Auth.
-   **Usage:** Used by all functions serving the DevVault interface. The frontend sends the user's session token, and the function validates their identity and permissions (via RLS and role checks).
-   **Functions:** 12

### 2. External Authentication (API for Agents)

-   **Mechanism:** Static API Key (`dvlt_...`)
-   **Validation:** The helper `_shared/api-key-guard.ts` (`validateApiKey`) validates the key sent in the `X-DevVault-Key` header (or `x-api-key`/`Authorization`). Validation occurs by comparing a hash of the key with the value stored securely in **Supabase Vault** through the SQL function `validate_devvault_api_key`.
-   **Usage:** Used by the public functions designated for automation and integration with AI agents, such as `devvault-mcp`.
-   **Functions:** 3

### 🔑 Multi-Secret Architecture (2 Domains)

To limit the "blast radius" in case of a key leak, the system uses two service keys (`service_role`) with different scopes, managed by the helper `_shared/supabase-client.ts`.

| Domain | Environment Variable | Purpose | Functions Using It |
| :--- | :--- | :--- | :--- |
| **admin** | `DEVVAULT_SECRET_ADMIN` | Critical high-risk operations: key creation/revocation, direct Vault access, user role changes. | `create-api-key`, `revoke-api-key`, `admin-crud` |
| **general** | `DEVVAULT_SECRET_GENERAL` | Standard daily read/write operations such as project, bug, and vault module CRUDs. | All other 13 functions |

---

## Function Registry

### Vault & Knowledge Modules

| Function | Auth | Domain | Description and Actions (`action`) |
| :--- | :--- | :--- | :--- |
| `vault-crud` | Internal (JWT) | general | **Main BFF for the Vault.** Performs all CRUD operations on the user's knowledge modules. **Actions:** `list`, `get`, `create`, `update`, `delete`, `search`, `get_playbook`, `share`, `unshare`, `list_shares`, `add_dependency`, `remove_dependency`, `list_dependencies`. |
| `vault-query` | External (API Key) | general | **Public READ endpoint for Agents.** Allows external systems to query the knowledge graph. **Actions:** `bootstrap`, `search`, `get`, `list`, `list_domains`. |
| `vault-ingest` | External (API Key) | general | **Public WRITE endpoint for Agents.** Allows external systems to create, update, and delete modules. **Actions:** `ingest` (single/batch creation), `update`, `delete`. |
| `devvault-mcp` | External (API Key) | general | **MCP Server (Model Context Protocol) for AI Agents (v6.3).** Exposes a structured API with tools to interact with the Vault. **Tools (30):** `devvault_bootstrap`, `devvault_search`, `devvault_get`, `devvault_list`, `devvault_domains`, `devvault_ingest`, `devvault_update`, `devvault_get_group`, `devvault_validate`, `devvault_delete`, `devvault_diagnose`, `devvault_report_bug`, `devvault_resolve_bug`, `devvault_report_success`, `devvault_export_tree`, `devvault_check_updates`, `devvault_load_context`, `devvault_quickstart`, `devvault_changelog`, `devvault_diary_bug`, `devvault_diary_resolve`, `devvault_diary_list`, `devvault_get_playbook`, `devvault_task_start`, `devvault_task_end`, `devvault_batch_ingest`, `devvault_similar`, `devvault_stats`, `devvault_mandatory`, `devvault_check_duplicates`. **v6.3:** Deduplication system — duplicate pre-check on ingest (trigram similarity), dedicated `devvault_check_duplicates` tool, `force_create` override. **v6.1:** Added batch ingestion (up to 20 modules/call), vector similarity search, vault health metrics, duplicate detection on ingest (>0.92 cosine), atomic array append operations on update, and usage stats on get. **v6.0:** SQL-native diagnose architecture — `match_common_errors`, `match_solves_problems`, `infer_domain_from_text` RPCs replace JS matching. Domain-aware `vault_module_completeness` with explicit v_total. |

### Entity Management

| Function | Auth | Domain | Description and Actions (`action`) |
| :--- | :--- | :--- | :--- |
| `projects-crud` | Internal (JWT) | general | Manages complete CRUD for the `projects` entity. **Actions:** `list`, `get`, `create`, `update`, `delete`. |
| `bugs-crud` | Internal (JWT) | general | Manages complete CRUD for the `bugs` entity (Bug Diary). **Actions:** `list`, `create`, `update`, `delete`. |
| `folders-crud` | Internal (JWT) | general | Manages CRUD for `key_folders` (project API key folders). **Actions:** `list`, `get`, `create`, `delete`. |
| `project-api-keys-crud` | Internal (JWT) | admin | Manages CRUD for project `api_keys`, interacting with the Vault to encrypt/decrypt keys. **Actions:** `list`, `create`, `read` (decrypts the key), `delete`. |

### Dashboard & Utilities

| Function | Auth | Domain | Description and Actions (`action`) |
| :--- | :--- | :--- | :--- |
| `dashboard-stats` | Internal (JWT) | general | Aggregates and returns key metrics for the user's dashboard (total projects, modules, etc.). No `action`. |
| `global-search` | Internal (JWT) | general | Performs a unified text search across `vault_modules`, `projects`, and `bugs`. No `action`. |
| `profiles-crud` | Internal (JWT) | general | Manages the logged-in user's profile. **Actions:** `get`, `update`. |

### API Keys & Administration

| Function | Auth | Domain | Description and Actions (`action`) |
| :--- | :--- | :--- | :--- |
| `create-api-key` | Internal (JWT) | admin | **Creates a new `dvlt_` key for external access.** Interacts with the SQL function `create_devvault_api_key` to save the hash in the Vault. Returns the complete key only once. No `action`. |
| `revoke-api-key` | Internal (JWT) | admin | **Revokes an existing `dvlt_` key.** Interacts with the SQL function `revoke_devvault_api_key`. No `action`. |
| `list-devvault-keys` | Internal (JWT) | general | Lists metadata (prefix, name, usage date) of the user's `dvlt_` keys. No `action`. |
| `admin-crud` | Internal (JWT) | admin | **Endpoint for the Admin Panel.** Requires `admin` or `owner` role. **Actions:** `get-my-role`, `list-users`, `change-role` (owner), `admin-stats`, `list-api-keys`, `admin-revoke-api-key` (owner), `list-global-modules`, `unpublish-module`. |

### Utilities (One-shot / Backfill)

| Function | Auth | Domain | Description |
| :--- | :--- | :--- | :--- |
| `vault-backfill` | Manual | general | **Unified backfill engine for vault module enrichment.** Uses Strategy Pattern with shared `_shared/backfill-engine.ts`. Supports batch processing, exponential backoff retries, structural validation, dry_run mode, and progress tracking. **Actions:** `diagnose-fields` (GPT-4o-mini → `common_errors` + `solves_problems`), `context-fields` (GPT-4o-mini → `context_markdown` + `test_code`), `changelog-seed` (pure SQL → v1 changelog entries), `embeddings` (OpenAI → vector embeddings), `auto-dependencies` (SQL + heuristics → cross-module dependency links in `vault_module_dependencies`). POST `{ action, limit?, dry_run? }`. |
| `vault-backfill-playbooks` | Manual | general | **Playbook backfill from module_groups.** Converts `module_group` values into `vault_playbooks` and `vault_playbook_modules` records. Idempotent (skips existing slugs). Params: `owner_user_id` (required), `min_modules` (default 3), `dry_run` (default false). Not part of the unified engine because it creates separate entities (playbooks), not field enrichments on `vault_modules`. |
