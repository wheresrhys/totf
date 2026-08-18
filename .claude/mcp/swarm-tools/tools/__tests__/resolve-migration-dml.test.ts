import { describe, it, expect } from 'vitest';
import { extractSqlFromPrBody, extractSqlFromLocalFile } from '../resolve-migration-dml';

describe('extractSqlFromPrBody', () => {
	// Usual
	it('extracts the fenced SQL block following the anchor text', () => {
		const body = [
			'## Prod-ready migration SQL',
			'<details>',
			'<summary>Data migration — append to the end of the regenerated DDL migration before pushing to prod</summary>',
			'',
			'```sql',
			"UPDATE \"RingingGroups\" SET slug = 'x' WHERE id = 1;",
			'```',
			'</details>',
		].join('\n');
		expect(extractSqlFromPrBody(body)).toBe("UPDATE \"RingingGroups\" SET slug = 'x' WHERE id = 1;");
	});

	// Structure
	it('ignores an unrelated earlier fenced sql block before the anchor', () => {
		const body = ['```sql', 'SELECT 1;', '```', '<summary>Data migration — append to the end of the regenerated DDL migration before pushing to prod</summary>', '```sql', 'SELECT 2;', '```'].join('\n');
		expect(extractSqlFromPrBody(body)).toBe('SELECT 2;');
	});

	// Edge
	it('returns null when the anchor text is absent', () => {
		const body = '```sql\nSELECT 1;\n```';
		expect(extractSqlFromPrBody(body)).toBeNull();
	});

	it('returns null when the anchor is present but no fenced sql block follows', () => {
		const body =
			'<summary>Data migration — append to the end of the regenerated DDL migration before pushing to prod</summary>\nno code block here';
		expect(extractSqlFromPrBody(body)).toBeNull();
	});

	it('returns null for an empty body', () => {
		expect(extractSqlFromPrBody('')).toBeNull();
	});
});

describe('extractSqlFromLocalFile', () => {
	// Usual
	it('extracts everything from the marker line to end of file', () => {
		const content = [
			'-- generated DDL above',
			'ALTER TABLE "Birds" ADD COLUMN foo text;',
			'',
			'-- Hand-authored data migration (backfill only — appended after schema-apply)',
			"UPDATE \"Birds\" SET foo = 'bar';",
		].join('\n');
		expect(extractSqlFromLocalFile(content)).toBe(
			"-- Hand-authored data migration (backfill only — appended after schema-apply)\nUPDATE \"Birds\" SET foo = 'bar';"
		);
	});

	// Edge
	it('returns null when the marker is absent (pure DDL migration)', () => {
		const content = 'ALTER TABLE "Birds" ADD COLUMN foo text;';
		expect(extractSqlFromLocalFile(content)).toBeNull();
	});

	it('returns null for an empty file', () => {
		expect(extractSqlFromLocalFile('')).toBeNull();
	});
});
