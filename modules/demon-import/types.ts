import type { ImportJobStatus } from '@/app/models/db';

export type DemonColumnNames =
	| 'entered_by'
	| 'nest_link_code'
	| 'validation_comments'
	| 'submission_status'
	| 'filename'
	| 'record_type'
	| 'new/subsequent'
	| 'ring_no'
	| 'scheme'
	| 'scheme2'
	| 'ring_no2'
	| 'species_name'
	| 'age'
	| 'pulli_ringed'
	| 'pulli_alive'
	| 'sex'
	| 'sexing_method'
	| 'provisional_sex'
	| 'breeding_condition'
	| 'visit_date'
	| 'capture_time'
	| 'loc_id'
	| 'gridref'
	| 'habitat_1'
	| 'habitat_2'
	| 'status_code_1'
	| 'status_code_2'
	| 'lure_code_1'
	| 'lure_code_2'
	| 'wing_length'
	| 'weight'
	| 'date_measured'
	| 'time_w'
	| 'condition'
	| 'moult_code'
	| 'alula'
	| 'old_greater_coverts'
	| 'primary_moult'
	| 'primary_covert_moult_scores'
	| 'secondary_moult_scores'
	| 'finding_condition'
	| 'finding_circumstances'
	| 'capture_method'
	| 'metal_mark_info'
	| 'ringer_initials'
	| 'ringer_check_initials'
	| 'processor_initials'
	| 'extractor_initials'
	| 'wing_initials'
	| 'colour_mark_info'
	| 'metal_mark_position'
	| 'fat'
	| 'pectoral_muscle'
	| 'body_moult'
	| 'greater_covert_moult_scores'
	| 'alula_moult_scores'
	| 'carpal_covert_moult'
	| 'wing_point'
	| 'primary_length'
	| 'bill_length_method'
	| 'bill_length'
	| 'head_bill_length'
	| 'bill_depth_method'
	| 'bill_depth'
	| 'tarsus_length_method'
	| 'tail_moult_scores'
	| 'tarsus_length'
	| 'tail_length'
	| 'claw_length'
	| 'plumage'
	| 'tail_diff'
	| 'lesser_median_covert_moult'
	| 'underwing_covert_moult'
	| 'head_moult'
	| 'upperparts_moult'
	| 'underparts_moult'
	| 'permit_no'
	| 'pullus_stage'
	| 'extra_text'
	| 'date_accuracy'
	| 'left_leg_below'
	| 'right_leg_below'
	| 'left_leg_above'
	| 'right_leg_above'
	| 'neck_collar'
	| 'left_wing_tag'
	| 'right_wing_tag'
	| 'nasal_saddle'
	| 'sample_processed'
	| 'high_tide_time'
	| 'finder_name'
	| 'own'
	| 'own2'
	| 'userc1'
	| 'userc2'
	| 'email'
	| 'userc3'
	| 'userc4'
	| 'userc5'
	| 'userv1'
	| 'userv2'
	| 'userv3'
	| 'userv4'
	| 'userv5'
	| 'l_primary_moult_scores'
	| 'l_secondary_moult_scores'
	| 'l_tail_moult_scores'
	| 'l_primary_covert_moult_scores'
	| 'l_greater_covert_moult_scores'
	| 'l_carpal_covert_moult'
	| 'l_alula_moult_scores'
	| 'toe_span';

export type DemonRow = Record<DemonColumnNames, string>;

/** The four row counts both import entry points compute, see modules/demon-import/CLAUDE.md. */
export type ImportJobRowCounts = {
	processed: number;
	successful: number;
	failed: number;
	skipped: number;
};

/** The outcome a stats-cache refresh can actually be recorded as. */
export type StatsCacheRefreshOutcome = Extract<
	ImportJobStatus,
	'succeeded' | 'failed'
>;

export type DemonImportProgressUpdate = { type: 'progress'; processed: number };
export type DemonImportCompleteUpdate = {
	type: 'complete';
	processed: number;
	successful: number;
	failed: number;
	skipped: number;
};
export type DemonImportTimeoutUpdate = {
	type: 'timeout';
	processed: number;
	startDate: string | null;
	endDate: string | null;
};
export type DemonImportErrorUpdate = { type: 'error'; message: string };
/** See `getDistinctLocationNames`/`findUnrecognisedLocationNames` — #1079. */
export type DemonImportUnrecognisedLocationsUpdate = {
	type: 'unrecognised_locations';
	locations: string[];
};
/** One update yielded by `runDemonImport` as an import progresses. */
export type DemonImportUpdate =
	| DemonImportProgressUpdate
	| DemonImportCompleteUpdate
	| DemonImportTimeoutUpdate
	| DemonImportErrorUpdate
	| DemonImportUnrecognisedLocationsUpdate;
