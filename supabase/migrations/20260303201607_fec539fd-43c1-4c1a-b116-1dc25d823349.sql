
-- ═══════════════════════════════════════════════════════════════════════════
-- vault_mandatory_rules — Mandatory module enforcement system
-- ═══════════════════════════════════════════════════════════════════════════

-- Enforcement level enum
CREATE TYPE public.mandatory_enforcement AS ENUM ('hard', 'soft');

-- Scope: where the rule applies
CREATE TYPE public.mandatory_scope AS ENUM ('global', 'domain', 'project_type');

-- Main table
CREATE TABLE public.vault_mandatory_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.vault_modules(id) ON DELETE CASCADE,
  enforcement mandatory_enforcement NOT NULL DEFAULT 'soft',
  scope mandatory_scope NOT NULL DEFAULT 'global',
  scope_value TEXT DEFAULT NULL,
  layer INTEGER NOT NULL DEFAULT 1,
  layer_name TEXT NOT NULL DEFAULT 'infrastructure',
  reason TEXT NOT NULL,
  is_conditional BOOLEAN NOT NULL DEFAULT false,
  condition_description TEXT DEFAULT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(module_id)
);

-- RLS
ALTER TABLE public.vault_mandatory_rules ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on vault_mandatory_rules"
  ON public.vault_mandatory_rules FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can read (agents need this via service role, but UI admins can also see)
CREATE POLICY "Authenticated users can read mandatory rules"
  ON public.vault_mandatory_rules FOR SELECT
  TO authenticated
  USING (true);

-- Only admin/owner can manage
CREATE POLICY "Admin can manage mandatory rules"
  ON public.vault_mandatory_rules FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_vault_mandatory_rules_updated_at
  BEFORE UPDATE ON public.vault_mandatory_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- DB function: get_mandatory_modules — returns mandatory rules with module info
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_mandatory_modules(
  p_scope TEXT DEFAULT 'global',
  p_scope_value TEXT DEFAULT NULL,
  p_layer INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_rules', (
      SELECT COUNT(*) FROM vault_mandatory_rules WHERE enabled = true
    ),
    'rules', COALESCE((
      SELECT json_agg(r ORDER BY r.layer, r.enforcement DESC)
      FROM (
        SELECT
          vmr.id AS rule_id,
          vmr.enforcement::TEXT,
          vmr.scope::TEXT,
          vmr.scope_value,
          vmr.layer,
          vmr.layer_name,
          vmr.reason,
          vmr.is_conditional,
          vmr.condition_description,
          vm.id AS module_id,
          vm.slug,
          vm.title,
          vm.domain::TEXT AS domain,
          vm.module_type::TEXT AS module_type,
          vm.why_it_matters,
          vm.tags
        FROM vault_mandatory_rules vmr
        JOIN vault_modules vm ON vm.id = vmr.module_id
        WHERE vmr.enabled = true
          AND (
            vmr.scope::TEXT = 'global'
            OR (vmr.scope::TEXT = p_scope AND (p_scope_value IS NULL OR vmr.scope_value = p_scope_value))
          )
          AND (p_layer IS NULL OR vmr.layer = p_layer)
      ) r
    ), '[]'::json),
    'layers_summary', COALESCE((
      SELECT json_agg(ls ORDER BY ls.layer)
      FROM (
        SELECT
          vmr.layer,
          vmr.layer_name,
          COUNT(*) AS module_count,
          COUNT(*) FILTER (WHERE vmr.enforcement::TEXT = 'hard') AS hard_count,
          COUNT(*) FILTER (WHERE vmr.enforcement::TEXT = 'soft') AS soft_count
        FROM vault_mandatory_rules vmr
        WHERE vmr.enabled = true
        GROUP BY vmr.layer, vmr.layer_name
      ) ls
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: Camada 1 — Edge Function Infrastructure (hard enforcement)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vault_mandatory_rules (module_id, enforcement, scope, layer, layer_name, reason) VALUES
  ('96b81bbf-bdfd-4b1d-8115-bf3a982319c2', 'hard', 'global', 1, 'edge_infrastructure', 'Centralized logging is the foundation for observability. Without it, debugging in production is impossible.'),
  ('245a6ff9-ad1f-4b3b-b09a-e5923316008b', 'hard', 'global', 1, 'edge_infrastructure', 'Structured logging with LOG_LEVEL control is required for production-grade observability.'),
  ('29dc1a41-5dc4-4f73-90fd-bf75a9c4494b', 'hard', 'global', 1, 'edge_infrastructure', 'Dynamic CORS validation prevents unauthorized cross-origin access. Security baseline.'),
  ('9f5a11ca-fab3-44a6-b93c-4b26c5eb8f98', 'hard', 'global', 1, 'edge_infrastructure', 'Input sanitization prevents XSS and injection attacks. Non-negotiable security layer.'),
  ('4af498f0-2afe-4095-802e-089674112ea9', 'hard', 'global', 1, 'edge_infrastructure', 'Rate limiting prevents abuse and DDoS. Required for any public-facing endpoint.'),
  ('3deeea21-dd5d-4217-9763-99251c8db908', 'hard', 'global', 1, 'edge_infrastructure', 'Database migration for rate limiting table. Prerequisite for rate-limit-guard.'),
  ('36609909-332b-46cf-a8b2-4e24c03d9aaa', 'hard', 'global', 1, 'edge_infrastructure', 'The aggregator pipeline that enforces Sentry + CORS + Rate Limiting on every Edge Function. This is THE pattern.');
