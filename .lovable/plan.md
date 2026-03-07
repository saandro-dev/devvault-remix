

# Confirmacao: 31 Tools OK + Issues Pendentes

## Status Atual

As 31 tools estao registradas e visiveis no Antigravity. O fix dos error codes (`MISSING_PARAM`, `VERSION_NOT_FOUND`, `VALIDATION_FAILED`) e do schema do `ingest.ts` funcionou.

## Issues Pendentes -- Confirmado, AINDA EXISTEM

### 1. CRITICO: Auth em GET/DELETE (Protocol 4.1 violation)

**Arquivo:** `supabase/functions/devvault-mcp/index.ts`, linhas 108-112

O handler ainda aplica `authenticateRequest()` em TODOS os metodos HTTP (GET, POST, DELETE). O MCP Streamable HTTP spec exige que GET (SSE session) e DELETE (session termination) passem sem auth. Atualmente funciona apenas porque `mcp-remote --header` envia a key em todas as requests -- um band-aid no lado do client mascarando nosso erro.

**Fix:** Reestruturar o handler para:
- `OPTIONS` -> 204 (ja esta correto)
- `GET` / `DELETE` -> forward direto para `httpHandler()`, sem auth
- `POST` -> authenticate, depois forward (comportamento atual)

### 2. MENOR: JSDoc header desatualizado

**Arquivo:** `supabase/functions/devvault-mcp/index.ts`, linhas 1-5

O JSDoc diz genericamente "auth middleware" sem documentar a estrategia POST-only. Deve ser atualizado apos o fix #1.

### 3. MENOR: Protocol V1.1 diz "22 MCP tools"

O documento do protocolo na secao 2.2 menciona 22 tools, mas o sistema tem 31. Isso e documentacao externa (nao codigo), mas deve ser atualizado na proxima revisao do protocolo.

## Plano de Execucao

### Arquivo: `supabase/functions/devvault-mcp/index.ts`

1. Atualizar JSDoc header: documentar auth strategy (POST-only auth, GET/DELETE unauthenticated per MCP spec)
2. Reestruturar `app.all("/*")`:
   - Apos OPTIONS check e protocol version logging, bifurcar por metodo
   - `GET` / `DELETE`: forward direto ao `httpHandler(c.req.raw)` com CORS e error handling, sem chamar `authenticateRequest`
   - `POST`: manter fluxo atual (auth -> mutate requestAuth -> forward)
3. Deploy da Edge Function `devvault-mcp`
4. Verificacao: testar conexao `mcp-remote` SEM `--header` flag para confirmar que GET handshake funciona sem auth

