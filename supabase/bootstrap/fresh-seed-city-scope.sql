-- Fresh-project seed compatibility: the later sponsor seed creates two sectors
-- after the historical migration populated sectors.city_id. The API selects
-- companies only within its active city's sectors, so those seeds must be linked.
-- Only the known release seed sectors/companies in the new project are affected.
DO $$
DECLARE target_city uuid;
BEGIN
  SELECT id INTO STRICT target_city
  FROM public.cities
  WHERE name = 'Warpala Prime' AND is_active = true;

  UPDATE public.sectors s
  SET city_id = target_city
  WHERE s.city_id IS NULL
    AND s.name IN ('Platform Partners', 'Meetings & Demos')
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.sector_id = s.id AND c.is_active = true
        AND c.slug IN ('warpala-platform', 'sponsor-concierge', 'demo-room-access')
    );

  IF (
    SELECT count(*) FROM public.companies c
    JOIN public.sectors s ON s.id = c.sector_id
    WHERE c.is_active = true AND s.city_id = target_city
      AND c.slug IN ('warpala-platform', 'sponsor-concierge', 'demo-room-access')
  ) <> 3 THEN
    RAISE EXCEPTION 'FRESH_SEED_CITY_SCOPE: expected all three release sponsors in Warpala Prime';
  END IF;
END $$;
