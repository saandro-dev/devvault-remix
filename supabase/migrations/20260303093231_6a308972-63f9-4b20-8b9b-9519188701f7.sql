
-- ═══ AÇÃO 1: Fechar knowledge gap órfão ═══
UPDATE vault_knowledge_gaps
SET status = 'resolved',
    resolution = 'Fixed in migration: vault_module_completeness function updated to handle database_schema conditionally based on domain (backend/architecture/security only).',
    resolution_code = 'ALTER FUNCTION vault_module_completeness — added conditional check for database_schema based on module domain',
    resolved_at = now()
WHERE id = '67439d8f-77cd-431f-aa02-dda9a30df020';

-- ═══ AÇÃO 2: Enriquecer common_errors com erros literais do PostgreSQL ═══

-- Módulo: rls-automated-security-tester
UPDATE vault_modules
SET common_errors = common_errors || '[
  {"error": "infinite recursion detected in policy for relation", "cause": "RLS policy references the same table it protects via a subquery, creating an infinite loop when PostgreSQL evaluates the policy.", "fix": "Extract the subquery into a SECURITY DEFINER function that bypasses RLS. Example: CREATE FUNCTION has_role(uuid, app_role) RETURNS boolean SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2) $$; Then use has_role(auth.uid(), ''admin'') in the policy."},
  {"error": "new row violates row-level security policy", "cause": "The INSERT or UPDATE policy WITH CHECK expression rejects the row. Common causes: user_id not matching auth.uid(), missing WITH CHECK clause, or RESTRICTIVE policy blocking.", "fix": "Check the WITH CHECK expression of INSERT/UPDATE policies. Ensure user_id = auth.uid() is set. Run: SELECT polname, polcmd, pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polrelid = ''table_name''::regclass;"},
  {"error": "permission denied for table", "cause": "RLS is enabled but no policy grants access for this operation (SELECT/INSERT/UPDATE/DELETE), or all policies evaluate to false.", "fix": "Create a permissive policy for the missing operation. Verify with: SELECT polname, polcmd FROM pg_policy WHERE polrelid = ''table_name''::regclass; If empty, create: CREATE POLICY ''allow_select'' ON table FOR SELECT USING (auth.uid() = user_id);"}
]'::jsonb
WHERE slug = 'rls-automated-security-tester' AND visibility = 'global';

-- Módulo: migration-fix-restrictive-rls-policy
UPDATE vault_modules
SET common_errors = common_errors || '[
  {"error": "infinite recursion detected in policy for relation", "cause": "A USING or WITH CHECK expression in the policy does a SELECT on the same table, triggering the policy recursively.", "fix": "Move the lookup to a SECURITY DEFINER function. Example: CREATE FUNCTION get_user_role(uuid) RETURNS text SECURITY DEFINER AS $$ SELECT role FROM user_roles WHERE user_id = $1 $$ LANGUAGE sql; Use this function in the policy instead of a direct subquery."},
  {"error": "policy exists for table but query returns zero rows", "cause": "A RESTRICTIVE policy (AS RESTRICTIVE) is active alongside permissive policies. RESTRICTIVE policies must ALL pass, effectively AND-ing with permissive ones.", "fix": "Identify restrictive policies: SELECT polname, polpermissive FROM pg_policy WHERE polrelid = ''table_name''::regclass; Drop the restrictive policy if it acts as a blanket deny: DROP POLICY deny_all ON table_name;"}
]'::jsonb
WHERE slug = 'migration-fix-restrictive-rls-policy-drop-deny-all-by-default-pattern-rls-debugging' AND visibility = 'global';

-- Módulo: unified-auth-httpcookie-sessions-table
UPDATE vault_modules
SET common_errors = common_errors || '[
  {"error": "JWT expired", "cause": "The access token JWT has exceeded its exp claim. Supabase default expiry is 3600 seconds (1 hour).", "fix": "Implement token refresh: call supabase.auth.refreshSession() before the token expires, or use onAuthStateChange to auto-refresh. For custom sessions, validate expiry server-side and issue a new token."},
  {"error": "invalid claim: missing sub", "cause": "The JWT payload does not contain the ''sub'' (subject) claim, which Supabase uses as the user ID. This happens with malformed or manually-crafted tokens.", "fix": "Ensure the JWT is generated with the sub claim set to the user UUID. If using custom JWT signing, include: { sub: user.id, role: ''authenticated'', exp: ... }. Verify with: SELECT auth.uid(); — returns NULL if sub is missing."}
]'::jsonb
WHERE slug = 'unified-auth-httpcookie-sessions-table' AND visibility = 'global';

-- Módulo: shared-role-validator
UPDATE vault_modules
SET common_errors = common_errors || '[
  {"error": "role check failed: insufficient permissions", "cause": "The user has a role lower in the hierarchy than required for the operation. The role hierarchy is: owner > admin > moderator > user.", "fix": "Verify the user role: SELECT get_user_role(auth.uid()); Grant the appropriate role: INSERT INTO user_roles (user_id, role) VALUES (''user-uuid'', ''admin'') ON CONFLICT (user_id, role) DO NOTHING;"},
  {"error": "function get_user_role returned null", "cause": "The user has no entry in the user_roles table. This happens when the handle_new_user trigger failed or was not set up.", "fix": "Insert the default role: INSERT INTO user_roles (user_id, role) VALUES (''user-uuid'', ''user''); Verify the trigger exists: SELECT tgname FROM pg_trigger WHERE tgrelid = ''auth.users''::regclass AND tgname = ''on_auth_user_created'';"}
]'::jsonb
WHERE slug = 'shared-role-validator-get-user-role-validate-role-require-role-hierarchy-owner-admin-user-seller' AND visibility = 'global';

-- Módulo: supabase-vault-secrets
UPDATE vault_modules
SET common_errors = common_errors || '[
  {"error": "permission denied for schema vault", "cause": "The database role does not have USAGE permission on the vault schema. By default, only postgres and service_role can access vault.", "fix": "Grant access: GRANT USAGE ON SCHEMA vault TO authenticated; For read-only: GRANT SELECT ON vault.decrypted_secrets TO authenticated; WARNING: Only do this if you need client-side vault access, which is rare."},
  {"error": "secret not found in vault.decrypted_secrets", "cause": "The vault_secret_id references a secret that was deleted from vault.secrets, or the secret name does not match.", "fix": "Verify the secret exists: SELECT id, name FROM vault.decrypted_secrets WHERE id = ''secret-uuid''; If missing, recreate: SELECT vault.create_secret(''value'', ''name'', ''description''); Update the referencing table with the new vault_secret_id."}
]'::jsonb
WHERE slug = 'supabase-vault-secrets' AND visibility = 'global';
