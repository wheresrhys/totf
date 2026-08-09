/**
 * Resolves the direct (one-level, not transitive) local import dependencies
 * of the `@mutates` trigger paths in e2e/mutating-spec-triggers.json.
 *
 * Why: a change to a file that e.g. lib/demon-import.ts imports from — but
 * which isn't itself listed as a trigger path — could change import
 * behaviour just as much as editing the trigger file directly. This script
 * finds those one-hop dependencies so scripts/e2e-select-suite.sh can treat
 * changes to them as also touching the trigger.
 *
 * Type-only imports are excluded, since they can't affect runtime behaviour:
 *   - whole-statement `import type { X } from '...'`
 *   - named specifiers marked inline, `import { type X } from '...'`
 *   - named specifiers that resolve to a `export type`/`export interface`
 *     declaration in the target file, even when imported without the `type`
 *     keyword (common in this codebase, e.g. `types/supabase.types.ts`)
 *
 * This is a regex-based scan, not a full TS parse — it's deliberately kept
 * lightweight (one level deep only) rather than pulling in the TypeScript
 * compiler API for a check this narrow in scope.
 *
 * Usage: node scripts/resolve-mutating-import-deps.mjs
 * Prints one repo-relative path per line.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const triggersPath = path.join(repoRoot, 'e2e', 'mutating-spec-triggers.json');
const triggers = JSON.parse(readFileSync(triggersPath, 'utf8'))['@mutates'];

const IMPORT_STATEMENT_RE =
	/^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
const TYPE_EXPORT_RE = /^\s*export\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/gm;

/** Expand a trigger path (file or directory) into its .ts/.tsx source files. */
function sourceFilesFor(triggerPath) {
	const abs = path.join(repoRoot, triggerPath);
	if (!existsSync(abs)) return [];
	if (statSync(abs).isDirectory()) return listSourceFiles(abs);
	return /\.(ts|tsx)$/.test(abs) ? [abs] : [];
}

function listSourceFiles(dir) {
	const results = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === '__tests__') continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...listSourceFiles(full));
		} else if (
			/\.(ts|tsx)$/.test(entry.name) &&
			!/\.(test|spec)\.tsx?$/.test(entry.name)
		) {
			results.push(full);
		}
	}
	return results;
}

/** Resolve an import specifier to an on-disk .ts/.tsx file, if it's local. */
function resolveLocalImport(specifier, fromFile) {
	let base;
	if (specifier.startsWith('.')) {
		base = path.resolve(path.dirname(fromFile), specifier);
	} else if (specifier.startsWith('@/')) {
		base = path.join(repoRoot, specifier.slice(2));
	} else {
		return null; // bare specifier — npm package or Node builtin, not local src
	}
	const candidates = [
		`${base}.ts`,
		`${base}.tsx`,
		path.join(base, 'index.ts'),
		path.join(base, 'index.tsx')
	];
	return (
		candidates.find(
			(candidate) => existsSync(candidate) && statSync(candidate).isFile()
		) ?? null
	);
}

/** Names exported as `export type X` / `export interface X` from a file. */
function typeOnlyExportNames(file) {
	const contents = readFileSync(file, 'utf8');
	const names = new Set();
	let match;
	TYPE_EXPORT_RE.lastIndex = 0;
	while ((match = TYPE_EXPORT_RE.exec(contents))) names.add(match[1]);
	return names;
}

/** Parse the clause between `import` and `from` into its specifiers. */
function parseImportClause(clause) {
	const braceIndex = clause.indexOf('{');
	const hasNamed = braceIndex !== -1;
	const defaultOrNamespacePart = (
		hasNamed ? clause.slice(0, braceIndex) : clause
	)
		.replace(/,\s*$/, '')
		.trim();
	const namedPart = hasNamed
		? clause.slice(braceIndex + 1, clause.lastIndexOf('}'))
		: '';
	const namedSpecifiers = namedPart
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => {
			const isType = /^type\s+/.test(s);
			const name = s
				.replace(/^type\s+/, '')
				.split(/\s+as\s+/)[0]
				.trim();
			return { name, isType };
		});
	return {
		hasDefaultOrNamespace: defaultOrNamespacePart.length > 0,
		namedSpecifiers
	};
}

/** Does this import statement pull in at least one runtime value? */
function importsAValue(clause, targetFile) {
	const { hasDefaultOrNamespace, namedSpecifiers } = parseImportClause(clause);
	if (hasDefaultOrNamespace) return true; // default/namespace imports assumed to be values
	if (namedSpecifiers.length === 0) return false; // side-effect-only import, e.g. `import './x'`

	const unmarkedNames = namedSpecifiers
		.filter((s) => !s.isType)
		.map((s) => s.name);
	if (unmarkedNames.length === 0) return false; // every specifier explicitly `type`

	const typeExports = typeOnlyExportNames(targetFile);
	return unmarkedNames.some((name) => !typeExports.has(name));
}

const deps = new Set();

for (const triggerPath of triggers) {
	for (const file of sourceFilesFor(triggerPath)) {
		const contents = readFileSync(file, 'utf8');
		IMPORT_STATEMENT_RE.lastIndex = 0;
		let match;
		while ((match = IMPORT_STATEMENT_RE.exec(contents))) {
			const [, isTypeOnlyStatement, clause, specifier] = match;
			if (isTypeOnlyStatement) continue;

			const targetFile = resolveLocalImport(specifier, file);
			if (!targetFile) continue;
			if (!importsAValue(clause, targetFile)) continue;

			deps.add(path.relative(repoRoot, targetFile));
		}
	}
}

for (const dep of deps) console.log(dep);
