SET check_function_bodies = false;
DROP FUNCTION public.metrics_by_period_and_species(IN temporal_unit text, IN metric_name text, IN filters public.top_metrics_filter_params);
DROP FUNCTION public.top_metrics_by_period(IN temporal_unit text, IN metric_name text, IN result_limit integer, IN filters public.top_metrics_filter_params);
DROP FUNCTION public.top_metrics_by_species_and_period(IN temporal_unit text, IN metric_name text, IN result_limit integer, IN filters public.top_metrics_filter_params);
DROP TYPE public.top_metrics_filter_params;
