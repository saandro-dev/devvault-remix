

# Plano de Implementacao — 3 Melhorias DevVault (Feedback de Agentes)

## Resumo Executivo

Tres novas capacidades para transformar o DevVault de uma "biblioteca de conhecimento" em um "sistema de producao de software autonomo". Todas as decisoes seguem a Secao 3 do Protocolo — nota minima 9.8/10.

**Resultado final:** 25 MCP tools (atualmente 22), 3 novas tabelas, 3 novos arquivos de tool.

---

## Proposta 1: Playbooks como Entidade de Primeira Classe

### Problema
Agentes nao tem um roteiro estruturado para iniciar projetos. O campo `module_group` (texto livre) existe em 552 modulos, mas nao possui metadata, ordenacao explicita via junction table, nem suporte a muitos-para-muitos.

### Decisao Arquitetural

| Criterio | Solucao A: Tabela Dedicada `vault_playbooks` + Junction | Solucao B: Reaproveitar `module_group` (texto) |
|---|---|---|
| Manutenibilidade | 10/10 — modelo relacional normalizado | 7/10 — campo texto nao impoe restricoes |
| Zero DT | 10/10 — correto desde o dia 1 | 5/10 — precisara migrar para entidade propria |
| Arquitetura | 10/10 — entidade com metadata, many-to-many | 5/10 — viola normalizacao |
| Escalabilidade | 10/10 — versioning, permissoes, cross-domain | 4/10 — sem many-to-many |
| Seguranca | 10/10 — RLS padrao, owner-scoped | 8/10 |
| **NOTA FINAL** | **10.0/10** | **5.7/10** |

**DECISAO: Solucao A (10.0/10)**

### O Que Sera Criado

**Tabela `vault_playbooks`:**
```text
id          UUID PK (gen_random_uuid)
user_id     UUID FK auth.users NOT NULL
title       TEXT NOT NULL
slug        TEXT UNIQUE NOT NULL
description TEXT
domain      vault_domain (enum)
tags        TEXT[]
difficulty  TEXT
status      TEXT ('draft','published') DEFAULT 'draft'
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

**Tabela `vault_playbook_modules` (junction):**
```text
id           UUID PK
playbook_id  UUID FK vault_playbooks ON DELETE CASCADE
module_id    UUID FK vault_modules ON DELETE CASCADE
position     INTEGER NOT NULL
notes        TEXT
UNIQUE(playbook_id, module_id)
```

**Nova MCP Tool: `devvault_get_playbook`** (Tool 23)
- Sem parametros: lista todos os playbooks publicados com contagem de modulos
- Com `slug` ou `id`: retorna playbook completo com todos os modulos em ordem, codigo completo, `database_schema` agregado, `ai_metadata` agregado (npm_dependencies, env_vars), e checklist de implementacao
- Arquivo: `supabase/functions/_shared/mcp-tools/get-playbook.ts`

**Melhoria em `devvault_bootstrap`:**
- Adicionar secao `playbooks_index` listando todos playbooks publicados com slug, titulo, contagem de modulos e dominio

---

## Proposta 2: Integracao de Database Schema

### Problema
O campo `database_schema` existe em `vault_modules` mas esta vazio em todos os 613+ modulos globais. Modulos de backend sem schema SQL deixam agentes sem saber qual `CREATE TABLE` executar.

### Decisao Arquitetural

| Criterio | Solucao A: Validacao Mandatoria Inteligente | Solucao B: Validacao "Recomendada" (soft) |
|---|---|---|
| Manutenibilidade | 10/10 — regras claras, sem ambiguidade | 7/10 — warnings sao ignorados |
| Zero DT | 10/10 — validacao correta desde o dia 1 | 6/10 — modulos incompletos acumulam |
| Arquitetura | 10/10 — deteccao domain-aware e tag-aware | 6/10 — validacao opcional e covarde |
| Escalabilidade | 10/10 — novos modulos validados automaticamente | 5/10 — schemas nao-validados multiplicam |
| Seguranca | 9/10 — schemas documentados reduzem misconfiguracao | 7/10 |
| **NOTA FINAL** | **9.8/10** | **6.2/10** |

**DECISAO: Solucao A (9.8/10)**

### O Que Sera Modificado

**`validate.ts`** — Adicionar verificacao inteligente:
- Se `domain` e `backend` ou `architecture` E (`tags` ou `code` contem indicadores de DB: `supabase`, `postgres`, `sql`, `rls`, `migration`, `create table`, `.from(`, `.rpc(`), entao `database_schema` e campo OBRIGATORIO
- Ausencia reduz score em 15 pontos
- Resposta explicita: `"database_schema: REQUIRED (DB-interacting module)"`

**`get-playbook.ts`** — Agregar todos os `database_schema` dos modulos do playbook em `_combined_migration`, ordenado por `position`

**Backfill** — Sera executado como Phase 5 (pos-deploy), similar ao `vault-backfill-diagnose-fields`. Tarefa separada.

---

## Proposta 3: Loop de Feedback de Tarefas de Agentes

### Problema
A tabela `vault_usage_events` rastreia uso de ferramentas, mas nao o *contexto* da tarefa do agente. Nao sabemos o objetivo, se teve sucesso, ou quais modulos realmente resolveram o problema.

### Decisao Arquitetural

| Criterio | Solucao A: Entidade Dedicada `vault_agent_tasks` | Solucao B: Enriquecer `vault_usage_events` com session_id |
|---|---|---|
| Manutenibilidade | 10/10 — modelo de lifecycle limpo | 5/10 — sobrecarrega tabela existente |
| Zero DT | 10/10 — feature nova, sem retrofitting | 4/10 — schema change em tabela existente |
| Arquitetura | 10/10 — entidade propria com state machine | 3/10 — viola SRP |
| Escalabilidade | 10/10 — suporta analytics e ML | 5/10 — queries complexas com dados mistos |
| Seguranca | 10/10 — user-scoped via RLS | 8/10 |
| **NOTA FINAL** | **10.0/10** | **4.8/10** |

**DECISAO: Solucao A (10.0/10)**

### O Que Sera Criado

**Tabela `vault_agent_tasks`:**
```text
id              UUID PK (gen_random_uuid)
user_id         UUID FK auth.users NOT NULL
api_key_id      UUID nullable
objective       TEXT NOT NULL
status          TEXT NOT NULL CHECK ('active','success','failure','abandoned')
modules_used    UUID[] DEFAULT '{}'
context         JSONB DEFAULT '{}'
started_at      TIMESTAMPTZ DEFAULT now()
completed_at    TIMESTAMPTZ nullable
duration_ms     INTEGER nullable
outcome_notes   TEXT nullable
```

**Nova MCP Tool: `devvault_task_start`** (Tool 24)
- Input: `objective` (obrigatorio), `context` (JSONB opcional)
- Output: `task_id` UUID
- Auto-vincula `user_id` e `api_key_id` do contexto de auth
- Arquivo: `supabase/functions/_shared/mcp-tools/task-start.ts`

**Nova MCP Tool: `devvault_task_end`** (Tool 25)
- Input: `task_id` (obrigatorio), `status` (obrigatorio), `modules_used` (UUID[] opcional), `outcome_notes` (opcional)
- Computa `duration_ms` automaticamente
- Arquivo: `supabase/functions/_shared/mcp-tools/task-end.ts`

---

## Sequencia de Execucao

```text
Phase 1 — Schema (Migracoes SQL)
  1. Criar tabela vault_playbooks + RLS
  2. Criar tabela vault_playbook_modules (junction) + RLS
  3. Criar tabela vault_agent_tasks + RLS

Phase 2 — Novas MCP Tools (3 arquivos)
  4. Criar get-playbook.ts (devvault_get_playbook)
  5. Criar task-start.ts (devvault_task_start)
  6. Criar task-end.ts (devvault_task_end)

Phase 3 — Melhorias em Tools Existentes
  7. validate.ts — deteccao inteligente de database_schema
  8. bootstrap.ts — AGENT_GUIDE (25 tools), playbooks_index, task workflow
  9. usage-tracker.ts — novos event_types (get_playbook, task_start, task_end)

Phase 4 — Wiring + Documentacao
  10. register.ts — 3 novos registros (25 tools total)
  11. devvault-mcp/index.ts — docstring (25 tools)
  12. EDGE_FUNCTIONS_REGISTRY.md — contagens + documentacao das novas tools

Phase 5 — Populacao de Dados (pos-deploy)
  13. Backfill database_schema para modulos relevantes
  14. Criar playbooks iniciais a partir dos module_groups existentes
```

## Arquivos

### Criar (3)
```text
supabase/functions/_shared/mcp-tools/get-playbook.ts
supabase/functions/_shared/mcp-tools/task-start.ts
supabase/functions/_shared/mcp-tools/task-end.ts
```

### Modificar (6)
```text
supabase/functions/_shared/mcp-tools/register.ts       — 3 novos registros
supabase/functions/_shared/mcp-tools/bootstrap.ts       — AGENT_GUIDE rewrite (25 tools)
supabase/functions/_shared/mcp-tools/validate.ts        — validacao inteligente DB schema
supabase/functions/_shared/mcp-tools/usage-tracker.ts   — novos event_types
supabase/functions/devvault-mcp/index.ts                — docstring (25 tools)
docs/EDGE_FUNCTIONS_REGISTRY.md                         — contagens + novas tools
```

### Checkpoint de Qualidade (Secao 6.2 do Protocolo)

| Pergunta | Resposta |
|---|---|
| Esta e a MELHOR solucao possivel? | Sim — modelo relacional normalizado, entidades dedicadas, zero atalhos |
| Existe solucao com nota maior? | Nao — todas as escolhidas pontuaram 9.8-10.0 |
| Isso cria divida tecnica? | Zero — cada entidade e normalizada corretamente |
| Precisaremos "melhorar depois"? | Nao — a arquitetura suporta V2 e V3 |
| O codigo sobrevive 10 anos? | Sim — padroes relacionais com lifecycle models claros |
| Alguma escolha foi por velocidade? | Nao — a tabela de playbooks foi escolhida SOBRE a abordagem mais rapida com module_group |

