import { describe, test, expect } from 'vitest'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

const LOGIN_MODAL_TEXT = 'Login to your group'

const ownGroupRoutes = [
  '/',
  '/bird',
  '/bird/A123456',
  '/species',
  '/species/Blue%20Tit',
  '/effort',
  '/mistakes',
  '/retraps',
  '/sessions',
]

const crossGroupRoutes = [
  '/group/1',
  '/group/1/species',
  '/group/1/species/Blue%20Tit',
  '/group/1/effort',
  '/group/1/mistakes',
  '/group/1/retraps',
  '/group/1/sessions',
  '/group/1/session/2024-01-01',
  '/group/1/session/2024-01-01/site/1',
]

describe('own-group routes (unauthenticated)', () => {
  test.each(ownGroupRoutes)('%s shows login modal', async (route) => {
    const response = await fetch(BASE_URL + route)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain(LOGIN_MODAL_TEXT)
  })
})

describe('cross-group routes (unauthenticated)', () => {
  test.each(crossGroupRoutes)('%s redirects', async (route) => {
    const response = await fetch(BASE_URL + route, { redirect: 'manual' })
    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
  })
})
