import { readFileSync } from 'fs'
import path from 'path'

const filePath = path.resolve(process.cwd(), 'e2e', 'group-slugs.json')
const groupSlugs = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, string>

export const alphaSlug = groupSlugs.alpha
export const betaSlug = groupSlugs.beta
export const gammaSlug = groupSlugs.gamma
export const deltaSlug = groupSlugs.delta
