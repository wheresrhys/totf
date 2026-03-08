WITH hatch_ages as (SELECT
  b.id as bird_id,
  b.ring_no as ring_no,
  s.visit_date,
  e.age_code,
  sp.species_name,
  EXTRACT(YEAR FROM s.visit_date)::INTEGER AS visit_year,
  CASE
    WHEN e.age_code % 2 = 0 THEN
      EXTRACT(YEAR FROM s.visit_date)::INTEGER - (e.age_code / 2 - 1)
    WHEN e.age_code % 2 = 1 AND e.age_code > 1 THEN
      EXTRACT(YEAR FROM s.visit_date)::INTEGER - ((e.age_code - 3) / 2)
    ELSE
      EXTRACT(YEAR FROM s.visit_date)::INTEGER
  END AS max_hatch_year,
  CASE
    WHEN e.age_code % 2 = 0 THEN
      0
    WHEN e.age_code % 2 = 1 AND e.age_code > 1 THEN
      EXTRACT(YEAR FROM s.visit_date)::INTEGER - ((e.age_code - 3) / 2)
    ELSE
      EXTRACT(YEAR FROM s.visit_date)::INTEGER
  END AS min_hatch_year
FROM "Encounters" e
JOIN "Birds" b on e.bird_id = b.id
JOIN "Sessions" s ON s.id = e.session_id
JOIN "Species" sp on sp.id = b.species_id),
hatch_year_differences as (SELECT
   MAX(min_hatch_year) as max_min_year,
   MIN(max_hatch_year) as min_max_year,
   bird_id,
   ring_no,
   species_name
FROM hatch_ages
GROUP by bird_id, ring_no, species_name)
SELECT
   bird_id,
   ring_no,
   species_name,
   min_max_year,
   max_min_year
FROM hatch_year_differences
WHERE min_max_year < max_min_year


WITH sex_counts as (SELECT
  b.id as bird_id,
  b.ring_no as ring_no,
  s.species_name,
  count (distinct e.sex) as sex_count
from "Birds" b
JOIN "Encounters" e on e.bird_id = b.id
JOIN "Species" s on s.id = b.species_id
WHERE NOT e.sex ilike 'u'
GROUP by b.id, b.ring_no, s.species_name)
SELECT * from sex_counts
WHERE sex_count > 1


-- TODO wing length difference > 5mm
