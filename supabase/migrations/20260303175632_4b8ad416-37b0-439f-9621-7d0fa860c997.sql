
CREATE OR REPLACE FUNCTION public.find_similar_modules(
  p_module_id uuid,
  p_limit integer DEFAULT 5,
  p_threshold double precision DEFAULT 0.5
)
RETURNS TABLE(
  id uuid,
  slug text,
  title text,
  description text,
  domain text,
  module_type text,
  tags text[],
  similarity_score double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_embedding extensions.vector;
BEGIN
  -- Get the source module's embedding
  SELECT vm.embedding INTO v_embedding
  FROM vault_modules vm
  WHERE vm.id = p_module_id;

  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    vm.id,
    vm.slug,
    vm.title,
    vm.description,
    vm.domain::TEXT,
    vm.module_type::TEXT,
    vm.tags,
    (1.0 - (vm.embedding <=> v_embedding))::DOUBLE PRECISION AS similarity_score
  FROM vault_modules vm
  WHERE vm.id != p_module_id
    AND vm.visibility = 'global'
    AND vm.validation_status IN ('validated', 'draft')
    AND vm.embedding IS NOT NULL
    AND (1.0 - (vm.embedding <=> v_embedding)) >= p_threshold
  ORDER BY vm.embedding <=> v_embedding ASC
  LIMIT p_limit;
END;
$$;
