# DevVault

**An AI-first knowledge base platform for developers and their AI agents.**

DevVault stores, organizes, and serves structured technical knowledge — code snippets, architecture patterns, SaaS playbooks, SQL migrations, and diagnostic guides — so that AI agents can autonomously query, consume, and contribute to it during their workflows.

---

## What is DevVault?

DevVault operates with two distinct access channels, each with a clearly defined role:

### Primary Channel — AI Agents via MCP (90%+ of real system usage)

AI agents connect to the DevVault MCP server and interact with the knowledge base through **25 structured tools**. This is the core use case of the product.

**MCP Endpoint:** `https://<project>.supabase.co/functions/v1/devvault-mcp`
**Authentication:** API key (`dvlt_...`) via `X-DevVault-Key` header

Typical agent workflow:
```
devvault_bootstrap    → Load the full knowledge graph index
devvault_search       → Find modules by problem description or keywords
devvault_get          → Fetch full code + dependencies + context
devvault_diagnose     → Query the knowledge base when an error occurs
devvault_ingest       → Contribute new knowledge after implementation
devvault_diary_bug    → Document problems encountered during execution
```

### Secondary Channel — Humans via Web UI (curation and administration)

Human users access the web interface to act as **curators and administrators** of the knowledge base that agents consume. Typical human actions:

- Review and validate modules ingested by agents
- Manage projects and organize the vault
- Monitor system health and API usage
- Configure and revoke API keys for agents
- Browse the Bug Diary and activity history

---

## Architecture

| Layer | Technology |
| :--- | :--- |
| Frontend | Vite + React + TypeScript + TailwindCSS |
| Backend | 16 Supabase Edge Functions (Deno) |
| Database | PostgreSQL 17 (Supabase) |
| Auth (Web UI) | Supabase Auth (JWT) |
| Auth (Agents) | Custom API keys (`dvlt_...`) via Supabase Vault |
| Search | Hybrid: `pgvector` (semantic) + `tsvector` (full-text) + `pg_trgm` |
| Secrets | Supabase Vault (pgsodium encryption) |
| Agent Protocol | MCP (Model Context Protocol) — 25 tools |

---

## MCP Tools Reference

| Category | Tools |
| :--- | :--- |
| **Discovery** | `devvault_bootstrap`, `devvault_search`, `devvault_list`, `devvault_get`, `devvault_get_group`, `devvault_domains`, `devvault_load_context`, `devvault_quickstart` |
| **CRUD** | `devvault_ingest`, `devvault_update`, `devvault_delete`, `devvault_validate`, `devvault_changelog` |
| **Diagnostics** | `devvault_diagnose`, `devvault_check_updates`, `devvault_export_tree` |
| **Bug Diary** | `devvault_diary_bug`, `devvault_diary_resolve`, `devvault_diary_list`, `devvault_report_bug`, `devvault_resolve_bug` |
| **Playbooks** | `devvault_get_playbook` |
| **Task Tracking** | `devvault_task_start`, `devvault_task_end` |
| **Reporting** | `devvault_report_success` |

---

## Public API (REST)

For non-MCP integrations (CI/CD, scripts, external tools):

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/vault-ingest` | POST | Ingest one or multiple modules |
| `/vault-query` | POST | Search and query the knowledge base |

Authentication: `X-DevVault-Key: dvlt_...`

Full API reference available at `/docs/api` in the web UI.

---

## Documentation

| Document | Description |
| :--- | :--- |
| `docs/VAULT_CONTENT_STANDARDS.md` | Rules and standards for content quality — required reading for any agent ingesting modules |
| `docs/EDGE_FUNCTIONS_REGISTRY.md` | Complete registry of all 16 Edge Functions, auth architecture, and changelog |

---

## Local Development

```sh
# Clone the repository
git clone https://github.com/saandro-dev/devvault-remix.git
cd devvault-remix

# Install dependencies
npm install

# Start the development server
npm run dev
```

**Requirements:** Node.js 18+ and npm.

---

## Design Principle

> Every technical decision must first be evaluated by its impact on the AI agent experience consuming data via MCP. If a change improves the human UI but degrades the quality of data returned to agents, it is rejected.
