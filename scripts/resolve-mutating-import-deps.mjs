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
 *   - named specifiers that resolve to a `export type`/`export interface`/
 *     `export type { X }`/`export { type X }` declaration in the target
 *     file, even when imported without the `type` keyword (common in this
 *     codebase, e.g. `types/supabase.types.ts`)
 *
 * Each trigger file (and each target file it imports from) is parsed into a
 * real TypeScript AST via the `typescript` compiler API, rather than
 * pattern-matching import statements with regexes — so the parsing handles
 * the full grammar (multi-line clauses, aliases, JSX, etc.) correctly rather
 * than approximately. Resolution is still deliberately kept to one level
 * deep only, not a full transitive dependency graph.
 *
 * Usage: node scripts/resolve-mutating-import-deps.mjs
 * Prints one repo-relative path per line.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const triggersPath = path.join(repoRoot, 'e2e', 'mutating-spec-triggers.json');
const triggers = JSON.parse(readFileSync(triggersPath, 'utf8'))['@mutates'];

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

const sourceFileCache = new Map();

/** Parse a file into a TypeScript AST, caching since files can be visited more than once. */
function parseSourceFile(file) {
	let sourceFile = sourceFileCache.get(file);
	if (sourceFile) return sourceFile;
	const contents = readFileSync(file, 'utf8');
	const scriptKind = file.endsWith('.tsx')
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS;
	sourceFile = ts.createSourceFile(
		file,
		contents,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
		scriptKind
	);
	sourceFileCache.set(file, sourceFile);
	return sourceFile;
}

function hasExportModifier(node) {
	return (
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
		)
	);
}

const typeOnlyExportsCache = new Map();

/**
 * Names exported from a file's top-level statements as type-only:
 * `export type X`, `export interface X`, `export type { X }`, or
 * `export { type X }`.
 */
function typeOnlyExportNames(file) {
	let names = typeOnlyExportsCache.get(file);
	if (names) return names;
	names = new Set();

	for (const statement of parseSourceFile(file).statements) {
		if (
			(ts.isInterfaceDeclaration(statement) ||
				ts.isTypeAliasDeclaration(statement)) &&
			hasExportModifier(statement)
		) {
			names.add(statement.name.text);
		} else if (
			ts.isExportDeclaration(statement) &&
			statement.exportClause &&
			ts.isNamedExports(statement.exportClause)
		) {
			for (const element of statement.exportClause.elements) {
				if (statement.isTypeOnly || element.isTypeOnly) {
					names.add(element.name.text);
				}
			}
		}
	}

	typeOnlyExportsCache.set(file, names);
	return names;
}

/** Does this import declaration's clause pull in at least one runtime value from targetFile? */
function importsAValue(importClause, targetFile) {
	if (!importClause) return false; // side-effect-only import, e.g. `import './x'`
	if (importClause.isTypeOnly) return false; // whole-statement `import type { X } from '...'`
	if (importClause.name) return true; // default import assumed to be a value

	const namedBindings = importClause.namedBindings;
	if (!namedBindings) return false;
	if (ts.isNamespaceImport(namedBindings)) return true; // `import * as X` assumed to be a value

	// NamedImports: `import { A, type B } from '...'`
	const typeExports = typeOnlyExportNames(targetFile);
	return namedBindings.elements.some((element) => {
		if (element.isTypeOnly) return false; // `import { type X }`
		const importedName = (element.propertyName ?? element.name).text;
		return !typeExports.has(importedName);
	});
}

const deps = new Set();

for (const triggerPath of triggers) {
	for (const file of sourceFilesFor(triggerPath)) {
		for (const statement of parseSourceFile(file).statements) {
			if (!ts.isImportDeclaration(statement)) continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

			const targetFile = resolveLocalImport(
				statement.moduleSpecifier.text,
				file
			);
			if (!targetFile) continue;
			if (!importsAValue(statement.importClause, targetFile)) continue;

			deps.add(path.relative(repoRoot, targetFile));
		}
	}
}

for (const dep of deps) console.log(dep);
