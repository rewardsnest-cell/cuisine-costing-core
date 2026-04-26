CREATE OR REPLACE FUNCTION public.audit_list_rls_policies()
RETURNS TABLE (
  schemaname text,
  tablename text,
  policyname text,
  cmd text,
  permissive text,
  roles text[],
  qual text,
  with_check text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    p.schemaname::text,
    p.tablename::text,
    p.policyname::text,
    p.cmd::text,
    p.permissive::text,
    p.roles::text[],
    p.qual::text,
    p.with_check::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY p.tablename, p.policyname;
$$;

REVOKE ALL ON FUNCTION public.audit_list_rls_policies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_list_rls_policies() TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_list_tables_with_rls()
RETURNS TABLE (
  table_name text,
  rls_enabled boolean,
  policy_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.relname::text AS table_name,
    c.relrowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_catalog.pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.audit_list_tables_with_rls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_list_tables_with_rls() TO authenticated;