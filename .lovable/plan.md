
# Plano de Correção: MCP Bugs Criticos e Menores

## Diagnóstico Confirmado

Investigação profunda concluída. Resultados:

1. **Coluna `database_schema` NAO existe** na tabela `vault_modules` -- causa raiz dos bugs criticos
2. **RPC `export_module_tree` NAO existe** -- causa do bug no `devvault_export_tree`
3. **Bug de comparação de versões** em `check-updates.ts` -- comparação string vs string mas com formatos inconsistentes ("v1" vs "1")

---

## Analise de Soluções

### Solução A: Adicionar coluna + corrigir RPCs + corrigir codigo
- Manutenibilidade: 10/10
- Zero DT: 10/10
- Arquitetura: 10/10
- Escalabilidade: 10/10
- Segurança: 10/10
- **NOTA FINAL: 10/10**

Adicionar a coluna `database_schema` que o codigo ja espera, atualizar a RPC `get_vault_module` para incluí-la, criar a RPC `export_module_tree`, atualizar a função `vault_module_completeness` para incluir o campo, e corrigir os bugs menores no codigo TypeScript.

### Solução B: Remover todas as referências a `database_schema`
- Manutenibilidade: 7/10
- Zero DT: 6/10 (perde funcionalidade planejada)
- Arquitetura: 6/10 (remove campo util para módulos SQL)
- Escalabilidade: 5/10
- Segurança: 10/10
- **NOTA FINAL: 6.6/10**

Remove funcionalidade que tem valor real para módulos que incluem SQL migrations.

### DECISÃO: Solução A (Nota 10)
A Solução B e inferior porque descarta funcionalidade que ja esta integrada no codigo e que tem valor real para módulos do tipo `sql_migration`.

---

## Plano de Execução

### 1. Migration: Adicionar coluna `database_schema` + criar RPC `export_module_tree`

SQL migration que:
- Adiciona `database_schema TEXT` a `vault_modules` (ja referenciada em `update.ts`, `get.ts`, `completeness.ts`)
- Cria a RPC `export_module_tree` com recursive CTE para resolver a arvore de dependências completa
- Atualiza a RPC `get_vault_module` para incluir `vm.database_schema` (que ja esta la no SQL mas falha porque a coluna nao existe)

### 2. Corrigir `check-updates.ts` -- Bug de comparação de versões

Problema: `vaultVersion !== mod.version` compara strings diretamente, mas o vault armazena "v1" e o agente pode enviar "1".

Correção: Normalizar versões antes de comparar -- extrair a parte numérica de ambas e comparar.

### 3. Corrigir `export-tree.ts` -- Bug de 0 root modules em discovery

Problema: A query busca apenas os últimos 20 módulos (`limit(20)`) e depois filtra em memória por quem tem dependents. Se nenhum dos 20 mais recentes tiver dependentes, retorna 0.

Correção: Inverter a lógica -- primeiro buscar IDs que aparecem em `depends_on_id` (sao dependidos por outros) e depois buscar os módulos correspondentes que NAO aparecem em `module_id` (nao dependem de ninguém).

### 4. Atualizar `vault_module_completeness` RPC

A RPC ja valida `database_schema` no bloco de bonus fields, mas como a coluna nao existe, falha silenciosamente (o `SELECT *` pega todas as colunas). Apos adicionar a coluna, a RPC vai funcionar automaticamente.

---

## Arvore de Arquivos Afetados

```text
supabase/migrations/          -- Nova migration SQL
supabase/functions/_shared/mcp-tools/
  check-updates.ts            -- Fix: normalizar comparação de versões
  export-tree.ts              -- Fix: lógica de root modules discovery
```

## Detalhes Técnicos

### Migration SQL

```sql
-- 1. Adicionar coluna database_schema
ALTER TABLE public.vault_modules
ADD COLUMN IF NOT EXISTS database_schema TEXT;

-- 2. Criar RPC export_module_tree (recursive CTE)
CREATE OR REPLACE FUNCTION public.export_module_tree(p_root_id UUID)
RETURNS JSON ...
-- Resolve toda a arvore de dependências recursivamente
-- Retorna: total_modules, max_depth, modules[] com código completo
```

### check-updates.ts

Normalizar versões com função utilitária:
```typescript
function normalizeVersion(v: string): string {
  return v.replace(/^v/i, "").trim();
}
// Comparação: normalizeVersion(vaultVersion) !== normalizeVersion(mod.version)
```

### export-tree.ts (discovery mode)

Substituir a lógica atual (buscar N módulos e filtrar em memória) por:
1. Buscar todos os `depends_on_id` distintos da tabela de dependências
2. Desses, remover os que também aparecem como `module_id` (tem dependências próprias)
3. Buscar os módulos resultantes -- esses sao os verdadeiros roots
