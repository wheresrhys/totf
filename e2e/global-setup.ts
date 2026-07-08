import { execSync } from 'child_process'
import { mkdirSync } from 'fs'
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

export default async function globalSetup() {
	mkdirSync(path.join(ROOT, 'e2e', '.auth'), { recursive: true })
	if (isAlreadySeeded()) {
		console.log('DB already seeded, skipping seed step')
		return
	}
	execSync('npm run db:seed:e2e', { stdio: 'inherit', cwd: ROOT })
}
