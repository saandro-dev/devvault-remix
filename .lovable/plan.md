

# Plano: Corrigir vault-ingest REST + Backfill common_errors/solves_problems

## Diagnostico

Dois problemas identificados na causa raiz:

### Problema 1: vault-ingest REST endpoint incompleto
O endpoint `vault-ingest` (REST, usado antes do MCP) tem a lista `allowedFields` para update com apenas 18 campos, faltando 12 campos criticos: `common_errors`, `solves_problems`, `test_code`, `difficulty`, `estimated_minutes`, `database_schema`, `prerequisites`, `ai_metadata`, `usage_hint`, `module_group`, `implementation_order`, `version`. O mapeamento de ingest tambem ignora esses campos.

O MCP (`ingest.ts` e `update.ts`) ja suporta todos esses campos corretamente. A inconsistencia entre os dois caminhos de escrita e uma violacao do principio de consistencia arquitetural.

### Problema 2: 578 modulos com campos vazios
0 de 578 modulos globais tem `common_errors` ou `solves_problems` preenchidos. Isso torna as estrategias 1 e 2 do `devvault_diagnose` completamente inuteis (retornam sempre 0 resultados).

---

## Analise de Solucoes

### Solucao A: Corrigir vault-ingest + Criar edge function de backfill inteligente
- Manutenibilidade: 10/10
- Zero DT: 10/10
- Arquitetura: 10/10
- Escalabilidade: 10/10
- Seguranca: 10/10
- **NOTA FINAL: 10/10**

Alinhar vault-ingest com o MCP (mesmos campos permitidos). Criar uma edge function dedicada que usa OpenAI para gerar `common_errors` e `solves_problems` a partir do conteudo existente dos modulos (title, code, why_it_matters, usage_hint), processando em batches com rate limiting.

### Solucao B: Apenas corrigir vault-ingest, backfill manual via MCP
- Manutenibilidade: 7/10
- Zero DT: 6/10 (578 modulos manualmente? impraticavel)
- Arquitetura: 8/10
- Escalabilidade: 3/10
- Seguranca: 10/10
- **NOTA FINAL: 6.5/10**

### DECISAO: Solucao A (Nota 10)
A Solucao B e inferior porque backfill manual de 578 modulos e impraticavel e deixa divida tecnica indefinidamente.

---

## Plano de Execucao

### 1. Corrigir vault-ingest REST endpoint

Arquivo: `supabase/functions/vault-ingest/index.ts`

Alteracoes:
- **Ingest mapping (linhas 119-143):** Adicionar mapeamento para `common_errors`, `solves_problems`, `test_code`, `difficulty`, `estimated_minutes`, `database_schema`, `prerequisites`, `ai_metadata`, `usage_hint`, `module_group`, `implementation_order`, `version`
- **Update allowedFields (linhas 182-188):** Adicionar os 12 campos faltantes para alinhar com o MCP `update.ts`

### 2. Criar edge function vault-backfill-diagnose-fields

Nova edge function: `supabase/functions/vault-backfill-diagnose-fields/index.ts`

Logica:
1. Buscar modulos globais onde `common_errors = '[]'` e `solves_problems = '{}'`
2. Para cada modulo, construir um prompt para OpenAI com `title`, `code` (primeiros 2000 chars), `why_it_matters`, `usage_hint`, `tags`
3. Pedir ao OpenAI para gerar:
   - `common_errors`: array de `{error, cause, fix}` baseado no codigo
   - `solves_problems`: array de strings descrevendo problemas que o modulo resolve
4. Processar em batches de 10, com delay de 2s entre batches
5. Atualizar cada modulo via `supabase.from('vault_modules').update()`
6. Retornar relatorio com total processado/falhado

Autenticacao: Service role (chamada administrativa)

### 3. Atualizar documentacao

Arquivo: `docs/EDGE_FUNCTIONS_REGISTRY.md`
- Adicionar entrada para a nova edge function `vault-backfill-diagnose-fields`
- Adicionar changelog v5.3.2 documentando a correcao do vault-ingest

---

## Arvore de Arquivos Afetados

```text
supabase/functions/vault-ingest/index.ts                    -- Fix: alinhar campos com MCP
supabase/functions/vault-backfill-diagnose-fields/index.ts  -- Nova: backfill via OpenAI
docs/EDGE_FUNCTIONS_REGISTRY.md                             -- Changelog v5.3.2
```

## Detalhes Tecnicos

### vault-ingest allowedFields (update)

Campos a adicionar:
```typescript
const allowedFields = [
  // ... existentes ...
  "common_errors", "solves_problems", "test_code",
  "difficulty", "estimated_minutes", "database_schema",
  "prerequisites", "ai_metadata", "usage_hint",
  "module_group", "implementation_order", "version",
];
```

### vault-backfill-diagnose-fields - Prompt OpenAI

```text
You are a technical analyst. Given a code module, generate:
1. common_errors: 2-4 common errors developers encounter when using this code
2. solves_problems: 3-5 problem descriptions this module solves

Format: JSON with keys "common_errors" (array of {error, cause, fix}) 
and "solves_problems" (array of strings).

Module: {title}
Tags: {tags}
Why it matters: {why_it_matters}
Code (first 2000 chars): {code}
```

Batch processing: 10 modulos por batch, 2s delay, timeout 300s total.

