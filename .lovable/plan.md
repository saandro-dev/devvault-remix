

# Fix: Corrigir Error Codes Inválidos em 2 MCP Tools

## Problema
Duas tools (`devvault_check_duplicates` e `devvault_get_version`) usam error codes que não existem no tipo `ErrorCode` de `error-helpers.ts`. Isso pode causar falha silenciosa no registro, explicando por que o client só vê 29 das 31 tools.

## Correções

### 1. `supabase/functions/_shared/mcp-tools/error-helpers.ts`
Adicionar os 3 error codes faltantes ao tipo `ErrorCode` e ao mapa `RECOVERY_HINTS`:
- `"MISSING_PARAM"` — parâmetro obrigatório ausente
- `"VERSION_NOT_FOUND"` — versão específica não encontrada
- Renomear uso de `"VALIDATION_ERROR"` para o já existente `"VALIDATION_FAILED"`

### 2. `supabase/functions/_shared/mcp-tools/check-duplicates.ts`
- Linha 46: trocar `"VALIDATION_ERROR"` por `"VALIDATION_FAILED"` (já existe no tipo)

### 3. `supabase/functions/_shared/mcp-tools/get-version.ts`
- Manter `"MISSING_PARAM"` e `"VERSION_NOT_FOUND"` (serão adicionados ao tipo)

### 4. Deploy
Redeployar a Edge Function `devvault-mcp` para aplicar as correções.

### 5. Verificação
Após deploy, reconectar no Antigravity e confirmar se agora aparecem 31 tools. Se continuar 29, o limite é do client.

