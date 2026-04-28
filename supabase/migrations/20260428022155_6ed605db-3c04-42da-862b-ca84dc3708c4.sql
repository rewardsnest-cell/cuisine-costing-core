
-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =========================================================
-- Internal key storage (private schema, no API access)
-- =========================================================
CREATE SCHEMA IF NOT EXISTS vault_internal;
REVOKE ALL ON SCHEMA vault_internal FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS vault_internal.master_key (
  id INT PRIMARY KEY DEFAULT 1,
  key BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = 1)
);
REVOKE ALL ON vault_internal.master_key FROM PUBLIC, anon, authenticated;

-- Initialize key once (32 random bytes)
INSERT INTO vault_internal.master_key (id, key)
VALUES (1, extensions.gen_random_bytes(32))
ON CONFLICT (id) DO NOTHING;

-- Internal helper to fetch the key (SECURITY DEFINER, never exposed)
CREATE OR REPLACE FUNCTION vault_internal.get_master_key()
RETURNS BYTEA
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vault_internal
AS $$
  SELECT key FROM vault_internal.master_key WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION vault_internal.get_master_key() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- Credentials Vault table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.credentials_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  username TEXT,
  url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  secret_ciphertext BYTEA NOT NULL,
  secret_preview TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credentials_vault ENABLE ROW LEVEL SECURITY;

-- Admins can read metadata (we'll exclude ciphertext via column grants)
CREATE POLICY "Admins can read vault metadata"
  ON public.credentials_vault
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert vault entries"
  ON public.credentials_vault
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vault entries"
  ON public.credentials_vault
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vault entries"
  ON public.credentials_vault
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Revoke direct access to ciphertext column from API roles
REVOKE SELECT (secret_ciphertext) ON public.credentials_vault FROM anon, authenticated;
REVOKE UPDATE (secret_ciphertext) ON public.credentials_vault FROM anon, authenticated;
REVOKE INSERT (secret_ciphertext) ON public.credentials_vault FROM anon, authenticated;

-- updated_at trigger
CREATE TRIGGER update_credentials_vault_updated_at
BEFORE UPDATE ON public.credentials_vault
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Audit log
-- =========================================================
CREATE TABLE IF NOT EXISTS public.credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES public.credentials_vault(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','rotate','reveal','revoke','delete')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credential_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.credential_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No insert/update/delete policies => all writes go through SECURITY DEFINER fns

CREATE INDEX IF NOT EXISTS idx_credential_audit_log_credential
  ON public.credential_audit_log(credential_id, created_at DESC);

-- =========================================================
-- Secure RPC functions
-- =========================================================

-- Create a credential (encrypts secret server-side)
CREATE OR REPLACE FUNCTION public.create_credential(
  _label TEXT,
  _category TEXT,
  _username TEXT,
  _url TEXT,
  _notes TEXT,
  _secret TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault_internal
AS $$
DECLARE
  _new_id UUID;
  _preview TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _secret IS NULL OR length(_secret) = 0 THEN
    RAISE EXCEPTION 'Secret cannot be empty';
  END IF;

  _preview := '••••' || right(_secret, LEAST(4, length(_secret)));

  INSERT INTO public.credentials_vault (
    label, category, username, url, notes,
    secret_ciphertext, secret_preview, created_by, updated_by
  ) VALUES (
    _label,
    COALESCE(NULLIF(_category, ''), 'general'),
    _username, _url, _notes,
    extensions.pgp_sym_encrypt(_secret, encode(vault_internal.get_master_key(), 'hex')),
    _preview,
    auth.uid(), auth.uid()
  )
  RETURNING id INTO _new_id;

  INSERT INTO public.credential_audit_log (credential_id, action, actor_id, actor_email)
  VALUES (_new_id, 'create', auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()));

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_credential(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credential(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- Update credential metadata (no secret change here)
CREATE OR REPLACE FUNCTION public.update_credential_metadata(
  _id UUID,
  _label TEXT,
  _category TEXT,
  _username TEXT,
  _url TEXT,
  _notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  UPDATE public.credentials_vault
  SET label = _label,
      category = COALESCE(NULLIF(_category, ''), 'general'),
      username = _username,
      url = _url,
      notes = _notes,
      updated_by = auth.uid()
  WHERE id = _id;

  INSERT INTO public.credential_audit_log (credential_id, action, actor_id, actor_email)
  VALUES (_id, 'update', auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.update_credential_metadata(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_credential_metadata(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- Rotate the secret
CREATE OR REPLACE FUNCTION public.rotate_credential_secret(
  _id UUID,
  _new_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault_internal
AS $$
DECLARE
  _preview TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _new_secret IS NULL OR length(_new_secret) = 0 THEN
    RAISE EXCEPTION 'Secret cannot be empty';
  END IF;

  _preview := '••••' || right(_new_secret, LEAST(4, length(_new_secret)));

  UPDATE public.credentials_vault
  SET secret_ciphertext = extensions.pgp_sym_encrypt(_new_secret, encode(vault_internal.get_master_key(), 'hex')),
      secret_preview = _preview,
      rotated_at = now(),
      updated_by = auth.uid()
  WHERE id = _id;

  INSERT INTO public.credential_audit_log (credential_id, action, actor_id, actor_email)
  VALUES (_id, 'rotate', auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_credential_secret(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_credential_secret(UUID,TEXT) TO authenticated;

-- Revoke (mark inactive)
CREATE OR REPLACE FUNCTION public.revoke_credential(_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  UPDATE public.credentials_vault
  SET status = 'revoked', updated_by = auth.uid()
  WHERE id = _id;

  INSERT INTO public.credential_audit_log (credential_id, action, actor_id, actor_email)
  VALUES (_id, 'revoke', auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_credential(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_credential(UUID) TO authenticated;

-- Reveal secret (decrypt) — requires admin; logs the reveal
CREATE OR REPLACE FUNCTION public.reveal_credential(_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault_internal
AS $$
DECLARE
  _plaintext TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT extensions.pgp_sym_decrypt(secret_ciphertext, encode(vault_internal.get_master_key(), 'hex'))
    INTO _plaintext
  FROM public.credentials_vault
  WHERE id = _id;

  IF _plaintext IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  INSERT INTO public.credential_audit_log (credential_id, action, actor_id, actor_email, metadata)
  VALUES (_id, 'reveal', auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    jsonb_build_object('revealed_at', now()));

  RETURN _plaintext;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_credential(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_credential(UUID) TO authenticated;
