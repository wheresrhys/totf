import { execSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function isAlreadySeeded(): boolean {
	try {
		const result = execSync(
			`psql "${LOCAL_DB_URL}" -t -c "SELECT COUNT(*) FROM \\"RingingGroups\\" WHERE group_name IN ('Alpha', 'Beta', 'Gamma', 'Delta')"`,
			{ encoding: 'utf8' }
		)
		return result.trim() === '4'
	} catch {
		return false
	}
}

function getGroupIds(): Record<string, number> {
	const result = execSync(
		`psql "${LOCAL_DB_URL}" -t -A -F , -c "SELECT lower(group_name), id FROM \\"RingingGroups\\" WHERE group_name IN ('Alpha', 'Beta', 'Gamma', 'Delta') ORDER BY group_name"`,
		{ encoding: 'utf8' }
	)
	const ids: Record<string, number> = {}
	for (const line of result.trim().split('\n')) {
		const trimmed = line.trim()
		if (!trimmed) continue
		const commaIdx = trimmed.indexOf(',')
		const name = trimmed.slice(0, commaIdx)
		const id = Number(trimmed.slice(commaIdx + 1))
		ids[name] = id
	}
	return ids
}

// The /group/[groupSlug] route (#490) needs each seed group's actual slug,
// not an assumed lowercased name — read it straight from RingingGroups so
// e2e specs never drift from whatever slugify() produced at seed time.
function getGroupSlugs(): Record<string, string> {
	const result = execSync(
		`psql "${LOCAL_DB_URL}" -t -A -F , -c "SELECT lower(group_name), slug FROM \\"RingingGroups\\" WHERE group_name IN ('Alpha', 'Beta', 'Gamma', 'Delta') ORDER BY group_name"`,
		{ encoding: 'utf8' }
	)
	const slugs: Record<string, string> = {}
	for (const line of result.trim().split('\n')) {
		const trimmed = line.trim()
		if (!trimmed) continue
		const commaIdx = trimmed.indexOf(',')
		const name = trimmed.slice(0, commaIdx)
		const slug = trimmed.slice(commaIdx + 1)
		slugs[name] = slug
	}
	return slugs
}

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

// Pre-warm Next.js page compilation before parallel workers start.
// Without this, 4 workers simultaneously hit uncompiled routes, causing >30s
// compilation timeouts on first request.
async function warmupServer() {
	const routes = [
		'/',
		'/sessions',
		'/species',
		'/mistakes',
		'/retraps',
		'/effort',
		'/ring-sequences',
		'/bird/ARRETRAP',
		'/species/Robin',
	]
	console.log('Warming up server routes...')
	await Promise.all(
		routes.map((route) =>
			fetch(`${BASE_URL}${route}`).catch(() => {
				// Ignore errors (e.g. auth redirects); we only need compilation to run
			})
		)
	)
	console.log('Server warmup complete')
}

export default async function globalSetup() {
	mkdirSync(path.join(ROOT, 'e2e', '.auth'), { recursive: true })
	if (isAlreadySeeded()) {
		console.log('DB already seeded, skipping seed step')
	} else {
		execSync('npm run db:seed:e2e', { stdio: 'inherit', cwd: ROOT })
	}

	const groupIds = getGroupIds()
	writeFileSync(
		path.join(ROOT, 'e2e', 'group-ids.json'),
		JSON.stringify(groupIds, null, 2)
	)
	console.log('Group IDs:', groupIds)

	const groupSlugs = getGroupSlugs()
	writeFileSync(
		path.join(ROOT, 'e2e', 'group-slugs.json'),
		JSON.stringify(groupSlugs, null, 2)
	)
	console.log('Group slugs:', groupSlugs)

	await warmupServer()
}
