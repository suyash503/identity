// Approves a phone's pairing code: `npm run approve -- 123456`
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Run wrangler's JS entry with node directly: no shell, so the SQL survives quoting on Windows.
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))

const code = process.argv[2]
if (!/^\d{6}$/.test(code ?? '')) {
  console.error('Usage: npm run approve -- <6-digit code shown on the phone>')
  process.exit(1)
}
const since = Date.now() - 10 * 60_000
const sql = `UPDATE pairings SET approved = 1 WHERE code = '${code}' AND consumed = 0 AND created_at > ${since}`
const out = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'identity', '--remote', '--json', '--command', sql], { encoding: 'utf8' })
const changes = JSON.parse(out)[0]?.meta?.changes ?? 0
console.log(changes ? `Approved. The phone will connect in a few seconds.` : `No pending request with code ${code} (codes expire after 10 minutes).`)
