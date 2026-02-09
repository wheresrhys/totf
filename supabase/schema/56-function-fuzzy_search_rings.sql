CREATE OR REPLACE FUNCTION "public"."fuzzy_search_rings" ("q" "text") RETURNS TABLE (
	"ring_no" "text",
	"closeness_score" "numeric",
	"species_name" "text"
) LANGUAGE "plpgsql" STABLE
SET
	"search_path" TO 'public',
	'pg_catalog' AS $$
BEGIN
  RETURN QUERY
WITH fuzzy_matches as (SELECT
  b.species_id,
  b.ring_no,
  levenshtein(b.ring_no ,q) as levenshtein
from "Birds" b
)
SELECT fm.ring_no,
        (
          fm.levenshtein::float - (
            0.5*(
              length(fm.ring_no) - length(q)
            )
          )
        )::numeric as closeness_score,
        sp.species_name
FROM fuzzy_matches fm
JOIN "Species" sp on fm.species_id = sp.id
WHERE fm.levenshtein < 3 OR fm.ring_no like '%q%'
ORDER BY closeness_score ASC;
END;
$$;
