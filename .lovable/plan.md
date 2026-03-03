

# Auditoria Completa: O que ainda falta para o DevVault ser extremamente util para IAs

Apos investigacao profunda de todas as 25 MCP tools, do schema, dos helpers, e da arquitetura, identifiquei **7 melhorias concretas** que elevariam significativamente a utilidade do sistema para agentes de IA. Ordenadas por impacto.

---

## 1. `devvault_batch_ingest` — Ingestao em massa (IMPACTO CRITICO)

**Problema:** Hoje so existe `devvault_ingest` que cria UM modulo por chamada. Para adicionar conteudo em massa (ex: extrair 30 modulos do Risecheckout), o agente precisa fazer 30 chamadas sequenciais, cada uma gerando embedding, calculando completeness, etc.

**Solucao:** Nova MCP tool `devvault_batch_ingest` que aceita um array de modulos (ate 20 por chamada), processa em lote, e retorna resultados agregados. Reutiliza a logica do `ingest.ts` mas com batching otimizado (embeddings em paralelo, insert em batch).

**Arquivos novos:** `supabase/functions/_shared/mcp-tools/batch-ingest.ts`
**Arquivos editados:** `register.ts` (1 import + 1 linha), `bootstrap.ts` (tool catalog + guide), `usage-tracker.ts` (novo event_type)

---

## 2. `devvault_similar` — Busca por similaridade (IMPACTO ALTO)

**Problema:** Nao existe tool para "dado este modulo, mostre modulos similares". O agente precisa copiar o titulo/descricao e fazer search manual. Isso impede descoberta de duplicatas antes de ingerir e navegacao por similaridade.

**Solucao:** Nova tool que recebe um `module_id` e retorna os N modulos mais similares via distancia de embedding (cosine similarity). Util tanto para prevenir duplicatas no ingest quanto para descoberta.

**Arquivos novos:** `supabase/functions/_shared/mcp-tools/similar.ts`
**DB:** Nova RPC function `find_similar_modules(p_module_id uuid, p_limit int)` que faz `ORDER BY embedding <=> target_embedding`.

---

## 3. Usage Tracker — Event types incompletos (IMPACTO MEDIO)

**Problema:** O `UsageEvent.event_type` union type nao inclui todos os event types realmente usados. `load_context`, `health_check`, `changelog`, `changelog_global`, `ingest` e `delete` nao estao no type, causando type errors silenciosos ou eventos nao rastreados.

**Solucao:** Atualizar o union type em `usage-tracker.ts` para incluir todos os event types usados por todas as 25 tools. Adicionar `trackUsage` calls nas tools que nao rastreiam (ex: `ingest.ts`, `delete.ts` nao chamam `trackUsage`).

---

## 4. `devvault_stats` — Metricas do vault para o agente (IMPACTO MEDIO)

**Problema:** O agente nao tem como saber "quantos modulos existem no total?", "qual o score medio?", "quantos modulos validados vs draft?". Essas metricas ajudam o agente a decidir se precisa ingerir mais conteudo ou melhorar o existente.

**Solucao:** Nova tool simples que retorna: total_modules, by_status (validated/draft/deprecated), by_domain, average_completeness, modules_without_embedding, recent_activity_count (ultimos 7 dias).

---

## 5. Melhoria no `devvault_ingest`: deteccao de duplicatas pre-insert (IMPACTO MEDIO)

**Problema:** Hoje o agente pode criar modulos duplicados sem saber. O unico guard e o unique constraint no slug, mas titulos diferentes geram slugs diferentes mesmo que o conteudo seja identico.

**Solucao:** Antes de inserir, fazer uma busca por similaridade de embedding do titulo+descricao. Se encontrar modulo com cosine similarity > 0.92, retornar warning com `_potential_duplicates` e sugerir `devvault_update` em vez de `devvault_ingest`. Nao bloqueia, apenas avisa.

---

## 6. `devvault_update` — Suporte a operacoes de array (append) (IMPACTO MEDIO)

**Problema:** Para adicionar uma tag a um modulo, o agente precisa primeiro chamar `devvault_get` para ler as tags atuais, depois chamar `devvault_update` com o array completo (tags existentes + nova). Isso e ineficiente e race-condition prone.

**Solucao:** Adicionar parametros `append_tags`, `append_solves_problems`, `append_common_errors` ao `devvault_update` que fazem `array_cat` / `jsonb_concat` no SQL em vez de substituir o array inteiro.

---

## 7. Melhoria no `devvault_get`: campo `_usage_stats` (IMPACTO BAIXO)

**Problema:** Quando o agente busca um modulo, ele nao sabe se esse modulo ja foi usado com sucesso por outros agentes ou quantas vezes foi buscado. Essa informacao ajuda a avaliar confiabilidade.

**Solucao:** Adicionar ao response do `devvault_get` um campo `_usage_stats` com: `times_fetched`, `times_used_in_tasks`, `success_rate` (baseado em `vault_usage_events` e `agent_tasks`).

---

## Ordem de implementacao recomendada

```text
Prioridade 1 (pre-ingestao em massa):
  1. devvault_batch_ingest
  2. Deteccao de duplicatas no ingest
  3. Usage tracker event types fix

Prioridade 2 (qualidade da base):
  4. devvault_similar
  5. devvault_update append operations
  6. devvault_stats

Prioridade 3 (analytics):
  7. _usage_stats no devvault_get
```

## Detalhes tecnicos

- Todas as novas tools seguem o padrao existente: `ToolRegistrar`, `errorResponse()`, `trackUsage()`, `createLogger()`.
- Nenhuma mudanca no frontend (canal secundario).
- Cada nova tool requer: 1 arquivo novo + 2 linhas em `register.ts` + atualizacao do `AGENT_GUIDE` no `bootstrap.ts`.
- `batch_ingest` e `similar` requerem nova RPC function no Postgres.
- Total estimado: ~26 tool (de 25 para 28, adicionando batch_ingest, similar, stats).

Confirme quais melhorias quer implementar (ou todas) e eu inicio pela Prioridade 1.

