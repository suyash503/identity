// IDENTITY backup server: one user, a few paired phones, snapshots in D1, photos in R2 (once enabled).

/** PHOTOS is optional so the server works before R2 is switched on. */
type AppEnv = Env & { PHOTOS?: R2Bucket }

const PAIR_TTL_MS = 10 * 60_000
const MAX_PENDING_PAIRINGS = 5
const KEEP_SNAPSHOTS = 60
const MAX_SNAPSHOT_BYTES = 1_900_000 // D1 rows top out at 2 MB
const MAX_PHOTO_BYTES = 5_000_000

const json = (data: unknown, status = 200) => Response.json(data, { status })
const error = (message: string, status: number) => json({ error: message }, status)

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)))
const sha256 = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))

function corsHeaders(req: Request, env: AppEnv): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (!env.ALLOWED_ORIGINS.split(',').includes(origin)) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Expose-Headers': 'x-created-at',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    let res: Response
    try {
      res = await route(req, env)
    } catch (e) {
      console.error(e)
      res = error('Server error', 500)
    }
    const out = new Response(res.body, res)
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v)
    return out
  },
} satisfies ExportedHandler<AppEnv>

async function route(req: Request, env: AppEnv): Promise<Response> {
  const { pathname } = new URL(req.url)
  const method = req.method

  if (pathname === '/v1/health') return json({ ok: true })
  if (pathname === '/v1/pair/start' && method === 'POST') return pairStart(req, env)
  const pair = pathname.match(/^\/v1\/pair\/([a-f0-9]{32})$/)
  if (pair && method === 'GET') return pairPoll(pair[1], env)

  const deviceId = await authenticate(req, env)
  if (!deviceId) return error('This phone is not paired', 401)

  if (pathname === '/v1/status' && method === 'GET') return status(env)
  if (pathname === '/v1/snapshot' && method === 'POST') return putSnapshot(req, env, deviceId)
  if (pathname === '/v1/snapshot/latest' && method === 'GET') return getSnapshot(env)
  if (pathname === '/v1/photos' && method === 'GET') return listPhotos(env)
  const photo = pathname.match(/^\/v1\/photos\/([\w-]{1,64})\/(full|thumb)$/)
  if (photo && method === 'PUT') return putPhoto(req, env, photo[1], photo[2] as 'full' | 'thumb')
  if (photo && method === 'GET') return getPhoto(env, photo[1], photo[2] as 'full' | 'thumb')

  return error('Not found', 404)
}

// ── Pairing ──

async function pairStart(req: Request, env: AppEnv) {
  const since = Date.now() - PAIR_TTL_MS
  const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM pairings WHERE created_at > ?').bind(since).first<{ n: number }>()
  if ((pending?.n ?? 0) >= MAX_PENDING_PAIRINGS) return error('Too many pairing attempts. Try again in a few minutes.', 429)

  const body = (await req.json().catch(() => ({}))) as { name?: unknown }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'Phone'
  const id = randomHex(16)
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
  const now = Date.now()
  await env.DB.prepare('INSERT INTO pairings (id, code, name, created_at) VALUES (?, ?, ?, ?)').bind(id, code, name, now).run()
  return json({ id, code, expiresAt: now + PAIR_TTL_MS })
}

async function pairPoll(id: string, env: AppEnv) {
  const row = await env.DB.prepare('SELECT name, created_at, approved, consumed FROM pairings WHERE id = ?')
    .bind(id)
    .first<{ name: string; created_at: number; approved: number; consumed: number }>()
  if (!row || row.consumed) return error('Unknown pairing', 404)
  if (!row.approved) {
    if (Date.now() - row.created_at > PAIR_TTL_MS) return json({ status: 'expired' })
    return json({ status: 'waiting' })
  }
  // Approved: hand out a token exactly once.
  const claim = await env.DB.prepare('UPDATE pairings SET consumed = 1 WHERE id = ? AND consumed = 0').bind(id).run()
  if (claim.meta.changes !== 1) return error('Unknown pairing', 404)
  const token = randomHex(32)
  const deviceId = randomHex(8)
  await env.DB.prepare('INSERT INTO devices (id, token_hash, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(deviceId, await sha256(token), row.name, Date.now())
    .run()
  return json({ status: 'paired', token, deviceId })
}

async function authenticate(req: Request, env: AppEnv): Promise<string | null> {
  const token = req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!token) return null
  const device = await env.DB.prepare('SELECT id FROM devices WHERE token_hash = ? AND revoked = 0').bind(await sha256(token)).first<{ id: string }>()
  if (!device) return null
  await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(Date.now(), device.id).run()
  return device.id
}

// ── Snapshots ──

async function status(env: AppEnv) {
  const latest = await env.DB.prepare('SELECT created_at, size FROM snapshots ORDER BY id DESC LIMIT 1').first<{ created_at: number; size: number }>()
  const photos = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE has_full = 1 AND has_thumb = 1').first<{ n: number }>()
  return json({ photoStorage: !!env.PHOTOS, latest: latest ?? null, photos: photos?.n ?? 0 })
}

async function putSnapshot(req: Request, env: AppEnv, deviceId: string) {
  const data = await req.arrayBuffer()
  if (data.byteLength === 0) return error('Empty snapshot', 400)
  if (data.byteLength > MAX_SNAPSHOT_BYTES) return error('Snapshot too large', 413)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO snapshots (created_at, device_id, size, data) VALUES (?, ?, ?, ?)').bind(now, deviceId, data.byteLength, data),
    env.DB.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)').bind(KEEP_SNAPSHOTS),
  ])
  return json({ ok: true, createdAt: now })
}

async function getSnapshot(env: AppEnv) {
  const row = await env.DB.prepare('SELECT created_at, data FROM snapshots ORDER BY id DESC LIMIT 1').first<{ created_at: number; data: ArrayBuffer | number[] }>()
  if (!row) return error('No backup yet', 404)
  return new Response(new Uint8Array(row.data), {
    headers: { 'content-type': 'application/gzip', 'x-created-at': String(row.created_at), 'cache-control': 'no-store' },
  })
}

// ── Photos ──

async function listPhotos(env: AppEnv) {
  const { results } = await env.DB.prepare('SELECT key FROM photos WHERE has_full = 1 AND has_thumb = 1').all<{ key: string }>()
  return json(results.map((r) => r.key))
}

async function putPhoto(req: Request, env: AppEnv, key: string, kind: 'full' | 'thumb') {
  if (!env.PHOTOS) return error('Photo storage is not enabled yet', 503)
  const data = await req.arrayBuffer()
  if (data.byteLength === 0 || data.byteLength > MAX_PHOTO_BYTES) return error('Bad photo size', 413)
  await env.PHOTOS.put(`photos/${key}/${kind}.jpg`, data, { httpMetadata: { contentType: 'image/jpeg' } })
  const full = kind === 'full' ? 1 : 0
  await env.DB.prepare(
    `INSERT INTO photos (key, has_full, has_thumb, uploaded_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET has_full = max(has_full, excluded.has_full), has_thumb = max(has_thumb, excluded.has_thumb), uploaded_at = excluded.uploaded_at`,
  )
    .bind(key, full, 1 - full, Date.now())
    .run()
  return json({ ok: true })
}

async function getPhoto(env: AppEnv, key: string, kind: 'full' | 'thumb') {
  if (!env.PHOTOS) return error('Photo storage is not enabled yet', 503)
  const obj = await env.PHOTOS.get(`photos/${key}/${kind}.jpg`)
  if (!obj) return error('Not found', 404)
  return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } })
}
