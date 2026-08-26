import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { deriveWorktreePort } from '../scripts/worktree-test-port'

// Each git worktree gets its own deterministic port (derived from its absolute
// path) so concurrent swarm worktrees never share a dev server — a reused server
// can only ever be one this same worktree started. An explicit TEST_BASE_URL
// still fully overrides this, for pointing at a shared/remote server on purpose.
const PORT = deriveWorktreePort()
const BASE_URL = process.env.TEST_BASE_URL ?? `http://localhost:${PORT}`

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
    // Bind next dev to the worktree's derived port so it matches BASE_URL above.
    // Skip when TEST_BASE_URL is set — that server is external, not spawned here.
    env: process.env.TEST_BASE_URL
      ? process.env
      : { ...process.env, PORT: String(PORT) },
  })
  await waitForServer()
}

export async function teardown() {
  serverProcess?.kill()
}
