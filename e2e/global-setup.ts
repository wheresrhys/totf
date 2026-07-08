import { execSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function isAlreadySeeded(): boolean {
	try {
		const result = execSync(
			`psql "${LOCAL_DB_URL}" -t -c "SELECT COUNT(*) FROM \\"RingingGroups\\" WHERE group_name IN ('Alpha', 'Beta', 'Gamma')"`,
			{ encoding: 'utf8' }
		)
		return result.trim() === '3'
	} catch {
		return false
	}
}

function getGroupIds(): Record<string, number> {
	const result = execSync(
		`psql "${LOCAL_DB_URL}" -t -A -F , -c "SELECT lower(group_name), id FROM \\"RingingGroups\\" WHERE group_name IN ('Alpha', 'Beta', 'Gamma') ORDER BY group_name"`,
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
}
