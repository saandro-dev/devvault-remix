
-- ============================================================================
-- Phase 6: SQL-native diagnose matching + domain inference + completeness fix
-- ============================================================================

-- ── 1. match_common_errors ──────────────────────────────────────────────────
-- Replaces JS matchCommonErrors: scans ALL modules with common_errors JSONB,
-- matches error text via ILIKE. Zero arbitrary limits.

CREATE OR REPLACE FUNCTION public.match_common_errors(
  p_error_text TEXT,
  p_domain TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  id UUID,
  slug TEXT,
  title TEXT,
  domain TEXT,
  matched_error TEXT,
  quick_fix TEXT,
  error_cause TEXT,
  difficulty TEXT,
  estimated_minutes INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_error_lower TEXT;
BEGIN
  v_error_lower := lower(p_error_text);

  RETURN QUERY
  SELECT DISTINCT ON (vm.id)
    vm.id,
    vm.slug,
    vm.title,
    vm.domain::TEXT,
    (entry->>'error')::TEXT AS matched_error,
    (entry->>'fix')::TEXT AS quick_fix,
    (entry->>'cause')::TEXT AS error_cause,
    vm.difficulty,
    vm.estimated_minutes
  FROM vault_modules vm
  CROSS JOIN LATERAL jsonb_array_elements(vm.common_errors) AS entry
  WHERE vm.visibility = 'global'
    AND vm.validation_status IN ('validated', 'draft')
    AND vm.common_errors IS NOT NULL
    AND jsonb_typeof(vm.common_errors) = 'array'
    AND jsonb_array_length(vm.common_errors) > 0
    AND (p_domain IS NULL OR vm.domain::TEXT = p_domain)
    AND (
      lower(entry->>'error') ILIKE '%' || v_error_lower || '%'
      OR v_error_lower ILIKE '%' || lower(entry->>'error') || '%'
    )
  ORDER BY vm.id, vm.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- ── 2. match_solves_problems ────────────────────────────────────────────────
-- Replaces JS matchSolvesProblems: exact substring + tokenized partial match.

CREATE OR REPLACE FUNCTION public.match_solves_problems(
  p_error_text TEXT,
  p_tokens TEXT[] DEFAULT '{}',
  p_domain TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  id UUID,
  slug TEXT,
  title TEXT,
  domain TEXT,
  matched_problem TEXT,
  match_quality TEXT,
  difficulty TEXT,
  estimated_minutes INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_error_lower TEXT;
BEGIN
  v_error_lower := lower(p_error_text);

  -- First: exact substring matches (high quality)
  RETURN QUERY
  SELECT DISTINCT ON (vm.id)
    vm.id,
    vm.slug,
    vm.title,
    vm.domain::TEXT,
    problem::TEXT AS matched_problem,
    'exact'::TEXT AS match_quality,
    vm.difficulty,
    vm.estimated_minutes
  FROM vault_modules vm
  CROSS JOIN LATERAL unnest(vm.solves_problems) AS problem
  WHERE vm.visibility = 'global'
    AND vm.validation_status IN ('validated', 'draft')
    AND vm.solves_problems IS NOT NULL
    AND array_length(vm.solves_problems, 1) > 0
    AND (p_domain IS NULL OR vm.domain::TEXT = p_domain)
    AND (
      lower(problem) ILIKE '%' || v_error_lower || '%'
      OR v_error_lower ILIKE '%' || lower(problem) || '%'
    )
  ORDER BY vm.id, vm.updated_at DESC
  LIMIT p_limit;

  -- If we got enough exact matches, stop
  IF FOUND THEN
    RETURN;
  END IF;

  -- Second: tokenized partial match (2+ tokens overlap)
  IF array_length(p_tokens, 1) >= 2 THEN
    RETURN QUERY
    SELECT DISTINCT ON (vm.id)
      vm.id,
      vm.slug,
      vm.title,
      vm.domain::TEXT,
      problem::TEXT AS matched_problem,
      'partial'::TEXT AS match_quality,
      vm.difficulty,
      vm.estimated_minutes
    FROM vault_modules vm
    CROSS JOIN LATERAL unnest(vm.solves_problems) AS problem
    WHERE vm.visibility = 'global'
      AND vm.validation_status IN ('validated', 'draft')
      AND vm.solves_problems IS NOT NULL
      AND array_length(vm.solves_problems, 1) > 0
      AND (p_domain IS NULL OR vm.domain::TEXT = p_domain)
      AND (
        SELECT count(*)
        FROM unnest(p_tokens) AS tok
        WHERE lower(problem) ILIKE '%' || tok || '%'
      ) >= 2
    ORDER BY vm.id, vm.updated_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- ── 3. domain_inference_keywords table + seed ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.domain_inference_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  priority INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.domain_inference_keywords ENABLE ROW LEVEL SECURITY;

-- Service role only — this is an internal lookup table
CREATE POLICY "Service role full access on domain_inference_keywords"
  ON public.domain_inference_keywords
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed ~50 keywords
INSERT INTO public.domain_inference_keywords (keyword, domain, priority) VALUES
  -- security (priority 2 = boosted for overlap with backend)
  ('rls', 'security', 2),
  ('row level security', 'security', 2),
  ('policy', 'security', 1),
  ('security definer', 'security', 2),
  ('service_role', 'security', 2),
  ('jwt', 'security', 1),
  ('auth', 'security', 1),
  ('permission', 'security', 1),
  ('rbac', 'security', 2),
  ('csrf', 'security', 2),
  ('xss', 'security', 2),
  ('sanitize', 'security', 1),
  ('injection', 'security', 2),
  -- backend
  ('edge function', 'backend', 2),
  ('supabase', 'backend', 1),
  ('database', 'backend', 1),
  ('migration', 'backend', 1),
  ('trigger', 'backend', 1),
  ('postgres', 'backend', 2),
  ('sql', 'backend', 1),
  ('insert', 'backend', 1),
  ('foreign key', 'backend', 2),
  ('rpc', 'backend', 2),
  ('webhook', 'backend', 1),
  ('api', 'backend', 1),
  ('cors', 'backend', 2),
  ('deno', 'backend', 2),
  ('cron', 'backend', 1),
  ('queue', 'backend', 1),
  -- frontend
  ('react', 'frontend', 2),
  ('component', 'frontend', 1),
  ('hook', 'frontend', 1),
  ('usestate', 'frontend', 2),
  ('useeffect', 'frontend', 2),
  ('tailwind', 'frontend', 2),
  ('css', 'frontend', 1),
  ('render', 'frontend', 1),
  ('jsx', 'frontend', 2),
  ('tsx', 'frontend', 2),
  ('router', 'frontend', 1),
  ('navigation', 'frontend', 1),
  ('responsive', 'frontend', 1),
  -- architecture
  ('clean architecture', 'architecture', 2),
  ('solid', 'architecture', 1),
  ('dependency injection', 'architecture', 2),
  ('repository pattern', 'architecture', 2),
  ('use case', 'architecture', 1),
  ('domain layer', 'architecture', 2),
  -- devops
  ('docker', 'devops', 2),
  ('ci/cd', 'devops', 2),
  ('deploy', 'devops', 1),
  ('pipeline', 'devops', 2),
  ('github actions', 'devops', 2),
  ('vercel', 'devops', 2),
  ('nginx', 'devops', 2),
  ('ssl', 'devops', 1)
ON CONFLICT (keyword) DO NOTHING;

-- ── 4. infer_domain_from_text ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.infer_domain_from_text(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_text_lower TEXT;
  v_result TEXT;
BEGIN
  v_text_lower := lower(p_text);

  SELECT dik.domain INTO v_result
  FROM domain_inference_keywords dik
  WHERE v_text_lower ILIKE '%' || dik.keyword || '%'
  GROUP BY dik.domain
  ORDER BY SUM(dik.priority) DESC
  LIMIT 1;

  RETURN v_result; -- NULL if no matches = no filter
END;
$$;

-- ── 5. Updated vault_module_completeness (domain-aware database_schema) ─────

CREATE OR REPLACE FUNCTION public.vault_module_completeness(p_id uuid)
RETURNS TABLE(score integer, missing_fields text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mod RECORD; v_missing TEXT[] := '{}';
  v_total INT; v_filled INT := 0;
  v_has_deps BOOLEAN; v_is_grouped BOOLEAN; v_is_root BOOLEAN;
  v_needs_db_schema BOOLEAN;
BEGIN
  SELECT * INTO v_mod FROM vault_modules WHERE vault_modules.id = p_id;
  IF NOT FOUND THEN
    score := 0; missing_fields := ARRAY['module_not_found'];
    RETURN NEXT; RETURN;
  END IF;

  v_is_grouped := (v_mod.module_group IS NOT NULL AND trim(v_mod.module_group) != '');
  v_is_root := v_is_grouped AND (v_mod.implementation_order IS NOT NULL AND v_mod.implementation_order = 1);

  -- database_schema only relevant for backend, architecture, security
  v_needs_db_schema := (v_mod.domain::TEXT IN ('backend', 'architecture', 'security'));

  -- Base fields: 12 (or 13 if grouped non-root)
  IF v_is_grouped AND NOT v_is_root THEN v_total := 13; ELSE v_total := 12; END IF;

  -- Bonus fields: common_errors, test_code, solves_problems always count (3)
  -- database_schema only counts if domain needs it (+1 conditionally)
  IF NOT v_needs_db_schema THEN
    -- Don't add database_schema to total at all for frontend/devops/saas_playbook
    NULL; -- v_total stays as-is (bonus fields added below)
  END IF;

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

  -- Bonus fields (3 always + 1 conditional)
  IF v_mod.common_errors IS NOT NULL AND v_mod.common_errors::text != '[]' AND v_mod.common_errors::text != 'null' THEN
    v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'common_errors'); END IF;

  IF v_mod.test_code IS NOT NULL AND trim(v_mod.test_code) != '' THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'test_code'); END IF;

  IF v_mod.solves_problems IS NOT NULL AND array_length(v_mod.solves_problems, 1) > 0 THEN v_filled := v_filled + 1;
  ELSE v_missing := array_append(v_missing, 'solves_problems'); END IF;

  -- database_schema: only count for backend/architecture/security
  IF v_needs_db_schema THEN
    IF v_mod.database_schema IS NOT NULL AND trim(v_mod.database_schema) != '' THEN v_filled := v_filled + 1;
    ELSE v_missing := array_append(v_missing, 'database_schema'); END IF;
  END IF;

  score := (v_filled * 100) / v_total;
  missing_fields := v_missing;
  RETURN NEXT;
END;
$$;
