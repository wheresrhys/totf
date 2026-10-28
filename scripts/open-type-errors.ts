#!/usr/bin/env node

/**
 * TypeScript Check and Open Errors Script
 *
 * Runs `npx tsc --noEmit` and opens all files with errors in Cursor
 *
 * Usage: tsx scripts/typecheck-and-open.ts
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

interface FileLocation {
	file: string;
}

function parseTypeScriptOutput(output: string): FileLocation[] {
	const locations: FileLocation[] = [];
	const seen = new Set<string>();
	// Match patterns like: filepath:line:column or filepath(line,column)
	// Examples: app/(routes)/page.tsx:97:6 or app/page.tsx(12,5)
	const patterns = [/([^\s:]+):(\d+):(\d+)/g, /([^\s]+)\((\d+),(\d+)\)/g];

	for (const pattern of patterns) {
		// Use matchAll instead of exec in a while loop
		const matches = output.matchAll(pattern);

		for (const match of matches) {
			const file = match[1];

			const key = `${file}`;
			if (!seen.has(key)) {
				seen.add(key);
				locations.push({ file });
			}
		}
	}

	return locations;
}

function openFileInSublime(filePath: string): void {
	const absolutePath = path.resolve(filePath);

	if (!existsSync(absolutePath)) {
		console.warn(`Warning: File not found: ${absolutePath}`);
		return;
	}

	try {
		// console.log(`s ${absolutePath}`)
		// const result = spawnSync('s', [`"${absolutePath}"`], {
		// 	stdio: 'pipe'
		// });
		// if (result.status === 0) {
		// 	console.log(`✓ Opened using cursor`);
		// 	return; // Success, exit function
		// } else {
		// 	const errorMsg =
		// 		result.stderr?.toString() ||
		// 		result.stdout?.toString() ||
		// 		'Unknown error';
		// 	console.log(`✗ Failed ${name}: ${errorMsg.substring(0, 100)}`);
		// }
	} catch (error) {
		console.error(`Error opening ${absolutePath}:`, error);
	}
}

function main(): void {
	console.log('Running TypeScript type check...\n');

	try {
		// Run tsc --noEmit and capture both stdout and stderr
		execSync('npx tsc --noEmit', {
			encoding: 'utf-8',
			stdio: ['inherit', 'pipe', 'pipe']
		});

		// tsc outputs errors to stderr, but execSync with stdio pipe captures both
		// We need to capture stderr separately
		console.log('No type errors found!');
		process.exit(0);
	} catch (error: unknown) {
		// tsc exits with non-zero code when there are errors
		// The error output is in stderr
		// @ts-expect-error - Don't care - it's a dev script
		const errorOutput = error.stderr || error.stdout || error.message || '';

		if (errorOutput) {
			console.log('TypeScript errors found:\n');
			// console.log(errorOutput);

			const fileLocations = parseTypeScriptOutput(errorOutput);

			if (fileLocations.length > 0) {
				console.log(`\nOpening ${fileLocations.length} file(s) in Cursor...\n`);

				for (const location of fileLocations) {
					console.log(`Opening ${location.file}`);
					openFileInSublime(location.file);
				}
			} else {
				console.log('\nNo file locations found in error output.');
			}
		} else {
			console.error('Unexpected error running TypeScript check:', error);
		}

		process.exit(1);
	}
}

main();
