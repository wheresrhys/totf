const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

try {
	await fetch(`${url}/rest/v1/`, {
		signal: AbortSignal.timeout(5000)
	});
} catch (err) {
	console.error(
		`\nError: Local Supabase not running (${err.message}).\nFix: npm run db:start:local\n`
	);
	process.exit(1);
}
