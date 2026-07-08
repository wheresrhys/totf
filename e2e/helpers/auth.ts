import type { Page } from '@playwright/test'
import path from 'path'

type Group = 'alpha' | 'beta' | 'gamma' | 'delta'

const AUTH_DIR = path.resolve(process.cwd(), 'e2e', '.auth')

const credentials: Record<Group, { name: string; password: string }> = {
	alpha: { name: 'Alpha', password: 'alphapassword' },
	beta: { name: 'Beta', password: 'betapassword' },
	gamma: { name: 'Gamma', password: 'gammapassword' },
	delta: { name: 'Delta', password: 'deltapassword' },
}

export async function loginAs(group: Group, page: Page): Promise<void> {
	const { name, password } = credentials[group]
	await page.goto('/')
	await page.selectOption('select[name="groupId"]', { label: name })
	await page.fill('input[name="password"]', password)
	await page.click('button[type="submit"]')
	await page.waitForSelector('nav')
	await page.context().storageState({ path: path.join(AUTH_DIR, `${group}.json`) })
}
