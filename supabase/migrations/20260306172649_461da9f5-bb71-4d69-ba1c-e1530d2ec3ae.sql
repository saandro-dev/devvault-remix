
CREATE OR REPLACE FUNCTION public.get_visible_modules(
  p_user_id uuid,
  p_scope text DEFAULT 'owned',
  p_domain text DEFAULT NULL,
  p_module_type text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_validation_status text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_language text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, description text, domain text, module_type text,
  language text, tags text[], saas_phase integer, phase_title text,
  why_it_matters text, usage_hint text, code_example text, source_project text,
  validation_status text, visibility text, related_modules uuid[],
  created_at timestamptz, updated_at timestamptz, ai_metadata jsonb,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vm.id, vm.title, vm.description,
    vm.domain::TEXT, vm.module_type::TEXT, vm.language,
    vm.tags, vm.saas_phase, vm.phase_title,
    vm.why_it_matters, vm.usage_hint, vm.code_example, vm.source_project,
    vm.validation_status::TEXT, vm.visibility::TEXT,
    vm.related_modules, vm.created_at, vm.updated_at, vm.ai_metadata,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM public.vault_modules vm
  WHERE
    CASE p_scope
      WHEN 'owned' THEN vm.user_id = p_user_id
      WHEN 'shared_with_me' THEN
        vm.visibility = 'shared'
        AND EXISTS (
          SELECT 1 FROM public.vault_module_shares vms
          WHERE vms.module_id = vm.id AND vms.shared_with_user_id = p_user_id
        )
      WHEN 'global' THEN vm.visibility = 'global'
      WHEN 'all' THEN
        vm.user_id = p_user_id
        OR vm.visibility = 'global'
        OR (vm.visibility = 'shared' AND EXISTS (
          SELECT 1 FROM public.vault_module_shares vms
          WHERE vms.module_id = vm.id AND vms.shared_with_user_id = p_user_id
        ))
      ELSE vm.user_id = p_user_id
    END
    AND (p_domain IS NULL OR vm.domain::TEXT = p_domain)
    AND (p_module_type IS NULL OR vm.module_type::TEXT = p_module_type)
    AND (p_query IS NULL OR vm.title ILIKE '%' || p_query || '%' OR vm.description ILIKE '%' || p_query || '%')
    AND (p_validation_status IS NULL OR vm.validation_status::TEXT = p_validation_status)
    AND (p_difficulty IS NULL OR vm.difficulty = p_difficulty)
    AND (p_language IS NULL OR vm.language = p_language)
  ORDER BY
    CASE vm.validation_status WHEN 'validated' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
    vm.saas_phase NULLS LAST,
    vm.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
