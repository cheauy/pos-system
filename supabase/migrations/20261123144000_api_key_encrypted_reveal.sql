-- Adds server-encrypted ciphertext column so Owner/Admin can reveal an active
-- API key on demand via the Eye button without ever storing plaintext keys.
begin;

alter table public.business_api_keys
  add column if not exists key_encrypted text;

notify pgrst, 'reload schema';
commit;
