-- Cron secrets storage
CREATE TABLE IF NOT EXISTS public.cron_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  secret_hash text,
  secret_preview text,
  generated_at timestamptz,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cron secrets metadata"
  ON public.cron_secrets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert cron secrets"
  ON public.cron_secrets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update cron secrets"
  ON public.cron_secrets FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete cron secrets"
  ON public.cron_secrets FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cron_secrets_updated_at
BEFORE UPDATE ON public.cron_secrets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the canonical CRON_SECRET row (status = Not Configured until generated)
INSERT INTO public.cron_secrets (name)
VALUES ('CRON_SECRET')
ON CONFLICT (name) DO NOTHING;

-- ── Generate / regenerate ──────────────────────────────────────────────
-- Returns the raw secret ONCE. Caller must capture it; it can never be
-- retrieved again because only the SHA-256 hash is stored.
CREATE OR REPLACE FUNCTION public.generate_cron_secret(_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  raw_secret text;
  hash_val text;
  preview text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can generate cron secrets';
  END IF;

  -- 64 hex chars = 32 random bytes
  raw_secret := encode(extensions.gen_random_bytes(32), 'hex');
  hash_val   := encode(extensions.digest(raw_secret, 'sha256'), 'hex');
  preview    := substring(raw_secret from 1 for 8) || '…';

  INSERT INTO public.cron_secrets (name, secret_hash, secret_preview, generated_at, generated_by)
  VALUES (_name, hash_val, preview, now(), auth.uid())
  ON CONFLICT (name) DO UPDATE
    SET secret_hash    = EXCLUDED.secret_hash,
        secret_preview = EXCLUDED.secret_preview,
        generated_at   = EXCLUDED.generated_at,
        generated_by   = EXCLUDED.generated_by,
        updated_at     = now();

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (
    'cron_secret_generated',
    auth.uid(),
    jsonb_build_object('name', _name, 'preview', preview)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'secret', raw_secret,
    'preview', preview,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_cron_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_cron_secret(text) TO authenticated;

-- ── Verify (used by cron routes) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_cron_secret(_name text, _secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  stored_hash text;
  candidate_hash text;
BEGIN
  IF _secret IS NULL OR length(_secret) = 0 THEN
    RETURN false;
  END IF;

  SELECT secret_hash INTO stored_hash
  FROM public.cron_secrets
  WHERE name = _name;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  candidate_hash := encode(extensions.digest(_secret, 'sha256'), 'hex');
  -- Constant-time-ish comparison via fixed-length hex
  RETURN stored_hash = candidate_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text, text) TO authenticated, anon, service_role;

-- ── Status (for admin UI) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cron_secret_status(_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can view cron secret status';
  END IF;

  SELECT name, secret_preview, generated_at, generated_by, secret_hash IS NOT NULL AS configured
  INTO rec
  FROM public.cron_secrets
  WHERE name = _name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('name', _name, 'configured', false);
  END IF;

  RETURN jsonb_build_object(
    'name', rec.name,
    'configured', rec.configured,
    'preview', rec.secret_preview,
    'generated_at', rec.generated_at,
    'generated_by', rec.generated_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_secret_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_secret_status(text) TO authenticated;