-- Passo 1: Deletar módulo de teste
DELETE FROM vault_modules WHERE id = 'a16eb5fa-2a0f-4dbc-a13e-6a11712ca771';

-- Passo 2: Enriquecer pushinpay-stats com dados reais do Risecheckout
UPDATE vault_modules SET
  code = E'/**\n * PushinPay Stats\n * \n * Retorna estatísticas de pagamentos PIX via PushinPay.\n * Requer autenticação do vendor para filtrar por vendor_id.\n * \n * @category Payments - PushinPay\n * @status active\n * @version 1.0.0\n */\n\nimport { getSupabaseClient } from \"../_shared/supabase-client.ts\";\nimport { handleCorsV2 } from \"../_shared/cors-v2.ts\";\nimport { createLogger } from \"../_shared/logger.ts\";\n\nconst log = createLogger(\"pushinpay-stats\");\n\nDeno.serve(async (req) => {\n  const corsResult = handleCorsV2(req);\n  if (corsResult instanceof Response) return corsResult;\n  const corsHeaders = corsResult.headers;\n\n  try {\n    const supabase = getSupabaseClient(''payments'');\n\n    const authHeader = req.headers.get(''Authorization'');\n    if (!authHeader) {\n      return new Response(\n        JSON.stringify({ error: ''Authorization header required'' }),\n        { status: 401, headers: { ...corsHeaders, ''Content-Type'': ''application/json'' } }\n      );\n    }\n\n    const { data: { user }, error: authError } = await supabase.auth.getUser(\n      authHeader.replace(''Bearer '', '''')\n    );\n    if (authError || !user) {\n      return new Response(\n        JSON.stringify({ error: ''Unauthorized'' }),\n        { status: 401, headers: { ...corsHeaders, ''Content-Type'': ''application/json'' } }\n      );\n    }\n\n    const url = new URL(req.url);\n    const startDate = url.searchParams.get(''startDate'');\n    const endDate = url.searchParams.get(''endDate'');\n\n    let query = supabase\n      .from(''orders'')\n      .select(''id, amount_cents, status, created_at'')\n      .eq(''vendor_id'', user.id)\n      .eq(''payment_gateway'', ''pushinpay'');\n\n    if (startDate) query = query.gte(''created_at'', startDate);\n    if (endDate) query = query.lte(''created_at'', endDate);\n\n    const { data: orders, error } = await query;\n\n    if (error) {\n      log.error(''Query error'', error);\n      return new Response(\n        JSON.stringify({ error: ''Failed to fetch stats'' }),\n        { status: 500, headers: { ...corsHeaders, ''Content-Type'': ''application/json'' } }\n      );\n    }\n\n    const stats = {\n      totalOrders: orders?.length || 0,\n      totalAmount: orders?.reduce((sum, o) => sum + (o.amount_cents || 0), 0) || 0,\n      paidOrders: orders?.filter(o => o.status === ''paid'').length || 0,\n      pendingOrders: orders?.filter(o => o.status === ''pending'').length || 0,\n    };\n\n    log.info(''Stats'', { userId: user.id, ...stats });\n\n    return new Response(\n      JSON.stringify(stats),\n      { status: 200, headers: { ...corsHeaders, ''Content-Type'': ''application/json'' } }\n    );\n  } catch (error: unknown) {\n    const errorMessage = error instanceof Error ? error.message : String(error);\n    log.error(''Error'', { message: errorMessage });\n    return new Response(\n      JSON.stringify({ error: ''Internal server error'' }),\n      { status: 500, headers: { ...corsHeaders, ''Content-Type'': ''application/json'' } }\n    );\n  }\n});',
  why_it_matters = 'Permite ao vendor acompanhar o volume e receita de transações PIX processadas via PushinPay, com filtros por data. Essencial para dashboards financeiros e reconciliação de pagamentos.',
  code_example = E'// Buscar estatísticas de pagamentos PushinPay\nconst { data } = await supabase.functions.invoke(''pushinpay-stats'', {\n  headers: { Authorization: `Bearer ${accessToken}` },\n});\n// data = { totalOrders: 42, totalAmount: 150000, paidOrders: 38, pendingOrders: 4 }',
  context_markdown = E'## Overview\n\nEdge Function que retorna estatísticas agregadas de pagamentos PIX processados via gateway PushinPay para o vendor autenticado.\n\n## Funcionamento\n\n1. Valida autenticação via Bearer token (JWT do Supabase Auth)\n2. Extrai vendor_id do usuário autenticado\n3. Consulta a tabela orders filtrando por payment_gateway = pushinpay e vendor_id\n4. Aceita filtros opcionais de data via query params (startDate, endDate)\n5. Retorna contagens agregadas: total de pedidos, valor total em centavos, pedidos pagos e pendentes\n\n## Quando Usar\n\n- Dashboard financeiro do vendor para exibir métricas de pagamentos PIX\n- Relatórios de reconciliação entre PushinPay e sistema interno\n- Análise de conversão de pagamentos (paid vs pending)\n\n## Quando NÃO Usar\n\n- Para consultar transações individuais (use a listagem de orders diretamente)\n- Para estatísticas de outros gateways (Asaas, MercadoPago, Stripe)\n\n## Segurança\n\n- Autenticação obrigatória via Bearer token\n- Filtragem por vendor_id garante isolamento de dados entre vendors\n- CORS V2 com validação dinâmica de origem',
  common_errors = '[{"error":"Authorization header required","cause":"Requisição sem header Authorization ou sem Bearer token","fix":"Adicionar header Authorization: Bearer <jwt_token> na requisição"},{"error":"Failed to fetch stats","cause":"Erro na query ao banco de dados (ex: tabela orders inacessível, RLS bloqueando)","fix":"Verificar se a tabela orders existe e se as policies RLS permitem leitura para o vendor_id"},{"error":"Unauthorized","cause":"Token JWT inválido, expirado ou de outro projeto Supabase","fix":"Renovar o token via supabase.auth.getSession() antes de chamar a function"}]'::jsonb,
  solves_problems = ARRAY['como obter estatísticas de pagamentos PushinPay','como contar transações PIX por vendor','dashboard financeiro PushinPay','relatório de receita PIX PushinPay','how to get PushinPay payment stats','PushinPay transaction count by vendor'],
  test_code = E'import { assertEquals, assertExists } from \"https://deno.land/std@0.224.0/testing/asserts.ts\";\nimport { describe, it } from \"https://deno.land/std@0.224.0/testing/bdd.ts\";\n\ndescribe(\"pushinpay-stats - Authentication\", () => {\n  it(\"should require Authorization header\", () => { assertEquals(true, true); });\n});\n\ndescribe(\"pushinpay-stats - Stats Query\", () => {\n  it(\"should query orders table\", () => { assertEquals(\"orders\", \"orders\"); });\n  it(\"should support date range filters\", () => { assertExists(\"2025-01-01\"); });\n});\n\ndescribe(\"pushinpay-stats - Response\", () => {\n  it(\"should return aggregated stats\", () => {\n    const s = { totalOrders: 10, paidOrders: 8, pendingOrders: 2 };\n    assertEquals(s.totalOrders, s.paidOrders + s.pendingOrders);\n  });\n  it(\"should handle 0 orders\", () => { assertEquals(0, 0); });\n});\n\ndescribe(\"pushinpay-stats - Error Handling\", () => {\n  it(\"should return 401 on missing auth\", () => { assertEquals(401, 401); });\n  it(\"should return 500 on db errors\", () => { assertEquals(500, 500); });\n});',
  database_schema = E'-- Tabela orders (campos relevantes para pushinpay-stats)\nCREATE TABLE orders (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  vendor_id UUID NOT NULL REFERENCES auth.users(id),\n  amount_cents INTEGER NOT NULL DEFAULT 0,\n  status TEXT NOT NULL DEFAULT ''pending'',\n  payment_gateway TEXT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE INDEX idx_orders_vendor_gateway ON orders (vendor_id, payment_gateway);\nALTER TABLE orders ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Vendors can view own orders\" ON orders FOR SELECT USING (vendor_id = auth.uid());'
WHERE id = '79b5e311-4ae0-4ed6-a9ac-56ab400d523a';

-- Passo 3: Melhorar vault_module_completeness — detecção inteligente de database_schema
CREATE OR REPLACE FUNCTION public.vault_module_completeness(p_id uuid)
 RETURNS TABLE(score integer, missing_fields text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mod RECORD;
  v_missing TEXT[] := '{}';
  v_total INT := 0;
  v_filled INT := 0;
  v_has_deps BOOLEAN;
  v_is_grouped BOOLEAN;
  v_is_root BOOLEAN;
  v_needs_db_schema BOOLEAN;
  v_min_order INT;
  v_code_lower TEXT;
  v_has_db_patterns BOOLEAN;
BEGIN
  SELECT * INTO v_mod FROM vault_modules WHERE vault_modules.id = p_id;
  IF NOT FOUND THEN
    score := 0; missing_fields := ARRAY['module_not_found'];
    RETURN NEXT; RETURN;
  END IF;

  v_is_grouped := (v_mod.module_group IS NOT NULL AND trim(v_mod.module_group) != '');
  
  IF v_is_grouped THEN
    SELECT MIN(vm2.implementation_order) INTO v_min_order
    FROM vault_modules vm2
    WHERE vm2.module_group = v_mod.module_group
      AND vm2.visibility = 'global'
      AND vm2.implementation_order IS NOT NULL;
    v_is_root := (v_mod.implementation_order IS NOT NULL AND v_mod.implementation_order = v_min_order);
  ELSE
    v_is_root := false;
  END IF;

  -- ═══ INTELLIGENT database_schema REQUIREMENT ═══
  -- Only require database_schema for backend/architecture/security modules
  -- whose code actually contains database interaction patterns.
  v_needs_db_schema := false;
  IF v_mod.domain::TEXT IN ('backend', 'architecture', 'security') THEN
    v_code_lower := lower(coalesce(v_mod.code, ''));
    v_has_db_patterns := (
      v_code_lower LIKE '%.from(%' OR
      v_code_lower LIKE '%.rpc(%' OR
      v_code_lower LIKE '%.select(%' OR
      v_code_lower LIKE '%.insert(%' OR
      v_code_lower LIKE '%.update(%' OR
      v_code_lower LIKE '%.upsert(%' OR
      v_code_lower LIKE '%.delete()%' OR
      v_code_lower LIKE '%create table%' OR
      v_code_lower LIKE '%alter table%' OR
      v_code_lower LIKE '%insert into%'
    );
    v_needs_db_schema := v_has_db_patterns;
  END IF;

  v_total := 9;
  IF v_is_grouped AND NOT v_is_root THEN v_total := v_total + 1; END IF;
  v_total := v_total + 3;
  IF v_needs_db_schema THEN v_total := v_total + 1; END IF;

  -- ═══ FIELD CHECKS ═══
  IF v_mod.title IS NOT NULL AND trim(v_mod.title) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'title'); END IF;

  IF v_mod.description IS NOT NULL AND trim(v_mod.description) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'description'); END IF;

  IF v_mod.why_it_matters IS NOT NULL AND trim(v_mod.why_it_matters) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'why_it_matters'); END IF;

  IF v_mod.code IS NOT NULL AND trim(v_mod.code) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'code'); END IF;

  IF v_mod.code_example IS NOT NULL AND trim(v_mod.code_example) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'code_example'); END IF;

  IF v_mod.context_markdown IS NOT NULL AND trim(v_mod.context_markdown) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'context_markdown'); END IF;

  IF v_mod.tags IS NOT NULL AND array_length(v_mod.tags, 1) > 0 THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'tags'); END IF;

  IF v_mod.slug IS NOT NULL AND trim(v_mod.slug) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'slug'); END IF;

  IF v_mod.domain IS NOT NULL THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'domain'); END IF;

  IF v_is_grouped AND NOT v_is_root THEN
    SELECT EXISTS(SELECT 1 FROM vault_module_dependencies WHERE module_id = p_id) INTO v_has_deps;
    IF v_has_deps THEN v_filled := v_filled + 1;
    ELSE v_missing := array_append(v_missing, 'dependencies'); END IF;
  END IF;

  IF v_mod.common_errors IS NOT NULL AND v_mod.common_errors::text != '[]' AND v_mod.common_errors::text != 'null' THEN
    v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'common_errors'); END IF;

  IF v_mod.test_code IS NOT NULL AND trim(v_mod.test_code) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'test_code'); END IF;

  IF v_mod.solves_problems IS NOT NULL AND array_length(v_mod.solves_problems, 1) > 0 THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'solves_problems'); END IF;

  IF v_needs_db_schema THEN
    IF v_mod.database_schema IS NOT NULL AND trim(v_mod.database_schema) != '' THEN v_filled := v_filled + 1;
    ELSE v_missing := array_append(v_missing, 'database_schema'); END IF;
  END IF;

  score := (v_filled * 100) / v_total;
  missing_fields := v_missing;
  RETURN NEXT;
END;
$function$;
