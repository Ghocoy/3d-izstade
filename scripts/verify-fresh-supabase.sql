-- Assertions for the isolated CI database after bootstrap.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sectors) THEN RAISE EXCEPTION 'Scene sectors missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE is_active) THEN RAISE EXCEPTION 'Sponsor seed missing'; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'Public table without RLS';
  END IF;
  IF has_table_privilege('anon', 'public.modular_home_quote_requests', 'SELECT')
    OR has_table_privilege('authenticated', 'public.modular_home_quote_requests', 'SELECT') THEN
    RAISE EXCEPTION 'Private quotes exposed to public clients';
  END IF;
  IF has_table_privilege('anon', 'public.users', 'SELECT') THEN RAISE EXCEPTION 'Users exposed'; END IF;
  IF NOT has_table_privilege('service_role', 'public.modular_home_quote_requests', 'INSERT') THEN
    RAISE EXCEPTION 'API lacks quote insert grant';
  END IF;
END $$;
SET ROLE anon;
SELECT id FROM public.sectors LIMIT 1;
SELECT id FROM public.companies LIMIT 1;
SELECT id FROM public.booths LIMIT 1;
RESET ROLE;
-- Auth trigger must bootstrap a new user without platform errors.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-4111-8111-111111111111', 'ci-user@example.invalid', '{"full_name":"CI User"}');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = '11111111-1111-4111-8111-111111111111' AND role = 'user') THEN
    RAISE EXCEPTION 'Auth user bootstrap failed';
  END IF;
END $$;
