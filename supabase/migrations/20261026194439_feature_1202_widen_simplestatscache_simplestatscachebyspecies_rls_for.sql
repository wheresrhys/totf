DROP POLICY group_simple_stats_cache_access ON public."SimpleStatsCache";
DROP POLICY group_simple_stats_cache_by_species_access ON public."SimpleStatsCacheBySpecies";
GRANT SELECT ON public."SimpleStatsCache" TO anon;
CREATE POLICY group_simple_stats_cache_access ON public."SimpleStatsCache" FOR SELECT USING (((group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint) OR (EXISTS ( SELECT 1
   FROM public."GroupDataSharing"
  WHERE (("GroupDataSharing".granter_group_id = "SimpleStatsCache".group_id) AND ("GroupDataSharing".recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)))) OR (EXISTS ( SELECT 1
   FROM public."RingingGroups" rg
  WHERE ((rg.id = "SimpleStatsCache".group_id) AND ('summary'::text = ANY (rg.public_areas)))))));
GRANT SELECT ON public."SimpleStatsCacheBySpecies" TO anon;
CREATE POLICY group_simple_stats_cache_by_species_access ON public."SimpleStatsCacheBySpecies" FOR SELECT USING (((group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint) OR (EXISTS ( SELECT 1
   FROM public."GroupDataSharing"
  WHERE (("GroupDataSharing".granter_group_id = "SimpleStatsCacheBySpecies".group_id) AND ("GroupDataSharing".recipient_group_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'ringing_group_id'::text))::bigint)))) OR (EXISTS ( SELECT 1
   FROM public."RingingGroups" rg
  WHERE ((rg.id = "SimpleStatsCacheBySpecies".group_id) AND ('summary'::text = ANY (rg.public_areas)))))));
