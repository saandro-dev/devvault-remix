

# Analise de Duplicatas e Plano de Deduplicacao — DevVault

## Diagnostico Completo

### Resultados da Varredura

Varredura realizada usando `pg_trgm` (similarity trigram) nos 856 modulos globais:

| Banda de Similaridade | Pares Encontrados |
|---|---|
| 0.8-0.9 (muito similar) | 3 pares |
| 0.7-0.8 (similar) | 6 pares |
| 0.65-0.7 (possivelmente similar) | 7 pares |
| **Total** | **16 pares** |
| Duplicatas exatas (titulo identico) | **0** |
| Duplicatas exatas (slug identico) | **0** |

---

### Classificacao dos 16 Pares

Apos investigacao profunda do codigo de cada par, classifiquei em 3 categorias:

#### CATEGORIA 1: DUPLICATAS REAIS (devem ser mergeadas) — 6 pares

| # | Modulo A | Modulo B | Score | Veredicto |
|---|---|---|---|---|
| 1 | `context-switcher-hook-multi-role-navigation` (state-management) | `context-switcher-hook-multi-role-navigation-pattern` (auth-patterns) | 0.80 | Mesmo hook, B e versao com async switch. **Mergear B em A** |
| 2 | `webhook-queue-retry-dead-letter` (webhook-system) | `retry-webhooks-failed-webhook-queue-...` (webhooks) | 0.80 | Mesma Edge Function retry-webhooks, duas perspectivas. **Mergear** |
| 3 | `lazy-with-retry-resilient-code-splitting` (performance) | `lazy-with-retry-code-splitting` (frontend-performance) | 0.76 | Mesmo lazyWithRetry, grupos diferentes |
| 4 | `lazy-with-retry-dynamic-import-retry-...` (performance) | `lib-lazy-with-retry-dynamic-import-...` (lib-utils-patterns) | 0.71 | Tambem lazyWithRetry — **4 modulos sobre o mesmo conceito!** |
| 5 | `multi-key-domain-isolation` | `multi-key-supabase-client` | 0.77 | Mesmo supabase-client.ts com multi-key pattern |
| 6 | `checkout-heartbeat-session` (checkout-builder) | `checkout-heartbeat-upsert-session-...` (checkout-features) | 0.71 | Mesma Edge Function checkout-heartbeat |

**Nota:** O par `checkout-heartbeat-session-tracking-...` (checkout-recovery) e o TERCEIRO modulo sobre o mesmo tema, formando um triplete.

#### CATEGORIA 2: VARIANTES LEGITIMAS (mesma area, implementacoes diferentes) — 6 pares

| # | Modulo A | Modulo B | Score | Veredicto |
|---|---|---|---|---|
| 7 | `stripe-webhook-sdk-signature-verification` | `stripe-webhook-signature-verification` | 0.93 slug | SDK-based vs manual verification. Variantes validas, mas devem referenciar-se mutuamente |
| 8 | `members-area-architecture-v2` | `members-area-architecture` | 0.89 slug | V2 (builder pattern) vs V1 (router pattern). Evolucao real |
| 9 | `pii-access-control-audit-log` | `pii-access-control-audit-log-3tier` | 0.82 slug | 2-tier vs 3-tier (inclui affiliate). Variantes validas |
| 10 | `reconciliation-orchestrator` | `reconcile-pending-orders-orchestrator-...` | 0.69 | Mesmo padrao orquestrador mas com foco diferente |
| 11 | `marketplace-split-calculator` | `asaas-marketplace-split-calculator` | 0.83 slug | Generico vs Asaas-especifico. Complementares |
| 12 | `usePixOrderData` | `useMercadoPagoOrderData` | 0.80 | Hooks para gateways DIFERENTES (PIX vs MP). Correto |

#### CATEGORIA 3: FALSOS POSITIVOS (slug similar mas conteudo diferente) — 4 pares

| # | Modulos | Razao |
|---|---|---|
| 13-16 | SaaS Playbook Phase 1-5 (todas as combinacoes) | Fases diferentes do mesmo playbook. Slugs similares mas conteudo totalmente diferente |

---

### Resumo de Acoes Necessarias

| Acao | Quantidade |
|---|---|
| Modulos a DELETAR (absorvidos pelo merge) | **~6 modulos** |
| Modulos a ENRIQUECER (absorver conteudo dos deletados) | **~4 modulos** |
| Modulos a CROSS-REFERENCIAR (related_modules) | **~6 pares** |
| Modulos intocados | **~846** |

---

## Plano de Acao em 2 Fases

### Fase 1: Deduplicacao Cirurgica

Para cada duplicata real:

1. **lazyWithRetry (4 → 1):** Mergear os 4 modulos em 1 modulo definitivo contendo: o codigo completo, todos os common_errors dos 4, todos os solves_problems, e o test_code mais completo. Deletar os 3 inferiores.

2. **checkout-heartbeat (3 → 1):** Mergear os 3 modulos em 1 com o codigo da Edge Function completa + upsert logic + session tracking. Deletar os 2 inferiores.

3. **context-switcher (2 → 1):** Mergear o async role switch do modulo B no modulo A. Deletar B.

4. **webhook-queue-retry (2 → 1):** Mergear retaining o mais completo (HMAC + dead letter). Deletar o inferior.

5. **multi-key-supabase-client (2 → 1):** Mergear em 1. Deletar o inferior.

6. **Variantes legitimas:** Adicionar `related_modules` cruzados nos 6 pares da Categoria 2 para que agentes MCP saibam que existem variantes.

### Fase 2: Prevencao Permanente de Duplicatas

Implementar um sistema anti-duplicata na **camada de ingest** (causa raiz), nao apenas na deteccao:

#### Solucao A: Duplicate Check na Ingestao (Pre-Insert)
- Manutenibilidade: 9/10
- Zero DT: 9/10
- Arquitetura: 8/10
- Escalabilidade: 7/10
- Seguranca: 10/10
- **NOTA FINAL: 8.6/10**

Adicionar check de `pg_trgm` similarity no titulo + check de embedding similarity antes de cada insert na `devvault_ingest`. Se similarity > 0.7, retornar warning com os modulos similares encontrados e pedir confirmacao.

#### Solucao B: RPC `check_duplicate_modules` + Trigger de Bloqueio + MCP Integration
- Manutenibilidade: 10/10
- Zero DT: 10/10
- Arquitetura: 10/10
- Escalabilidade: 9/10
- Seguranca: 10/10
- **NOTA FINAL: 9.8/10**

1. **Nova RPC `check_duplicate_modules`:** Funcao SQL que recebe titulo + codigo e retorna modulos com similarity > threshold (trigram no titulo + cosine no embedding se disponivel). Reutilizavel por qualquer canal (MCP, UI, backfill).

2. **Integracao no `devvault_ingest`:** Antes do INSERT, chamar a RPC. Se duplicatas encontradas, retornar resposta com `_duplicate_warning` contendo os modulos similares, slugs e scores. O agente decide se prossegue (com flag `force_create: true`) ou faz update no modulo existente.

3. **Integracao no `vault-crud create`:** Mesmo check para criacao via UI.

4. **Nova MCP Tool `devvault_check_duplicates`:** Tool dedicada que agentes podem chamar proativamente antes de ingerir, recebendo titulo + codigo e retornando potenciais duplicatas.

5. **Indice GIN trigram** no campo `title` para performance.

#### Solucao C: Apenas Tool de Auditoria Periodica
- Manutenibilidade: 7/10
- Zero DT: 6/10
- Arquitetura: 6/10
- Escalabilidade: 8/10
- Seguranca: 10/10
- **NOTA FINAL: 7.2/10**

Criar apenas uma tool `devvault_audit_duplicates` que roda sob demanda. Nao previne, apenas detecta.

### DECISAO: Solucao B (Nota 9.8)

A Solucao A falha em escalabilidade (check apenas no MCP, nao na UI). A Solucao C e reativa, nao preventiva — viola o principio de Zero Remendos. A Solucao B ataca a causa raiz em TODOS os pontos de entrada e fornece uma tool dedicada para verificacao proativa.

---

## Arvore de Arquivos Afetados

```text
Fase 1 (Deduplicacao):
  - Operacoes via vault-crud (update/delete) — sem arquivos de codigo

Fase 2 (Prevencao):
  supabase/
    migrations/
      YYYYMMDD_duplicate_detection.sql          # RPC + indice GIN
    functions/
      _shared/
        mcp-tools/
          check-duplicates.ts                    # Nova tool (Tool 30)
          ingest.ts                              # Adicionar pre-check
          register.ts                            # Registrar tool 30
          bootstrap.ts                           # Atualizar catalogo
        duplicate-checker.ts                     # Shared helper reutilizavel
      vault-crud/
        handlers/create.ts                       # Adicionar pre-check
      devvault-mcp/
        index.ts                                 # Atualizar contagem para 30
  docs/
    EDGE_FUNCTIONS_REGISTRY.md                   # v6.3, 30 tools
  .lovable/
    plan.md                                      # Atualizar contagens
```

