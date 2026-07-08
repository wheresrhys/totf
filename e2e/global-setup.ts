import { execSync } from 'child_process'
import { mkdirSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()

export default async function globalSetup() {
	mkdirSync(path.join(ROOT, 'e2e', '.auth'), { recursive: true })
	execSync('npm run db:seed:e2e', { stdio: 'inherit', cwd: ROOT })
}
