

# Auditoria: error-helpers NAO foi aplicado em 5 arquivos

## Veredicto: INCOMPLETO. Viola Secao 4.4 (Divida Tecnica Zero).

A refatoracao anterior cobriu 18 arquivos, mas **5 arquivos** continuam usando strings de erro brutas (`❌ Failed to...`) sem `errorResponse()`:

```text
supabase/functions/_shared/mcp-tools/
├── diary-bug.ts        (2 pontos: RPC error + uncaught)
├── diary-list.ts       (2 pontos: RPC error + uncaught)
├── diary-resolve.ts    (2 pontos: RPC error + uncaught)
├── task-start.ts       (2 pontos: RPC error + uncaught)
├── task-end.ts         (6 pontos: input validation + task not found + permission + already closed + RPC error + uncaught)
```

**Total: 14 pontos de erro ainda retornando strings brutas.** O agente recebe `❌ Failed to...` sem `_error_code` nem `_recovery_hint`, quebrando a consistencia arquitetural.

---

## Plano de Correcao

Aplicar exatamente o mesmo padrao dos 18 arquivos ja corrigidos:

### diary-bug.ts
- Adicionar `import { errorResponse, classifyRpcError } from "./error-helpers.ts";`
- RPC error: `errorResponse({ code: classifyRpcError(error.message), message: error.message })`
- Uncaught: `errorResponse({ code: "INTERNAL_ERROR", message: String(err) })`

### diary-list.ts
- Mesmo padrao acima

### diary-resolve.ts
- Mesmo padrao acima

### task-start.ts
- Mesmo padrao acima

### task-end.ts (6 pontos)
- Input validation (`Invalid status`): `errorResponse({ code: "INVALID_INPUT", message: "..." })`
- Task not found: `errorResponse({ code: "TASK_NOT_FOUND", message: "..." })`
- Permission denied: `errorResponse({ code: "PERMISSION_DENIED", message: "..." })`
- Already closed: `errorResponse({ code: "INVALID_INPUT", message: "..." })`
- RPC error: `errorResponse({ code: classifyRpcError(updateError.message), message: updateError.message })`
- Uncaught: `errorResponse({ code: "INTERNAL_ERROR", message: String(err) })`

### Nenhum arquivo novo. Nenhuma mudanca de assinatura. Apenas substituicao mecanica de 14 returns.

Apos isso, re-deploy da edge function `devvault-mcp`.

