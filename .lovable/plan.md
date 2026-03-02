

# Plano: Preencher Dependencies dos 424 Modulos (92% → 100%)

## Diagnostico

- **424 modulos** com `implementation_order > 1` dentro de `module_group` nao possuem nenhum registro em `vault_module_dependencies`.
- **167 grupos** distintos, alguns com `implementation_order` duplicados (ex: 2 modulos com order=3 no mesmo grupo).
- A funcao `vault_module_completeness` exige apenas `EXISTS(SELECT 1 FROM vault_module_dependencies WHERE module_id = ?)` — basta **1 dependencia** por modulo.
- Constraint `uq_module_dependency (module_id, depends_on_id)` + `chk_no_self_reference` ja existem, protegendo contra duplicatas e auto-referencia.

## Estrategia: SQL Puro via Nova Backfill Strategy

A logica e deterministica (sem IA): cada modulo com `implementation_order = N` depende de **um** modulo com `implementation_order = N-1` do mesmo `module_group`. Quando existem multiplos modulos no order anterior (duplicatas), selecionamos apenas um via `DISTINCT ON`.

### Logica SQL Core

```text
Para cada modulo M onde:
  - visibility = 'global'
  - module_group IS NOT NULL
  - implementation_order > 1
  - Nao possui nenhuma dependencia registrada

Inserir 1 dependencia:
  M → modulo P (mesmo module_group, implementation_order = M.order - 1)
  
Se existem multiplos P, escolher o mais recente (updated_at DESC).
Usar ON CONFLICT DO NOTHING para seguranca.
```

## Implementacao (2 arquivos)

### 1. Nova Strategy: `supabase/functions/_shared/backfill-strategies/auto-dependencies.ts`

Cria um `BackfillStrategy` seguindo o padrao existente (Strategy Pattern do backfill engine):

- **`fetchCandidates`**: Busca os 424 modulos que tem `module_group` + `implementation_order > 1` + zero deps.
- **`process`**: Para cada modulo, encontra o predecessor (mesmo grupo, order - 1) via query SQL. Retorna `{ depends_on_id }`.
- **`validate`**: Verifica que `depends_on_id` foi encontrado.
- **`persist`**: Insere o registro em `vault_module_dependencies` com `ON CONFLICT DO NOTHING`.
- **Config**: Usa `DEFAULT_DATA_CONFIG` (sem delay, batch 50, sem IA).

### 2. Registrar no `supabase/functions/vault-backfill/index.ts`

Adicionar `"auto-dependencies"` ao `STRATEGY_MAP`:

```text
STRATEGY_MAP["auto-dependencies"] = {
  strategy: autoDependenciesStrategy,
  config: DEFAULT_DATA_CONFIG
}
```

## Execucao

Apos o deploy, basta uma unica chamada:

```text
POST /vault-backfill
{ "action": "auto-dependencies", "limit": 500 }
```

Resultado esperado: ~424 insercoes, zero falhas, todos os modulos passam para score 100%.

## Secao Tecnica

- **Sem IA, sem custo**: Operacao puramente SQL, instantanea.
- **Idempotente**: `ON CONFLICT DO NOTHING` + check de `NOT EXISTS` no fetch garante re-execucao segura.
- **Segue o padrao existente**: Reutiliza o backfill engine, strategy pattern, logger, config — zero codigo ad-hoc.
- **Tempo estimado**: ~2 segundos de execucao total para os 424 modulos.

