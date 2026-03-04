
-- Phase 2: Duplicate Detection Infrastructure

-- 1. Ensure pg_trgm extension is enabled (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- 2. GIN trigram index on title for fast similarity lookups
CREATE INDEX IF NOT EXISTS idx_vault_modules_title_trgm
  ON vault_modules USING gin (title extensions.gin_trgm_ops);

-- 3. RPC: check_duplicate_modules
-- Returns modules with title similarity > threshold.
-- Used by ingest, vault-crud create, and the dedicated MCP tool.
CREATE OR REPLACE FUNCTION public.check_duplicate_modules(
  p_title TEXT,
  p_threshold DOUBLE PRECISION DEFAULT 0.65,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
  id UUID,
  slug TEXT,
  title TEXT,
  domain TEXT,
  module_type TEXT,
  similarity_score DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vm.id,
    vm.slug,
    vm.title,
    vm.domain::TEXT,
    vm.module_type::TEXT,
    extensions.similarity(lower(vm.title), lower(p_title))::DOUBLE PRECISION AS similarity_score
  FROM vault_modules vm
  WHERE vm.visibility = 'global'
    AND vm.validation_status IN ('validated', 'draft')
    AND extensions.similarity(lower(vm.title), lower(p_title)) >= p_threshold
  ORDER BY similarity_score DESC
  LIMIT p_limit;
END;
$$;
