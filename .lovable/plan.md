

# DevVault — Oportunidades de Melhoria

Apos analise completa do codebase (frontend, backend, schema, UI), identifiquei melhorias organizadas por impacto.

---

## 1. Canal Primario (MCP / Agentes) — Impacto MAXIMO

### 1A. Playbooks Compostos
O sistema de `vault_playbooks` existe no banco (tabela + RLS + modulos), mas **nao tem nenhuma Edge Function nem MCP tool** para criar/consumir playbooks. Um agente hoje nao consegue pedir "me de o playbook completo para implementar auth resilience".

**Acao:** Criar MCP tool `devvault_get_playbook_composed` que retorna uma sequencia ordenada de modulos com `implementation_order`, `module_group` e dependencias resolvidas — um roteiro completo de implementacao.

### 1B. Semantic Search (Vector)
Os embeddings existem (coluna `embedding` na tabela, backfill strategy), mas a busca MCP (`devvault_search`) usa apenas `tsvector` full-text search. **Nao existe busca semantica por similaridade vetorial.** Um agente que busca "como lidar com sessao expirada" pode nao encontrar modulos cujo titulo e "refresh-coordinator".

**Acao:** Adicionar busca hibrida (tsvector + cosine similarity) na tool `devvault_search`, usando `pgvector` `<=>` operator.

### 1C. Versionamento de Modulos
Modulos tem campo `version` (text) e tabela `vault_module_changelog`, mas nao existe mecanismo para manter versoes anteriores do codigo. Se um modulo e atualizado, o codigo anterior se perde.

**Acao:** Criar tabela `vault_module_versions` que armazena snapshots do `code` + `context_markdown` a cada update, com MCP tool para buscar versao especifica.

---

## 2. Canal Secundario (UI Web) — Impacto ALTO

### 2A. Markdown Rendering
O `context_markdown` e exibido como texto puro (`whitespace-pre-wrap`) no `VaultDetailPage`. Nao renderiza headings, listas, code blocks, nem links. Com 850 modulos contendo context_markdown rico, isso e uma perda significativa de usabilidade.

**Acao:** Integrar `react-markdown` + `rehype-highlight` para renderizar markdown real.

### 2B. Dashboard Analytics para MCP
O dashboard mostra apenas contadores basicos (projetos, modulos, keys, bugs). Nao mostra **nenhuma metrica do canal primario**: quais tools MCP sao mais usadas, quais modulos sao mais buscados, knowledge gaps abertos, taxa de sucesso dos agentes.

**Acao:** Criar dashboard cards com dados de `vault_usage_events`, `vault_knowledge_gaps`, e `vault_agent_tasks`.

### 2C. Vault Detail — Campos Invisíveis
O `VaultDetailPage` nao exibe: `common_errors`, `solves_problems`, `test_code`, `database_schema`, `why_it_matters`, `usage_hint`, `difficulty`, `estimated_minutes`, `module_group`, `implementation_order`, `version`, `related_modules`. Esses campos existem no banco e sao preenchidos em 100% dos modulos, mas o curador humano nao consegue ve-los na UI.

**Acao:** Adicionar secoes colapsaveis para todos os campos ausentes.

### 2D. Vault List — Filtros Avancados
A listagem so filtra por domain e texto. Faltam filtros por: `module_type`, `validation_status`, `module_group`, `difficulty`, `language`, `has_test_code`.

**Acao:** Adicionar painel de filtros avancados.

---

## 3. Infraestrutura & Seguranca — Impacto MEDIO-ALTO

### 3A. Observabilidade MCP
Nao existe um painel de "saude do MCP" — latencia media por tool, taxa de erro, top queries sem resultado (knowledge gaps). Os dados estao em `vault_usage_events` e `vault_knowledge_gaps` mas nao sao visualizados.

**Acao:** Criar tab "MCP Health" no Admin com graficos (recharts) de uso, latencia, e gaps.

### 3B. Testes Automatizados
O projeto tem apenas `src/test/example.test.ts`. Zero testes reais para hooks, edge functions, ou logica de negocio.

**Acao:** Criar suite de testes para os hooks criticos (`useVaultModules`, `usePermissions`) e unit tests para logica compartilhada (`input-sanitizer`, `rate-limit-guard`).

### 3C. Error Boundary Global
Nao existe error boundary no React. Um erro em qualquer componente derruba toda a aplicacao.

**Acao:** Criar `ErrorBoundary` component com fallback UI e integracao Sentry.

---

## 4. Qualidade de Codigo

### 4A. SearchPage acessa Supabase diretamente
`SearchPage.tsx` faz `supabase.functions.invoke("global-search", ...)` diretamente — correto por ser Edge Function. Mas usa `useCallback` com dependencia em `toast` e `t`, o que pode causar re-renders desnecessarios.

### 4B. SettingsPage acessa Storage diretamente
`SettingsPage.tsx` faz `supabase.storage.from("avatars").upload(...)` — acesso direto ao storage, sem passar por Edge Function. Viola a regra 5.5 do protocolo (Zero Database Access from Frontend). Storage e diferente de database, mas o espirito da regra e centralizar I/O.

---

## Priorizacao Recomendada (Protocolo 2.3 — Agente Primeiro)

| Prioridade | Melhoria | Impacto MCP |
|---|---|---|
| 1 | Semantic Search hibrida (1B) | MAXIMO — agentes encontram modulos por intencao |
| 2 | Playbooks compostos via MCP (1A) | MAXIMO — roteiros de implementacao completos |
| 3 | Markdown rendering na UI (2A) | ALTO — curadores conseguem validar conteudo |
| 4 | Dashboard MCP analytics (2B) | ALTO — visibilidade do canal primario |
| 5 | Vault Detail campos completos (2C) | ALTO — curadoria efetiva |
| 6 | MCP Health admin tab (3A) | MEDIO — observabilidade |
| 7 | Error Boundary (3C) | MEDIO — estabilidade |
| 8 | Filtros avancados vault (2D) | MEDIO — produtividade curador |
| 9 | Versionamento de modulos (1C) | MEDIO — historico |
| 10 | Testes automatizados (3B) | MEDIO — confiabilidade |

