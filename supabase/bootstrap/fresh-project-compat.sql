-- Run only AFTER the historical migrations on a NEW, empty app project.
-- Legacy event analytics and the canonical booth counters share this table.
ALTER TABLE public.booth_analytics
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sponsor_id text REFERENCES public.sponsors(id),
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS duration integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.booth_analytics'::regclass
      AND confrelid = 'public.expo_booths'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.booth_analytics DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;
-- Counter IDs can refer to either public scene booths or managed expo_booths.
-- The later counter compatibility migration uses a plain UUID for that reason.

-- Fresh cloud projects no longer expose new tables automatically. Explicitly
-- expose only the browser reads; all business writes go through the API.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.sectors, public.companies, public.booths, public.cities TO anon, authenticated;
GRANT SELECT ON public.users, public.user_profiles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Legacy migrations include privileged functions; keep them server-only.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', item.signature);
  END LOOP;
END $$;

-- Only published sponsors/booths belong in direct public reads.
DROP POLICY IF EXISTS "Public read companies" ON public.companies;
DROP POLICY IF EXISTS "company_access" ON public.companies;
DROP POLICY IF EXISTS "Active companies are viewable by everyone" ON public.companies;
CREATE POLICY fresh_active_companies ON public.companies FOR SELECT TO anon, authenticated
  USING (is_active = true);
DROP POLICY IF EXISTS "Public read booths" ON public.booths;
DROP POLICY IF EXISTS "Booths are viewable by everyone" ON public.booths;
CREATE POLICY fresh_active_company_booths ON public.booths FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.is_active = true));

-- RLS does not require an ownership predicate for the public scene sectors.
-- Users/profile policies from the historical chain remain owner-scoped.
