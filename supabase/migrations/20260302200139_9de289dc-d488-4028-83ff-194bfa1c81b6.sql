CREATE OR REPLACE FUNCTION public.fetch_modules_without_changelog(p_limit integer DEFAULT 1000)
RETURNS TABLE(id uuid, title text, version text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT vm.id, vm.title, vm.version, vm.created_at
  FROM vault_modules vm
  LEFT JOIN vault_module_changelog vmc ON vmc.module_id = vm.id
  WHERE vm.visibility = 'global' AND vmc.id IS NULL
  LIMIT p_limit;
END;
$$;