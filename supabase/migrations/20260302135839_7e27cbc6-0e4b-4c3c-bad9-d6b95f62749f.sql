
-- 1. Add database_schema column to vault_modules
ALTER TABLE public.vault_modules
ADD COLUMN IF NOT EXISTS database_schema TEXT;

-- 2. Create export_module_tree RPC with recursive CTE
CREATE OR REPLACE FUNCTION public.export_module_tree(p_root_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
BEGIN
  WITH RECURSIVE dep_tree AS (
    -- Base case: the root module
    SELECT
      vm.id,
      vm.slug,
      vm.title,
      vm.description,
      vm.domain::TEXT AS domain,
      vm.module_type::TEXT AS module_type,
      vm.language,
      vm.saas_phase,
      vm.phase_title,
      vm.why_it_matters,
      vm.usage_hint,
      vm.code,
      vm.code_example,
      vm.context_markdown,
      vm.database_schema,
      vm.tags,
      vm.source_project,
      vm.validation_status::TEXT AS validation_status,
      vm.related_modules,
      vm.module_group,
      vm.implementation_order,
      vm.ai_metadata,
      vm.test_code,
      vm.difficulty,
      vm.estimated_minutes,
      vm.common_errors,
      vm.solves_problems,
      vm.prerequisites,
      0 AS depth
    FROM vault_modules vm
    WHERE vm.id = p_root_id

    UNION ALL

    -- Recursive case: follow dependencies
    SELECT
      vm.id,
      vm.slug,
      vm.title,
      vm.description,
      vm.domain::TEXT,
      vm.module_type::TEXT,
      vm.language,
      vm.saas_phase,
      vm.phase_title,
      vm.why_it_matters,
      vm.usage_hint,
      vm.code,
      vm.code_example,
      vm.context_markdown,
      vm.database_schema,
      vm.tags,
      vm.source_project,
      vm.validation_status::TEXT,
      vm.related_modules,
      vm.module_group,
      vm.implementation_order,
      vm.ai_metadata,
      vm.test_code,
      vm.difficulty,
      vm.estimated_minutes,
      vm.common_errors,
      vm.solves_problems,
      vm.prerequisites,
      dt.depth + 1
    FROM vault_modules vm
    INNER JOIN vault_module_dependencies vmd ON vmd.depends_on_id = vm.id
    INNER JOIN dep_tree dt ON dt.id = vmd.module_id
    WHERE dt.depth < 10  -- Safety: max 10 levels deep
  )
  SELECT json_build_object(
    'total_modules', (SELECT COUNT(DISTINCT id) FROM dep_tree),
    'max_depth', (SELECT COALESCE(MAX(depth), 0) FROM dep_tree),
    'modules', (
      SELECT COALESCE(json_agg(m ORDER BY m.depth, m.implementation_order NULLS LAST), '[]'::json)
      FROM (
        SELECT DISTINCT ON (dt.id)
          dt.id, dt.slug, dt.title, dt.description,
          dt.domain, dt.module_type, dt.language,
          dt.saas_phase, dt.phase_title, dt.why_it_matters,
          dt.usage_hint, dt.code, dt.code_example, dt.context_markdown,
          dt.database_schema, dt.tags, dt.source_project,
          dt.validation_status, dt.related_modules,
          dt.module_group, dt.implementation_order,
          dt.ai_metadata, dt.test_code, dt.difficulty,
          dt.estimated_minutes, dt.common_errors,
          dt.solves_problems, dt.prerequisites,
          dt.depth
        FROM dep_tree dt
        ORDER BY dt.id, dt.depth
      ) m
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
