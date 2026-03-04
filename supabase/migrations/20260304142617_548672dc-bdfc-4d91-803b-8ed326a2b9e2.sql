
-- Phase 1: Deduplication — Redirect dependencies, delete duplicates, cross-reference variants

-- 1. Redirect dependency from deleted c3f8754a to survivor 944f5d63
UPDATE vault_module_dependencies
SET depends_on_id = '944f5d63-ab1b-4333-b4b3-1eb2ce762317'
WHERE depends_on_id = 'c3f8754a-3a8a-40b0-8d33-4bacae038fb1';

-- 2. Delete dependencies OF the modules being deleted (as module_id)
DELETE FROM vault_module_dependencies
WHERE module_id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 3. Delete changelog entries of deleted modules
DELETE FROM vault_module_changelog
WHERE module_id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 4. Delete usage events referencing deleted modules
DELETE FROM vault_usage_events
WHERE module_id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 5. Delete favorites referencing deleted modules
DELETE FROM favorites
WHERE vault_module_id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 6. Delete shared_snippets referencing deleted modules
DELETE FROM shared_snippets
WHERE vault_module_id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 7. Delete vault_module_shares referencing deleted modules
DELETE FROM vault_module_shares
WHERE module_id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 8. Delete the duplicate modules themselves
-- lazyWithRetry: keep 944f5d63, delete 3
-- checkout-heartbeat: keep a644bfe4, delete 2
-- context-switcher: keep a41d508c, delete 1
-- webhook-queue: keep 0f8e4d6a, delete 1
-- multi-key: keep 8075cfbd, delete 1
DELETE FROM vault_modules
WHERE id IN (
  '61c40807-8cd4-413a-9622-ae9568ce0dea',
  '77640bfa-79f5-42ae-b0a1-58d38b72676f',
  'c3f8754a-3a8a-40b0-8d33-4bacae038fb1',
  '2953f8b5-5a8c-4b8b-a034-40e63d019099',
  'aea6d154-e5ac-441a-b0c7-52a60419f941',
  'ce751ad6-39e4-45d0-a4f4-d0868a0fdceb',
  'f76763d7-d9ba-4a86-9287-e25d0de8ba01',
  'd2507ee8-2cbb-43ca-936d-84a32e0f905f'
);

-- 9. Cross-reference variant pairs (add related_modules)
-- Stripe webhook variants
UPDATE vault_modules SET related_modules = array_append(related_modules, 'dfb91dc3-f12e-489f-96db-24d9da99c87c'::uuid) WHERE id = '1d2972a7-c7c2-405c-b599-62a352ae7f0c';
UPDATE vault_modules SET related_modules = array_append(related_modules, '1d2972a7-c7c2-405c-b599-62a352ae7f0c'::uuid) WHERE id = 'dfb91dc3-f12e-489f-96db-24d9da99c87c';

-- Members area variants
UPDATE vault_modules SET related_modules = array_append(related_modules, '35e9191c-d780-4f0e-9aa6-7750153d3d51'::uuid) WHERE id = '9c77645d-6591-4eb0-821b-13ef247071d4';
UPDATE vault_modules SET related_modules = array_append(related_modules, '9c77645d-6591-4eb0-821b-13ef247071d4'::uuid) WHERE id = '35e9191c-d780-4f0e-9aa6-7750153d3d51';

-- PII access control variants
UPDATE vault_modules SET related_modules = array_append(related_modules, 'dfbd849c-472c-4bd7-b63d-020d7c1d1e69'::uuid) WHERE id = '49e5be49-7e38-4c17-95d8-d212779fdf9a';
UPDATE vault_modules SET related_modules = array_append(related_modules, '49e5be49-7e38-4c17-95d8-d212779fdf9a'::uuid) WHERE id = 'dfbd849c-472c-4bd7-b63d-020d7c1d1e69';

-- Reconciliation orchestrator variants
UPDATE vault_modules SET related_modules = array_append(related_modules, '5ec507fe-3900-4149-8de8-8c1b591876cc'::uuid) WHERE id = '5a669af5-882c-4bbf-97f7-6be7759ba0ba';
UPDATE vault_modules SET related_modules = array_append(related_modules, '5a669af5-882c-4bbf-97f7-6be7759ba0ba'::uuid) WHERE id = '5ec507fe-3900-4149-8de8-8c1b591876cc';

-- Marketplace split calculator variants
UPDATE vault_modules SET related_modules = array_append(related_modules, '96384333-7664-494c-af20-27b2ce6c6f74'::uuid) WHERE id = '66215199-7011-4b51-85c4-229513e93ec9';
UPDATE vault_modules SET related_modules = array_append(related_modules, '66215199-7011-4b51-85c4-229513e93ec9'::uuid) WHERE id = '96384333-7664-494c-af20-27b2ce6c6f74';
