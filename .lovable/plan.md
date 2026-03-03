

# Plano: Otimizar DevVault para Experiência Zero-Fricção de Agentes IA

## Diagnóstico das Dificuldades Reais

Após investigação profunda do codebase, identifiquei **5 pontos de fricção** que agentes enfrentam:

### 1. Protocol Version Mismatch (Intermitente)
O `mcp-lite@0.10.0` é a versão mais recente disponível no npm. Agentes com clientes MCP mais novos (protocolo `2025-11-25`) podem receber `400 Bad Request` no GET/SSE, enquanto POST funciona via fallback. Não há upgrade possível da lib — precisa de handler customizado.

### 2. Mensagens de Erro Opacas
Quando uma tool falha (ex: RPC error, module not found), o agente recebe `Error: <mensagem crua>` sem contexto de recuperação. O agente não sabe **o que fazer em seguida**.

### 3. `devvault_ingest` Aceita Módulos Incompletos Silenciosamente
O agente ingere um módulo com apenas `title` e `code`, recebe `success: true`, e o módulo fica com score 30/100. Não há **bloqueio proativo** nem **missing_fields na resposta de ingestão** antes de salvar.

### 4. `devvault_search` Não Orienta o Agente em Busca Vazia
Quando a busca retorna 0 resultados, o agente recebe apenas `total_results: 0` sem sugestões de termos alternativos, domínios disponíveis, ou próximos passos.

### 5. Bootstrap Retorna Dados Demais sem Priorização
O `_agent_guide` tem 25 tools listadas de uma vez. Agentes com contexto limitado podem não absorver tudo. Falta um **quick_reference** condensado.

---

## Plano de Correções (5 ações)

### Ação 1: Respostas de Erro Acionáveis em Todas as Tools
**Arquivo:** `supabase/functions/_shared/mcp-tools/` (todos os handlers)

Criar um helper `errorResponse()` que retorne não apenas a mensagem de erro, mas também:
- `_recovery_hint`: o que o agente deve fazer (ex: "Module not found. Try devvault_search to find by keyword.")
- `_error_code`: código padronizado (ex: `MODULE_NOT_FOUND`, `INVALID_SLUG`, `RPC_FAILURE`)

Criar arquivo `supabase/functions/_shared/mcp-tools/error-helpers.ts` com factory de respostas de erro padronizadas.

### Ação 2: Validação Proativa no `devvault_ingest`
**Arquivo:** `supabase/functions/_shared/mcp-tools/ingest.ts`

Antes de inserir no banco, calcular `missing_fields` e retornar na resposta:
- Se score < 50: retornar `_quality_warning: "critical"` com lista de campos faltantes
- Se score < 80: retornar `_quality_warning: "low"` 
- Adicionar campo `_missing_for_100` na resposta SEMPRE

Isso não bloqueia a ingestão (agentes precisam de flexibilidade), mas torna impossível ignorar a incompletude.

### Ação 3: Fallback Inteligente no `devvault_search` para Busca Vazia
**Arquivo:** `supabase/functions/_shared/mcp-tools/search.ts`

Quando `total_results === 0`:
- Retornar `_suggestions.available_domains` com contagem de módulos por domínio
- Retornar `_suggestions.similar_tags` — tags que mais se aproximam dos termos buscados
- Retornar `_suggestions.try_diagnose` — sugerir `devvault_diagnose` se o query parece ser uma mensagem de erro

### Ação 4: Quick Reference Condensado no Bootstrap
**Arquivo:** `supabase/functions/_shared/mcp-tools/bootstrap.ts`

Adicionar um `_quick_reference` no topo da resposta com as 5 tools mais usadas e seus one-liners, ANTES do `_agent_guide` completo. Agentes com contexto limitado conseguem operar com apenas isso:

```json
{
  "_quick_reference": {
    "search": "devvault_search({query: 'seu problema'})",
    "get": "devvault_get({slug: 'module-slug'})",
    "diagnose": "devvault_diagnose({error_message: 'erro literal'})",
    "ingest": "devvault_ingest({title, code, why_it_matters, ...})",
    "list": "devvault_list({domain: 'backend'})"
  }
}
```

### Ação 5: Suporte Multi-Protocol Version no Transport
**Arquivo:** `supabase/functions/devvault-mcp/index.ts`

Adicionar middleware que intercepta o header `MCP-Protocol-Version` e:
- Se o servidor não suporta a versão requisitada, retornar resposta JSON-RPC válida com `supported_versions` em vez de `400 Bad Request` cru
- Logar a versão requisitada para monitorar quando upgrade for necessário

---

## Arquivos Afetados

```text
supabase/functions/_shared/mcp-tools/
├── error-helpers.ts          (NOVO — factory de respostas de erro)
├── bootstrap.ts              (EDITAR — adicionar _quick_reference)
├── ingest.ts                 (EDITAR — validação proativa + _missing_for_100)
├── search.ts                 (EDITAR — fallback inteligente para busca vazia)
supabase/functions/devvault-mcp/
├── index.ts                  (EDITAR — middleware de protocol version)
```

## Prioridade de Implementação
1. **error-helpers.ts** + aplicar em `get.ts` e `ingest.ts` (maior impacto imediato)
2. **ingest.ts** validação proativa (previne módulos de baixa qualidade)
3. **search.ts** fallback inteligente (resolve frustração de busca vazia)
4. **bootstrap.ts** quick reference (melhora onboarding)
5. **index.ts** protocol version (estabilidade de conexão)

