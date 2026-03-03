

# Auditoria: DevVault vs Seus Proprios Modulos

## Descoberta Principal

O DevVault possui modulos validados que documentam padroes de excelencia extraidos do Risecheckout em producao, mas o proprio DevVault NAO aplica esses padroes em suas Edge Functions. Das 16 Edge Functions (excluindo devvault-mcp que tem sua propria arquitetura), 8 violam padroes que o vault recomenda.

---

## Violacoes Encontradas (6 categorias)

### 1. `withSentry` ausente em 8 de 16 Edge Functions

**Modulo relevante:** `centralized-logger-edge-functions`, `app-error-boundary-sentry`

Functions SEM `withSentry`:
- `admin-crud` 
- `bugs-crud`
- `dashboard-stats`
- `folders-crud`
- `list-devvault-keys`
- `profiles-crud`
- `projects-crud`
- `project-api-keys-crud`

Todas usam `serve(async (req) => ...)` cru com `console.error()` manual no catch. Se uma excecao nao-capturada ocorrer, a funcao retorna vazio ou timeout silencioso.

**Correcao:** Envolver todas com `withSentry("nome", handler)`.

---

### 2. Input Sanitization: ZERO uso em todo o projeto

**Modulo relevante:** `input-sanitizer-edge-functions` (validated)

Nenhuma Edge Function sanitiza o body de `req.json()`. Strings chegam cruas — potencial XSS armazenado se algum campo for renderizado sem escape (ex: `title`, `description`, `symptom`).

**Correcao:** Aplicar sanitizacao nos campos de texto em todas as funcoes CRUD (vault-crud, bugs-crud, projects-crud, folders-crud, profiles-crud).

---

### 3. Rate Limiting ausente em 11 de 16 functions

**Modulo relevante:** `checkout-crud-helpers-rate-limit-wrapper`, `migration-rate-limit-attempts-table`

Functions COM rate limit (5): `create-api-key`, `revoke-api-key`, `global-search`, `vault-ingest`, `vault-query`

Functions SEM rate limit (11): `admin-crud`, `bugs-crud`, `dashboard-stats`, `folders-crud`, `list-devvault-keys`, `profiles-crud`, `projects-crud`, `project-api-keys-crud`, `vault-crud`, `vault-backfill`, `vault-backfill-playbooks`

**Correcao:** Adicionar `checkRateLimit` nas funcoes expostas a usuarios (pelo menos CRUD operations).

---

### 4. Structured Logging ausente em 8 functions

**Modulo relevante:** `logger-context-factory-log-level-env-var-structured-output-edge-functions`

8 functions usam `console.error("[name]", err.message)` em vez de `createLogger()`. Isso impede filtragem e correlacao de logs em producao.

**Correcao:** Substituir `console.error` por `createLogger("nome-da-funcao")` em todas.

---

### 5. `admin-crud` tem 332 linhas — viola limite de 300

**Modulo relevante:** `admin-data-bff-modular` (validated) — documenta exatamente o padrao de refatoracao: handler delegation per domain.

O `admin-crud/index.ts` e um God Object com 8 actions em um unico arquivo. O proprio vault tem um modulo que ensina como quebrar isso em handlers modulares.

**Correcao:** Extrair handlers para arquivos separados seguindo o padrao `admin-data-bff-modular`.

---

### 6. Audit Logging ausente em operacoes sensiveis

**Modulo relevante:** `audit-logger-security-events` (validated), `audit-logger-security-action-const`

Operacoes como `change-role`, `admin-revoke-api-key`, `unpublish-module` no `admin-crud` nao registram audit logs na tabela `devvault_api_audit_log`. O vault tem modulos especificos para isso.

**Correcao:** Adicionar `auditLog()` calls em todas as operacoes administrativas.

---

## Resumo Quantitativo

```text
Padrao do Vault              Uso no DevVault    Gap
─────────────────────────────────────────────────
withSentry wrapper           8/16 (50%)         8 functions
Input sanitization           0/16 (0%)          16 functions
Rate limiting                5/16 (31%)         11 functions
Structured logger            8/16 (50%)         8 functions
300-line limit               15/16 (94%)        1 function (admin-crud)
Audit logging                0/3 sensitive ops   3 operations
```

## Plano de Correcao (Ordem de Prioridade)

### Prioridade 1 — Seguranca (Input Sanitization + Audit Logging)
1. Criar `_shared/input-sanitizer.ts` baseado no modulo `input-sanitizer-edge-functions`
2. Aplicar sanitizacao em todos os CRUDs (6 functions)
3. Adicionar audit logging nas 3 operacoes admin sensiveis

### Prioridade 2 — Resiliencia (withSentry + Logger)
4. Adicionar `withSentry` nas 8 functions que nao tem
5. Substituir `console.error` por `createLogger` nas 8 functions

### Prioridade 3 — Protecao (Rate Limiting)
6. Adicionar `checkRateLimit` nas 6 CRUD functions sem protecao (bugs, folders, projects, project-api-keys, vault-crud, profiles)

### Prioridade 4 — Arquitetura (300-line split)
7. Refatorar `admin-crud` em handlers modulares seguindo o padrao `admin-data-bff-modular`

### Arquivos a criar (2):
- `supabase/functions/_shared/input-sanitizer.ts`
- `supabase/functions/admin-crud/handlers/` (directory com handlers modulares)

### Arquivos a editar (12):
- 8 Edge Functions: adicionar withSentry + createLogger
- 6 Edge Functions: adicionar checkRateLimit
- 6 CRUDs: adicionar input sanitization
- `admin-crud/index.ts`: adicionar audit logging + refatorar em modulos

