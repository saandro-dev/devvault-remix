

# Phase 5 — Plano de Execucao Completo

## Divisao de Responsabilidades

```text
┌──────────────────────────────────────────────────────────────────┐
│  LOVABLE (eu) — Sub-Phase 5A                                     │
│                                                                    │
│  Criar Edge Function vault-backfill-playbooks                     │
│  Dados necessarios: JA EXISTEM no banco DevVault                  │
│  - module_group, implementation_order, domain, difficulty, tags   │
│  - Nenhum dado do risecheckout necessario                         │
│                                                                    │
│  Executar o backfill apos deploy                                   │
│  Atualizar bootstrap.ts com regras de database_schema              │
│  Atualizar EDGE_FUNCTIONS_REGISTRY.md                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  AGENTE DE INGESTAO — Sub-Phase 5B                               │
│                                                                    │
│  Popular o campo database_schema em ~284 modulos                  │
│  Dados necessarios: SQL DDL REAL do projeto risecheckout          │
│  - CREATE TABLE, CREATE TYPE, CREATE POLICY, CREATE FUNCTION      │
│  - Extraidos diretamente do schema do projeto fonte               │
│  - ZERO dados inventados                                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Sub-Phase 5A: O Que EU Farei (Lovable)

### Passo 1 — Criar Edge Function `vault-backfill-playbooks`

**Arquivo:** `supabase/functions/vault-backfill-playbooks/index.ts`

**Logica:**
- Buscar todos os `module_group` distintos com >= N modulos globais (parametro `min_modules`, default 3)
- Para cada grupo, criar registro em `vault_playbooks`:
  - `slug` = module_group (ja e slug-friendly)
  - `title` = humanizado ("members-area-patterns" -> "Members Area Patterns")
  - `description` = concatenacao factual dos titulos dos modulos do grupo (sem LLM)
  - `domain` = moda dos dominios dos modulos
  - `tags` = uniao das top 10 tags unicas
  - `difficulty` = dificuldade mais frequente
  - `status` = `'published'`
  - `user_id` = owner_user_id do body
- Criar registros em `vault_playbook_modules` (junction):
  - Um registro por modulo, `position` = `implementation_order` existente
- Idempotente: skip se playbook com mesmo slug ja existe

**Dados do banco (ja verificados):**
- 82 module_groups com >= 3 modulos
- ~534 modulos agrupados para linkar na junction table
- Todos possuem `implementation_order` preenchido

### Passo 2 — Atualizar bootstrap.ts

Adicionar em `behavioral_rules`:
- Regra sobre database_schema obrigatorio para modulos backend/architecture/security com interacao DB

Adicionar em `anti_patterns`:
- Anti-pattern sobre omitir database_schema quando o schema real esta disponivel

### Passo 3 — Atualizar EDGE_FUNCTIONS_REGISTRY.md

Registrar a nova Edge Function administrativa.

### Passo 4 — Deploy e Execucao

- Deploy vault-backfill-playbooks
- POST dry_run=true para validar
- POST dry_run=false com owner_user_id=32d5c933-94b0-4b8d-a855-f00b3d2f1193
- Verificar dados no banco

---

## Sub-Phase 5B: Relatorio para o Agente de Ingestao

Este relatorio sera entregue como texto completo e autocontido para voce enviar ao agente. Contera:

1. Contexto do que foi feito nas Phases 1-4 (novas tabelas, novas tools)
2. A tarefa especifica: popular `database_schema` em ~284 modulos
3. Instrucoes passo a passo usando as ferramentas MCP existentes
4. Regras absolutas (zero dados inventados)
5. Lista de module_groups prioritarios (backend/security) com contagem
6. Exemplos concretos de como extrair o DDL do risecheckout

O relatorio sera gerado APOS eu executar a Sub-Phase 5A, para que inclua os playbooks ja criados como contexto adicional.

---

## Arquivos

### Criar (1)
```text
supabase/functions/vault-backfill-playbooks/index.ts
```

### Modificar (3)
```text
supabase/functions/_shared/mcp-tools/bootstrap.ts  — novas behavioral_rules + anti_patterns
docs/EDGE_FUNCTIONS_REGISTRY.md                    — registrar vault-backfill-playbooks
supabase/config.toml                               — entry para vault-backfill-playbooks
```

### Gerar (1 — texto, nao codigo)
```text
Relatorio completo para o agente de ingestao (entregue no chat apos execucao da 5A)
```

---

## Sequencia

```text
1. Criar vault-backfill-playbooks Edge Function
2. Adicionar config.toml entry
3. Atualizar bootstrap.ts (behavioral_rules + anti_patterns)
4. Atualizar EDGE_FUNCTIONS_REGISTRY.md
5. Deploy vault-backfill-playbooks
6. Executar backfill (dry_run -> real)
7. Verificar dados no banco
8. Deploy devvault-mcp (com bootstrap atualizado)
9. Gerar e entregar relatorio completo para o agente
```

## Nota sobre descricoes dos Playbooks

A descricao de cada playbook sera gerada de forma FACTUAL — concatenando os titulos dos modulos do grupo em uma frase descritiva. Sem OpenAI, sem LLM. Os dados ja existem no banco e sao suficientes para gerar descricoes uteis:

Exemplo para `members-area-patterns` (26 modulos):
```text
"Implementation patterns for a Members Area system covering module/content 
structure, student data management, progress tracking, video player integration, 
quiz system, certificate generation, and settings configuration."
```

Derivado diretamente dos titulos: "Members Area Architecture", "Students Data Hook", "Progress Tracking System", "Video Player Component", "Quiz System", "Certificate Generation", "Members Area Settings".

