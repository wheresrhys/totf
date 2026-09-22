#!/usr/bin/env tsx
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getAuthenticatedSupabaseClientForGroup } from '../app/lib/auth/group-auth';
import {
	getAllRelevantHighlights,
	removeLessSignificantHighlights,
	combineSimilarHighlights,
	sortHighlights
} from '../app/lib/highlights/v2/session-highlights';
import {
	printSingleHighlightSentence,
	printMultipleHighlightSentence
} from '../app/lib/highlights/v2/sentence-builders';
import type {
	CherryPickedHighlight,
	CombinedHighlights
} from '../app/lib/highlights/v2/types';

const [groupIdArg, ...rest] = process.argv.slice(2);
const outDirFlagIndex = rest.indexOf('--out-dir');
const outDir = outDirFlagIndex > -1 ? rest[outDirFlagIndex + 1] : 'reports';

if (!groupIdArg || Number.isNaN(Number(groupIdArg))) {
	console.error(
		'Usage: session-highlights-refinement-report <groupId> [--out-dir reports]'
	);
	process.exit(1);
}

const groupId = Number(groupIdArg);

type DateReport = {
	groupId: number;
	date: string;
	initialCount: number;
	finalCount: number;
	changed: boolean;
	initial: (CherryPickedHighlight & { sentence: string })[];
	removed: (CherryPickedHighlight & { sentence: string })[];
	combined: (CombinedHighlights & {
		sentence: string;
		constituentSentences: string[];
	})[];
	final: (CombinedHighlights & { sentence: string })[];
};

function diffRemoved(
	initial: CherryPickedHighlight[],
	significant: CherryPickedHighlight[]
): CherryPickedHighlight[] {
	const significantSet = new Set(significant);
	return initial.filter((highlight) => !significantSet.has(highlight));
}

function diffCombined(
	significant: CherryPickedHighlight[],
	combined: CombinedHighlights[]
): { combined: CombinedHighlights; constituents: CherryPickedHighlight[] }[] {
	const scopeToOriginal = new Map<
		CherryPickedHighlight['scope'],
		CherryPickedHighlight
	>();
	significant.forEach((highlight) =>
		scopeToOriginal.set(highlight.scope, highlight)
	);

	return combined
		.filter((group) => group.scopes.length > 1)
		.map((group) => ({
			combined: group,
			constituents: group.scopes
				.map(({ scope }) => scopeToOriginal.get(scope))
				.filter((h): h is CherryPickedHighlight => Boolean(h))
		}));
}

function buildDateReport(
	date: string,
	initial: CherryPickedHighlight[],
	significant: CherryPickedHighlight[],
	combined: CombinedHighlights[],
	final: CombinedHighlights[]
): DateReport {
	const removed = diffRemoved(initial, significant);
	const combinedDiffs = diffCombined(significant, combined);

	return {
		groupId,
		date,
		initialCount: initial.length,
		finalCount: final.length,
		changed: initial.length !== final.length,
		initial: initial.map((h) => ({
			...h,
			sentence: printSingleHighlightSentence(h)
		})),
		removed: removed.map((h) => ({
			...h,
			sentence: printSingleHighlightSentence(h)
		})),
		combined: combinedDiffs.map(({ combined: group, constituents }) => ({
			...group,
			sentence: printMultipleHighlightSentence(group),
			constituentSentences: constituents.map(printSingleHighlightSentence)
		})),
		final: final.map((h) => ({
			...h,
			sentence: printMultipleHighlightSentence(h)
		}))
	};
}

function renderMarkdownSection(report: DateReport): string {
	const lines: string[] = [`## ${report.date}`, '', '### Initial'];
	lines.push(...report.initial.map(({ sentence }) => `- ${sentence}`));

	lines.push('', '### Refinements');
	if (report.removed.length) {
		lines.push('- Removed less-significant highlights:');
		lines.push(...report.removed.map(({ sentence }) => `  - ${sentence}`));
	}
	if (report.combined.length) {
		lines.push('- Combined similar highlights:');
		report.combined.forEach(({ sentence, constituentSentences }) => {
			lines.push(`  - ${sentence} — combines:`);
			lines.push(...constituentSentences.map((s) => `    - ${s}`));
		});
	}
	if (!report.removed.length && !report.combined.length) {
		lines.push('- (no removals or combinations at this stage)');
	}

	lines.push('', '### Final');
	lines.push(...report.final.map(({ sentence }) => `- ${sentence}`));

	return lines.join('\n');
}

const supabase = await getAuthenticatedSupabaseClientForGroup(groupId);

const { data: sessionRows, error } = await supabase
	.from('Sessions')
	.select('visit_date')
	.eq('ringing_group_id', groupId)
	.eq('session_type', 'FULL_GROWN')
	.order('visit_date');

if (error) {
	console.error('Failed to fetch session dates:', error.message);
	process.exit(1);
}

const dates = [...new Set((sessionRows ?? []).map((row) => row.visit_date))];

console.log(`Found ${dates.length} session dates for group ${groupId}`);

const allReports: DateReport[] = [];

for (const date of dates) {
	const initial = await getAllRelevantHighlights(groupId, date, supabase);
	const significant = removeLessSignificantHighlights(initial);
	const combined = combineSimilarHighlights(significant);
	const final = sortHighlights(combined);

	allReports.push(buildDateReport(date, initial, significant, combined, final));
}

const markdownSections = allReports
	.filter((report) => report.changed)
	.map(renderMarkdownSection);

const markdown = markdownSections.length
	? markdownSections.join('\n\n')
	: `No dates for group ${groupId} had a different initial/final highlight count.`;

await mkdir(outDir, { recursive: true });

const mdPath = path.join(
	outDir,
	`session-highlights-refinement-report.${groupId}.md`
);
const jsonPath = path.join(
	outDir,
	`session-highlights-refinement-report.${groupId}.json`
);

await writeFile(mdPath, markdown);
await writeFile(jsonPath, JSON.stringify(allReports, null, 2));

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
