
-- =============================================================================
-- Phase 1: Create vault_playbooks, vault_playbook_modules, vault_agent_tasks
-- =============================================================================

-- ─── 1. vault_playbooks ─────────────────────────────────────────────────────

CREATE TABLE public.vault_playbooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  title       TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  domain      public.vault_domain,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  difficulty  TEXT DEFAULT 'intermediate',
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status validation trigger (not CHECK, per guidelines)
CREATE OR REPLACE FUNCTION public.validate_playbook_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid playbook status: %. Must be draft or published.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_playbook_status
  BEFORE INSERT OR UPDATE ON public.vault_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.validate_playbook_status();

-- Auto-update updated_at
CREATE TRIGGER trg_vault_playbooks_updated_at
  BEFORE UPDATE ON public.vault_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.vault_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on vault_playbooks"
  ON public.vault_playbooks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can select own playbooks"
  ON public.vault_playbooks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can select published playbooks"
  ON public.vault_playbooks FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Users can insert own playbooks"
  ON public.vault_playbooks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own playbooks"
  ON public.vault_playbooks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own playbooks"
  ON public.vault_playbooks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ─── 2. vault_playbook_modules (junction) ───────────────────────────────────

CREATE TABLE public.vault_playbook_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES public.vault_playbooks(id) ON DELETE CASCADE,
  module_id   UUID NOT NULL REFERENCES public.vault_modules(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(playbook_id, module_id)
);

-- Index for fast lookups by playbook
CREATE INDEX idx_playbook_modules_playbook_id ON public.vault_playbook_modules(playbook_id);
CREATE INDEX idx_playbook_modules_module_id ON public.vault_playbook_modules(module_id);

-- RLS
ALTER TABLE public.vault_playbook_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on vault_playbook_modules"
  ON public.vault_playbook_modules FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can select modules of own playbooks"
  ON public.vault_playbook_modules FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vault_playbooks vp
    WHERE vp.id = vault_playbook_modules.playbook_id
      AND vp.user_id = auth.uid()
  ));

CREATE POLICY "Users can select modules of published playbooks"
  ON public.vault_playbook_modules FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vault_playbooks vp
    WHERE vp.id = vault_playbook_modules.playbook_id
      AND vp.status = 'published'
  ));

CREATE POLICY "Users can insert modules into own playbooks"
  ON public.vault_playbook_modules FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vault_playbooks vp
    WHERE vp.id = vault_playbook_modules.playbook_id
      AND vp.user_id = auth.uid()
  ));

CREATE POLICY "Users can update modules in own playbooks"
  ON public.vault_playbook_modules FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vault_playbooks vp
    WHERE vp.id = vault_playbook_modules.playbook_id
      AND vp.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vault_playbooks vp
    WHERE vp.id = vault_playbook_modules.playbook_id
      AND vp.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete modules from own playbooks"
  ON public.vault_playbook_modules FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vault_playbooks vp
    WHERE vp.id = vault_playbook_modules.playbook_id
      AND vp.user_id = auth.uid()
  ));

-- ─── 3. vault_agent_tasks ───────────────────────────────────────────────────

CREATE TABLE public.vault_agent_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  api_key_id     UUID,
  objective      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  modules_used   UUID[] NOT NULL DEFAULT '{}',
  context        JSONB NOT NULL DEFAULT '{}',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  duration_ms    INTEGER,
  outcome_notes  TEXT
);

-- Status validation trigger
CREATE OR REPLACE FUNCTION public.validate_agent_task_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'success', 'failure', 'abandoned') THEN
    RAISE EXCEPTION 'Invalid task status: %. Must be active, success, failure, or abandoned.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_agent_task_status
  BEFORE INSERT OR UPDATE ON public.vault_agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_agent_task_status();

-- Indexes
CREATE INDEX idx_agent_tasks_user_id ON public.vault_agent_tasks(user_id);
CREATE INDEX idx_agent_tasks_status ON public.vault_agent_tasks(status);
CREATE INDEX idx_agent_tasks_started_at ON public.vault_agent_tasks(started_at DESC);

-- RLS
ALTER TABLE public.vault_agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on vault_agent_tasks"
  ON public.vault_agent_tasks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can select own tasks"
  ON public.vault_agent_tasks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin can view all tasks"
  ON public.vault_agent_tasks FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
