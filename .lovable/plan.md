

# Plano: Backfill de Enriquecimento do Vault — Analise 10/10

## Diagnostico Real do Banco

| Campo | Preenchidos | Vazios | % Vazios |
|:---|:---|:---|:---|
| `common_errors` | 545 | 158 | 22.5% |
| `solves_problems` | 545 | 158 | 22.5% |
| `context_markdown` | 34 | 669 | 95.2% |
| `test_code` | 0 | 703 | 100% |
| `vault_module_changelog` | 0 | 703 | 100% |

## Problemas Arquiteturais Identificados no Plano Anterior (8.8)

1. **3 funcoes separadas com 90% de codigo duplicado** — fetch modules, batch loop, delay, dry_run, error handling, progress tracking. Isso e codigo copicola. Viola DRY e SRP.
2. **Inconsistencia entre backfills existentes** — `vault-backfill-embeddings` nao usa `withSentry`, nao usa `api-helpers`, usa CORS diferente. `vault-backfill-playbooks` usa CORS wildcard. Cada backfill segue um padrao diferente.
3. **BUG na funcao existente** — `vault-backfill-diagnose-fields` faz `.limit(limit)` sem filtro SQL, depois filtra em JS. A Regra de Ouro diz: Postgres deve fazer a filtragem, nao JS.
4. **Nenhuma validacao estrutural** — Se a OpenAI retorna JSON malformado para `common_errors` (ex: campo `error` faltando), o backfill salva lixo no banco sem validar cada entry.
5. **Sem retry em falhas transientes** — Se a OpenAI retorna 429 (rate limit), o modulo e marcado como "failed" e nunca mais e processado. Deveria ter retry com backoff.

## Analise de Solucoes

### Solucao A: 3 Edge Functions Separadas (Plano Anterior)
- Manutenibilidade: 6/10 — 3 funcoes com codigo duplicado; mudar o batch logic = alterar 3 arquivos
- Zero DT: 5/10 — Bug no filtro JS nao corrigido; sem retry; sem validacao estrutural
- Arquitetura: 5/10 — Viola DRY; cada backfill segue padrao diferente
- Escalabilidade: 7/10 — Funciona para 703 modulos mas o batch loop e identico em cada uma
- Seguranca: 9/10 — Service role only
- **NOTA FINAL: 6.2/10**

### Solucao B: 1 Edge Function Unificada com Pipeline Modular
- Uma unica funcao `vault-backfill` com `action` parameter
- Shared helper `_shared/backfill-engine.ts` extrai TODA a logica reutilizavel (batch loop, retry, delay, progress tracking, dry_run)
- Cada "enrichment" e um modulo puro: recebe 1 modulo, retorna campos gerados
- Retry com exponential backoff em erros 429/500
- Validacao estrutural de cada campo gerado antes de salvar
- Filtro SQL-native (IS NULL) ao inves de filtro JS
- Padrao unico: `withSentry` + `api-helpers` + `cors-v2`

- Manutenibilidade: 10/10 — 1 engine, N enrichments. Adicionar novo campo = 1 modulo de 30 linhas
- Zero DT: 10/10 — Bug corrigido, retry implementado, validacao estrutural
- Arquitetura: 10/10 — Engine/Strategy pattern. SRP por camada. DRY total
- Escalabilidade: 9/10 — Engine reutilizavel para qualquer backfill futuro
- Seguranca: 9/10 — Service role only
- **NOTA FINAL: 9.8/10**

### Solucao C: Solucao B + Refatorar os 3 backfills existentes para usar o mesmo engine
- Tudo de B + migrar `vault-backfill-embeddings`, `vault-backfill-diagnose-fields`, e `vault-backfill-playbooks` para o engine unificado
- Eliminar as 3 funcoes existentes e substituir por uma unica `vault-backfill`

- Manutenibilidade: 10/10 — Zero duplicacao no projeto inteiro
- Zero DT: 10/10 — Corrige bugs em TODAS as funcoes, nao so nas novas
- Arquitetura: 10/10 — Uma unica interface para todo tipo de backfill
- Escalabilidade: 10/10 — Qualquer backfill futuro = 1 strategy module
- Seguranca: 9/10 — Service role only
- **NOTA FINAL: 9.8/10** (empate com B — mais abrangente)

### DECISAO: Solucao C (Nota 9.8, mais abrangente)

Em caso de empate, o protocolo diz: "escolher a mais abrangente". Solucao C elimina a inconsistencia dos 3 backfills existentes E resolve o problema atual. E a unica que zera divida tecnica de verdade.

---

## Arquitetura da Solucao C

```text
supabase/functions/
  _shared/
    backfill-engine.ts          (NOVO — core engine reutilizavel)
    backfill-strategies/        (NOVO — pasta com estrategias)
      diagnose-fields.ts        (gera common_errors + solves_problems)
      context-fields.ts         (gera context_markdown + test_code)
      changelog-seed.ts         (seed v1 no changelog — sem IA)
      embeddings.ts             (gera embedding via OpenAI)
  vault-backfill/
    index.ts                    (NOVO — unico entry point para todos os backfills)
```

### Backfill Engine (`_shared/backfill-engine.ts`)

```text
Interface BackfillStrategy<TRow, TResult>:
  name: string
  fetchCandidates(client, limit): Promise<TRow[]>     // SQL-native filtering
  process(row: TRow): Promise<TResult>                 // gera dados (IA ou puro)
  validate(result: TResult): boolean                   // valida estrutura antes de salvar
  persist(client, rowId, result): Promise<void>        // salva no banco

Interface BackfillConfig:
  batchSize: number
  delayMs: number
  maxRetries: number       // retry com exponential backoff
  retryBaseMs: number

Funcao runBackfill(strategy, config, options):
  1. strategy.fetchCandidates() com filtro SQL-native (nao JS)
  2. Para cada batch:
     a. Promise.allSettled(batch.map(row => processWithRetry(row)))
     b. Para cada resultado fulfilled:
        - strategy.validate(result) → se false, marca como failed com motivo
        - strategy.persist(client, row.id, result)
     c. Delay entre batches
  3. Retorna { processed, failed, errors, duration_ms }

Funcao processWithRetry(strategy, row, maxRetries):
  - Tenta strategy.process(row)
  - Se erro 429: exponential backoff (1s, 2s, 4s)
  - Se erro 500: retry 1x
  - Se erro estrutural: nao retry (falha permanente)
```

### Entry Point (`vault-backfill/index.ts`)

```text
POST { action: "diagnose-fields", limit?: 200, dry_run?: false }
POST { action: "context-fields",  limit?: 100, dry_run?: false }
POST { action: "changelog-seed",  limit?: 1000, dry_run?: false }
POST { action: "embeddings",      limit?: 100, dry_run?: false }

Usa withSentry + api-helpers + cors-v2 (padrao correto)
Seleciona a strategy pelo action, chama runBackfill()
```

### Strategy: diagnose-fields.ts

```text
fetchCandidates: SQL com filtro direto
  WHERE visibility = 'global'
    AND (common_errors IS NULL OR common_errors::text = '[]'
         OR solves_problems IS NULL OR array_length(solves_problems, 1) IS NULL)
  LIMIT p_limit

process: chama OpenAI gpt-4o-mini (prompt existente)

validate: verifica que:
  - common_errors e array
  - cada entry tem campos error, cause, fix (todos strings nao-vazias)
  - solves_problems e array de strings
  - cada problema tem pelo menos 10 chars

persist: UPDATE vault_modules SET common_errors, solves_problems WHERE id
```

### Strategy: context-fields.ts

```text
fetchCandidates: SQL com filtro direto
  WHERE visibility = 'global'
    AND (context_markdown IS NULL OR trim(context_markdown) = ''
         OR test_code IS NULL OR trim(test_code) = '')
  LIMIT p_limit

process: chama OpenAI gpt-4o-mini com prompt especializado:
  - context_markdown: Overview, How it Works, When to Use, When NOT to Use,
    Considerations. 300-600 palavras
  - test_code: snippet de validacao rapida (5-15 linhas) na linguagem do modulo

validate: verifica que:
  - context_markdown tem pelo menos 200 chars
  - context_markdown contem pelo menos 2 headers markdown (##)
  - test_code tem pelo menos 3 linhas
  - test_code nao contem "TODO" ou placeholder

persist: UPDATE vault_modules SET context_markdown, test_code WHERE id
```

### Strategy: changelog-seed.ts

```text
fetchCandidates: SQL com LEFT JOIN
  SELECT vm.id, vm.title, vm.version, vm.created_at
  FROM vault_modules vm
  LEFT JOIN vault_module_changelog vmc ON vmc.module_id = vm.id
  WHERE vm.visibility = 'global' AND vmc.id IS NULL
  LIMIT p_limit

process: retorna dados puros (SEM IA)
  { version: mod.version ?? "v1", changes: ["Initial version published to global vault"] }

validate: sempre true (dados deterministicos)

persist: INSERT INTO vault_module_changelog (module_id, version, changes)

batchSize: 50 (sem IA, pode ser maior)
delayMs: 0 (sem rate limit externo)
```

### Strategy: embeddings.ts

```text
fetchCandidates:
  WHERE visibility = 'global' AND embedding IS NULL LIMIT p_limit

process: buildEmbeddingInput() + generateEmbedding() (reutiliza _shared/embedding-client.ts)

validate: verifica que embedding.length === 1536

persist: UPDATE vault_modules SET embedding WHERE id
```

### Funcoes Antigas a Deletar

Apos deploy e validacao do `vault-backfill`:
- `supabase/functions/vault-backfill-diagnose-fields/` → deletar
- `supabase/functions/vault-backfill-embeddings/` → deletar
- `supabase/functions/vault-backfill-playbooks/` → manter (logica diferente — cria playbooks, nao enriquece modulos)

**Nota:** `vault-backfill-playbooks` NAO e um backfill de campos. E uma funcao que cria entidades (playbooks) a partir de module_groups. Nao se encaixa no pattern BackfillStrategy porque o output nao e um UPDATE em vault_modules. Ela fica como esta, mas deve ser refatorada para usar `withSentry` + `api-helpers` + `cors-v2` em vez de CORS wildcard.

## config.toml

Adicionar:
```toml
[functions.vault-backfill]
verify_jwt = false
```

Remover (apos validacao):
```toml
[functions.vault-backfill-diagnose-fields]
[functions.vault-backfill-embeddings]
```

## Correcao do vault-backfill-playbooks (Higiene)

Refatorar para usar `withSentry` + `api-helpers` + `cors-v2` em vez de CORS wildcard. Mesma logica, padrao correto.

## Ordem de Execucao

```text
1. Criar _shared/backfill-engine.ts (engine reutilizavel)
2. Criar _shared/backfill-strategies/ (4 strategies)
3. Criar vault-backfill/index.ts (entry point unificado)
4. Atualizar config.toml
5. Refatorar vault-backfill-playbooks (padrao correto)
6. Deletar vault-backfill-diagnose-fields/
7. Deletar vault-backfill-embeddings/
8. Deploy e teste
9. Executar: changelog-seed (rapido, sem IA)
10. Executar: diagnose-fields (158 modulos, ~5min)
11. Executar: context-fields (703 modulos, ~30-45min)
```

## Resumo de Arquivos

| Arquivo | Acao | Linhas |
|:---|:---|:---|
| `supabase/functions/_shared/backfill-engine.ts` | Criar | ~120 |
| `supabase/functions/_shared/backfill-strategies/diagnose-fields.ts` | Criar | ~100 |
| `supabase/functions/_shared/backfill-strategies/context-fields.ts` | Criar | ~120 |
| `supabase/functions/_shared/backfill-strategies/changelog-seed.ts` | Criar | ~50 |
| `supabase/functions/_shared/backfill-strategies/embeddings.ts` | Criar | ~50 |
| `supabase/functions/vault-backfill/index.ts` | Criar | ~80 |
| `supabase/functions/vault-backfill-playbooks/index.ts` | Refatorar | ~260 (padrao correto) |
| `supabase/config.toml` | Editar | +3, -6 |
| `supabase/functions/vault-backfill-diagnose-fields/` | Deletar | — |
| `supabase/functions/vault-backfill-embeddings/` | Deletar | — |

## Impacto Final

| Metrica | Antes | Depois |
|:---|:---|:---|
| Edge Functions de backfill | 3 (inconsistentes) | 1 unificada + 1 playbooks (padronizada) |
| Codigo duplicado | ~300 linhas em 3 funcoes | 0 (engine reutilizavel) |
| Bug de filtro JS | Presente | Corrigido (SQL-native) |
| Retry em rate limit | Nenhum | Exponential backoff |
| Validacao estrutural | Nenhuma | Cada campo validado antes de salvar |
| Adicionar novo backfill | Copiar 200 linhas + novo arquivo | 1 strategy de 30-50 linhas |

