-- Sections enum-like text used: 'quotes', 'hosting_events', 'assigned_events', 'recipes', 'receipts', 'profile'

-- 1. Role-level section permissions
CREATE TABLE public.role_section_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  section text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, section)
);
ALTER TABLE public.role_section_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read role permissions"
  ON public.role_section_permissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage role permissions"
  ON public.role_section_permissions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_rsp_updated BEFORE UPDATE ON public.role_section_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults
INSERT INTO public.role_section_permissions (role, section, enabled) VALUES
  ('user','quotes',true),
  ('user','hosting_events',true),
  ('user','profile',true),
  ('user','assigned_events',false),
  ('user','recipes',false),
  ('user','receipts',false),
  ('employee','quotes',true),
  ('employee','hosting_events',true),
  ('employee','profile',true),
  ('employee','assigned_events',true),
  ('employee','recipes',true),
  ('employee','receipts',true),
  ('admin','quotes',true),
  ('admin','hosting_events',true),
  ('admin','profile',true),
  ('admin','assigned_events',true),
  ('admin','recipes',true),
  ('admin','receipts',true);

-- 2. Per-user overrides (NULL enabled = inherit role; true/false = override)
CREATE TABLE public.user_section_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section text NOT NULL,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, section)
);
ALTER TABLE public.user_section_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own overrides"
  ON public.user_section_overrides FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage user overrides"
  ON public.user_section_overrides FOR ALL
  TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_uso_updated BEFORE UPDATE ON public.user_section_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Audit log
CREATE TABLE public.access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL, -- 'role_added','role_removed','permission_changed','override_set','override_cleared','employee_invited','invite_resent','invite_revoked'
  target_user_id uuid,
  target_email text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log"
  ON public.access_audit_log FOR SELECT
  TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE POLICY "Admins insert audit log"
  ON public.access_audit_log FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));

-- 4. Pending invites tracking
CREATE TABLE public.employee_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  role app_role NOT NULL DEFAULT 'employee',
  invited_by uuid,
  invited_user_id uuid, -- auth user id once invite is created
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX ON public.employee_invites (email);
CREATE INDEX ON public.employee_invites (status);
ALTER TABLE public.employee_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites"
  ON public.employee_invites FOR ALL
  TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_ei_updated BEFORE UPDATE ON public.employee_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();