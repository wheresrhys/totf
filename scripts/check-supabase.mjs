const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'

try {
  const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch (err) {
  console.error(`\nError: Local Supabase not running (${err.message}).\nFix: npm run db:start:local\n`)
  process.exit(1)
}
