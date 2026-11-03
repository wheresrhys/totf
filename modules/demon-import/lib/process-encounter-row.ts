import type { DemonRow } from '../types';
import type { DemonRecordsBatchWriter } from './demon-records-batch-writer';
import type { EncounterRowBatchWriter } from './encounter-batch-writer';

/** One CSV row, end to end: staged into `DemonRecords`, then interpreted into the domain tables. */
export async function processEncounterRow(
	rawRow: DemonRow,
	demonRecordsBatchWriter: DemonRecordsBatchWriter,
	encounterRowBatchWriter: EncounterRowBatchWriter
): Promise<{ visitDate: string }> {
	await demonRecordsBatchWriter.writeDemonRecord(rawRow);
	return encounterRowBatchWriter.writeEncounterRow(rawRow);
}
