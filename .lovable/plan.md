# Plano: Backfill de Enriquecimento do Vault — Solução C (9.8/10)

## Status: ✅ IMPLEMENTADO E AUDITADO (2026-03-02)

### O que foi feito

1. ✅ Criado `_shared/backfill-engine.ts` — Core engine reutilizável com Strategy Pattern, batch processing, exponential backoff retries, structural validation, dry_run, progress tracking.
2. ✅ Criado `_shared/backfill-strategies/` com 4 strategies:
   - `diagnose-fields.ts` — GPT-4o-mini → `common_errors` + `solves_problems`
   - `context-fields.ts` — GPT-4o-mini → `context_markdown` + `test_code`
   - `changelog-seed.ts` — Pure SQL → v1 changelog entries
   - `embeddings.ts` — OpenAI → vector embeddings
3. ✅ Criado `vault-backfill/index.ts` — Entry point unificado com 4 actions
4. ✅ Refatorado `vault-backfill-playbooks` — Migrado para `withSentry` + `api-helpers` + `cors-v2`
5. ✅ Deletado `vault-backfill-diagnose-fields/` — Substituído pela action `diagnose-fields`
6. ✅ Deletado `vault-backfill-embeddings/` — Substituído pela action `embeddings`
7. ✅ Atualizado `config.toml` — 16 entries limpas, zero entradas mortas
8. ✅ Atualizado `EDGE_FUNCTIONS_REGISTRY.md` — Contadores corrigidos para 16 funções, vault-backfill documentado com 4 actions, changelog v6.1 adicionado

### Auditoria de Correções (Protocolo Seção 4)

| Problema | Severidade | Status | Correção |
|:---|:---|:---|:---|
| P1: config.toml entrada morta + duplicata | P0 | ✅ Corrigido | Removidas linhas 54-58 |
| P2: EDGE_FUNCTIONS_REGISTRY.md desatualizado | P0 | ✅ Corrigido | Reescrito com contadores corretos e vault-backfill documentado |
| P3: Filtro JS no changelog-seed.ts | P1 | ✅ Corrigido | Criada RPC `fetch_modules_without_changelog` com LEFT JOIN nativo |
| P4: Filtro JS no context-fields.ts | P1 | ✅ Corrigido | Query PostgREST com `.or("...eq.")` para empty strings |
| P5: `as any` no vault-backfill/index.ts | P2 | ✅ Corrigido | `StrategyEntry` interface + `Record<string, StrategyEntry>` |
| P6: plan.md desatualizado | P2 | ✅ Corrigido | Este documento |
| P7: 1000-row limit no changelog-seed.ts | P3 | ✅ Corrigido | Eliminado pela RPC do P3 |

### Próximos Passos (Execução de Backfills)

```text
1. Executar: POST vault-backfill { action: "changelog-seed", limit: 1000 }
2. Executar: POST vault-backfill { action: "diagnose-fields", limit: 200 }
3. Executar: POST vault-backfill { action: "context-fields", limit: 100, dry_run: true }
4. Executar: POST vault-backfill { action: "context-fields", limit: 100 }
```

### Arquitetura Final

```text
supabase/functions/
  _shared/
    backfill-engine.ts              (core engine — Strategy Pattern)
    backfill-strategies/
      diagnose-fields.ts            (AI: common_errors + solves_problems)
      context-fields.ts             (AI: context_markdown + test_code)
      changelog-seed.ts             (SQL: v1 changelog entries via RPC)
      embeddings.ts                 (AI: vector embeddings)
  vault-backfill/index.ts           (unified entry point — 4 actions)
  vault-backfill-playbooks/index.ts (separate — creates playbook entities)
```

| Métrica | Antes | Depois |
|:---|:---|:---|
| Edge Functions de backfill | 3 (inconsistentes) | 1 unificada + 1 playbooks |
| Código duplicado | ~300 linhas | 0 |
| Filtro JS em vez de SQL | 2 instâncias | 0 (SQL-native) |
| Retry em rate limit | Nenhum | Exponential backoff |
| Validação estrutural | Nenhuma | Cada campo validado |
| Type safety escapes | 1 (`as any`) | 0 |
