import type { DemonRow } from '../types';
import type { DemonRecordsBatchWriter } from './demon-records-batch-writer';
import type { EncounterRowBatchWriter } from './encounter-batch-writer';

/**
 * One CSV row, end to end: staged into `DemonRecords` first, and only then — once
 * that row's batch has actually landed — interpreted into the domain tables.
 *
 * Splitting it this way is the point of #959: whatever happens to a row's
 * domain-table write, a record of what was submitted for it already exists. A
 * row whose staging batch failed therefore never reaches
 * `encounterRowBatchWriter` at all.
 *
 * Both writers are built once per run by the caller. Neither this function nor
 * the staging writer knows anything about the run's concurrency cap: since #1139
 * that lives inside `EncounterRowBatchWriter`, around a whole chunk flush, and
 * never around the staging write above it (see `DemonRecordsBatchWriter`).
 */
export async function processEncounterRow(
	rawRow: DemonRow,
	demonRecordsBatchWriter: DemonRecordsBatchWriter,
	encounterRowBatchWriter: EncounterRowBatchWriter
): Promise<{ visitDate: string }> {
	await demonRecordsBatchWriter.writeDemonRecord(rawRow);
	return encounterRowBatchWriter.writeEncounterRow(rawRow);
}
