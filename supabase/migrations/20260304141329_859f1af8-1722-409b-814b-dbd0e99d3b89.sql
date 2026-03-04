UPDATE vault_modules SET
  database_schema = E'-- Este módulo usa supabase.rpc("vault_get_secret") para ler o secret VAPID_PUBLIC_KEY.\n-- A RPC vault_get_secret é parte da extensão Supabase Vault (schema vault).\n-- Não acessa tabelas do schema public diretamente.\n--\n-- Pré-requisito: secret "VAPID_PUBLIC_KEY" deve existir no Supabase Vault:\n-- SELECT vault.create_secret(''<vapid-public-key>'', ''VAPID_PUBLIC_KEY'', ''VAPID public key for Web Push notifications'');'
WHERE id = 'ea24a01a-c751-44d6-a3c4-bc452e8bd5a8';
