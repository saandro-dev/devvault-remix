-- Update session-commander related modules to consistent module_group
-- RefreshCoordinator
UPDATE vault_modules SET module_group = 'session-commander', implementation_order = 1,
  related_modules = array_cat(COALESCE(related_modules, '{}'), ARRAY['987a4b58-fcc1-4980-8ce3-d0aa841ef971']::uuid[])
WHERE id = 'aab502c7-22a2-4d44-8b96-2d01cf5e8a67' AND NOT ('987a4b58-fcc1-4980-8ce3-d0aa841ef971' = ANY(COALESCE(related_modules, '{}')));

-- SessionMonitor
UPDATE vault_modules SET module_group = 'session-commander', implementation_order = 2,
  related_modules = array_cat(COALESCE(related_modules, '{}'), ARRAY['987a4b58-fcc1-4980-8ce3-d0aa841ef971']::uuid[])
WHERE id = '4c02c917-bc31-4040-9350-963ea9d73f45' AND NOT ('987a4b58-fcc1-4980-8ce3-d0aa841ef971' = ANY(COALESCE(related_modules, '{}')));

-- RetryStrategy (exponential-backoff-jitter in retry group)
UPDATE vault_modules SET module_group = 'session-commander', implementation_order = 3,
  related_modules = array_cat(COALESCE(related_modules, '{}'), ARRAY['987a4b58-fcc1-4980-8ce3-d0aa841ef971']::uuid[])
WHERE id = '19f2c74a-4612-471c-b26d-4ec2bd329628' AND NOT ('987a4b58-fcc1-4980-8ce3-d0aa841ef971' = ANY(COALESCE(related_modules, '{}')));

-- Update token-manager related modules
-- Token Lifecycle FSM
UPDATE vault_modules SET module_group = 'token-manager', implementation_order = 1,
  related_modules = array_cat(COALESCE(related_modules, '{}'), ARRAY['2d0a91e8-62e7-4c99-b8d4-e8b9dcef2566']::uuid[])
WHERE id = '0d687429-0f6c-4c74-a46f-26b3f36fa1dd' AND NOT ('2d0a91e8-62e7-4c99-b8d4-e8b9dcef2566' = ANY(COALESCE(related_modules, '{}')));

-- CrossTabLock
UPDATE vault_modules SET module_group = 'token-manager', implementation_order = 2,
  related_modules = array_cat(COALESCE(related_modules, '{}'), ARRAY['2d0a91e8-62e7-4c99-b8d4-e8b9dcef2566']::uuid[])
WHERE id = 'be66ea5d-fc3b-4a3c-86fe-bf889719de65' AND NOT ('2d0a91e8-62e7-4c99-b8d4-e8b9dcef2566' = ANY(COALESCE(related_modules, '{}')));

-- Also cross-link the two architecture guides to each other
UPDATE vault_modules SET related_modules = array_cat(related_modules, ARRAY['2d0a91e8-62e7-4c99-b8d4-e8b9dcef2566']::uuid[])
WHERE id = '987a4b58-fcc1-4980-8ce3-d0aa841ef971';

UPDATE vault_modules SET related_modules = array_cat(related_modules, ARRAY['987a4b58-fcc1-4980-8ce3-d0aa841ef971']::uuid[])
WHERE id = '2d0a91e8-62e7-4c99-b8d4-e8b9dcef2566';