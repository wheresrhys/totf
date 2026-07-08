import { readFileSync } from 'fs'
import path from 'path'

const filePath = path.resolve(process.cwd(), 'e2e', 'group-ids.json')
const groupIds = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, number>

export const alphaId = groupIds.alpha
export const betaId = groupIds.beta
export const gammaId = groupIds.gamma
export const deltaId = groupIds.delta
