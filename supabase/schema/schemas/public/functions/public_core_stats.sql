-- Public, group-gated wrapper around core_stats (#828, step 1 of the
-- aggregate_stats -> core_stats rename: create new, migrate app, delete
-- old). Mechanical duplication of public_aggregate_stats under a new name,
-- with every reference to aggregate_stats/aggregate_stats_result swapped to
-- core_stats/core_stats_result. public_aggregate_stats is left
-- untouched and keeps serving all existing app call sites unchanged until the
-- migration ticket lands.
-- Runs SECURITY DEFINER so the (owner-privileged) definer bypasses RLS to
-- compute the aggregate, but only ever after confirming the target group has
-- opted its summary data into public view via 'summary' = ANY(public_areas).
-- It returns exactly what core_stats returns for the same params, or
-- nothing at all when the group has not opted in / does not exist / no group
-- is given. Execute is granted to the anon role (mirroring core_stats) so
-- an anonymous (no-JWT) PostgREST client can call it directly; no base-table
-- grant or RLS policy is widened, so raw Sessions/Encounters/Birds rows stay
-- inaccessible.
-- Shares core_stats's input signature (forwarded verbatim below) and its
-- return shape via the public.core_stats_result composite type, so the
-- two can never drift.
CREATE FUNCTION public.public_core_stats (
	species_name_filter text DEFAULT NULL::text,
	from_date date DEFAULT NULL::date,
	to_date date DEFAULT NULL::date,
	ringing_group_filter bigint DEFAULT NULL::bigint,
	group_by_species boolean DEFAULT FALSE,
	group_by_time_period text DEFAULT NULL::text
) RETURNS SETOF public.core_stats_result LANGUAGE plpgsql SECURITY DEFINER
SET
	search_path TO 'public',
	'pg_catalog' AS $function$
BEGIN
  -- Only expose data for a group that has explicitly published its summary area.
  IF ringing_group_filter IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public."RingingGroups" rg
       WHERE rg.id = ringing_group_filter
         AND 'summary' = ANY(rg.public_areas)
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.core_stats(
    species_name_filter,
    from_date,
    to_date,
    ringing_group_filter,
    group_by_species,
    group_by_time_period
  );
END;
$function$;

GRANT ALL ON FUNCTION public.public_core_stats (text, date, date, bigint, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.public_core_stats (text, date, date, bigint, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.public_core_stats (text, date, date, bigint, boolean, text) TO service_role;
