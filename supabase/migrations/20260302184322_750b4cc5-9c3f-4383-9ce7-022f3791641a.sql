
-- Fix 1: Replace vault_module_completeness with correct-by-design v_total
-- Root cause: v_total was hardcoded to 12/13 but bonus fields (common_errors,
-- test_code, solves_problems) and conditional database_schema were checked
-- without incrementing v_total, leading to potential scores > 100%.

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
BEGIN
  SELECT * INTO v_mod FROM vault_modules WHERE vault_modules.id = p_id;
  IF NOT FOUND THEN
    score := 0; missing_fields := ARRAY['module_not_found'];
    RETURN NEXT; RETURN;
  END IF;

  v_is_grouped := (v_mod.module_group IS NOT NULL AND trim(v_mod.module_group) != '');
  v_is_root := v_is_grouped AND (v_mod.implementation_order IS NOT NULL AND v_mod.implementation_order = 1);
  v_needs_db_schema := (v_mod.domain::TEXT IN ('backend', 'architecture', 'security'));

  -- ═══ EXPLICIT v_total CALCULATION ═══
  -- Core fields: 9
  --   title, description, why_it_matters, code, code_example,
  --   context_markdown, tags, slug, domain
  v_total := 9;

  -- Conditional: dependencies (grouped non-root only): +1
  IF v_is_grouped AND NOT v_is_root THEN
    v_total := v_total + 1;
  END IF;

  -- Bonus fields (always counted): +3
  --   common_errors, test_code, solves_problems
  v_total := v_total + 3;

  -- Conditional: database_schema (backend/architecture/security only): +1
  IF v_needs_db_schema THEN
    v_total := v_total + 1;
  END IF;
  -- ═══ END v_total — now correct-by-design ═══

  -- ═══ FIELD CHECKS ═══

  -- Core fields (9)
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

  -- Conditional: dependencies (grouped non-root only)
  IF v_is_grouped AND NOT v_is_root THEN
    SELECT EXISTS(SELECT 1 FROM vault_module_dependencies WHERE module_id = p_id) INTO v_has_deps;
    IF v_has_deps THEN v_filled := v_filled + 1;
    ELSE v_missing := array_append(v_missing, 'dependencies'); END IF;
  END IF;

  -- Bonus: common_errors
  IF v_mod.common_errors IS NOT NULL AND v_mod.common_errors::text != '[]' AND v_mod.common_errors::text != 'null' THEN
    v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'common_errors'); END IF;

  -- Bonus: test_code
  IF v_mod.test_code IS NOT NULL AND trim(v_mod.test_code) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'test_code'); END IF;

  -- Bonus: solves_problems
  IF v_mod.solves_problems IS NOT NULL AND array_length(v_mod.solves_problems, 1) > 0 THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'solves_problems'); END IF;

  -- Conditional: database_schema (only for backend/architecture/security)
  IF v_needs_db_schema THEN
    IF v_mod.database_schema IS NOT NULL AND trim(v_mod.database_schema) != '' THEN v_filled := v_filled + 1;
    ELSE v_missing := array_append(v_missing, 'database_schema'); END IF;
  END IF;

  score := (v_filled * 100) / v_total;
  missing_fields := v_missing;
  RETURN NEXT;
END;
$function$;
