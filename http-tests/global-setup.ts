import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(BASE_URL)
    return true
  } catch {
    return false
  }
}

async function waitForServer(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isServerRunning()) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Server at ${BASE_URL} did not start within ${timeoutMs}ms`)
}

let serverProcess: ChildProcess | null = null

export async function setup() {
  if (await isServerRunning()) return
  serverProcess = spawn('npm', ['run', 'next:dev'], {
    stdio: 'inherit',
    detached: false,
  })
  await waitForServer()
}

export async function teardown() {
  serverProcess?.kill()
}
