-- Table to store version snapshots of vault modules
CREATE TABLE public.vault_module_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES vault_modules(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  code TEXT NOT NULL,
  context_markdown TEXT,
  code_example TEXT,
  database_schema TEXT,
  test_code TEXT,
  ai_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  common_errors JSONB DEFAULT '[]'::jsonb,
  solves_problems TEXT[] DEFAULT '{}'::text[],
  change_summary TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by module
CREATE INDEX idx_vault_module_versions_module_id ON vault_module_versions(module_id);

-- RLS
ALTER TABLE vault_module_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on vault_module_versions"
  ON vault_module_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view versions of accessible modules"
  ON vault_module_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vault_modules vm
    WHERE vm.id = vault_module_versions.module_id
      AND (vm.user_id = auth.uid() OR vm.visibility = 'global'
        OR (vm.visibility = 'shared' AND EXISTS (
          SELECT 1 FROM vault_module_shares vms
          WHERE vms.module_id = vm.id AND vms.shared_with_user_id = auth.uid()
        )))
  ));

-- Trigger to auto-snapshot on update
CREATE OR REPLACE FUNCTION public.snapshot_vault_module_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Only snapshot if code or context_markdown actually changed
  IF OLD.code IS DISTINCT FROM NEW.code
     OR OLD.context_markdown IS DISTINCT FROM NEW.context_markdown
     OR OLD.code_example IS DISTINCT FROM NEW.code_example
     OR OLD.test_code IS DISTINCT FROM NEW.test_code
  THEN
    INSERT INTO vault_module_versions (
      module_id, version, code, context_markdown, code_example,
      database_schema, test_code, ai_metadata, common_errors,
      solves_problems, created_by
    ) VALUES (
      OLD.id, COALESCE(OLD.version, 'v1'), OLD.code, OLD.context_markdown,
      OLD.code_example, OLD.database_schema, OLD.test_code, OLD.ai_metadata,
      OLD.common_errors, OLD.solves_problems, NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_vault_module_version
  BEFORE UPDATE ON vault_modules
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_vault_module_version();