// IDENTITY backup server: one user, a few paired phones, snapshots in D1, photos in D1 photo databases,
// and push notifications (Alankrit's moves, danger days, evening check) from a 15-minute cron.
import { runNotifications, sendPush, subscriptionsFor, type AppState, type NotifyEnv, type PushPrefs } from './notify'

type AppEnv = NotifyEnv

const PAIR_TTL_MS = 10 * 60_000
const MAX_PENDING_PAIRINGS = 5
const KEEP_SNAPSHOTS = 60
const MAX_SNAPSHOT_BYTES = 1_900_000 // D1 rows top out at 2 MB
const MAX_PHOTO_BYTES = 1_900_000 // D1 rows top out at 2 MB
const MAX_STATE_BYTES = 500_000

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

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runNotifications(env))
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
  if (pathname === '/v1/state' && method === 'PUT') return putState(req, env)
  if (pathname === '/v1/rival' && method === 'GET') return getRivalDays(req, env)
  if (pathname === '/v1/push/subscribe' && method === 'POST') return pushSubscribe(req, env, deviceId)
  if (pathname === '/v1/push/unsubscribe' && method === 'POST') return pushUnsubscribe(req, env, deviceId)
  if (pathname === '/v1/push/test' && method === 'POST') return pushTest(env, deviceId)

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
  const photos = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM photos WHERE has_full = 1 AND has_thumb = 1').first<{
    n: number
    bytes: number
  }>()
  return json({
    photoStorage: shardNames(env).length > 0,
    latest: latest ?? null,
    photos: photos?.n ?? 0,
    photoBytes: photos?.bytes ?? 0,
    photoCapacity: shardNames(env).length * shardLimit(env),
  })
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

// ── Photos: bytes in D1 photo databases ("shards"), the index in the main database ──

const shardNames = (env: AppEnv) => env.PHOTO_SHARDS.split(',').map((s) => s.trim()).filter(Boolean)
const shardLimit = (env: AppEnv) => Number(env.PHOTO_SHARD_LIMIT_MB) * 1_048_576

function shardDb(env: AppEnv, name: string): D1Database | undefined {
  const binding = (env as unknown as Record<string, unknown>)[name] as D1Database | undefined
  return typeof binding?.prepare === 'function' ? binding : undefined
}

async function listPhotos(env: AppEnv) {
  const { results } = await env.DB.prepare('SELECT key FROM photos WHERE has_full = 1 AND has_thumb = 1').all<{ key: string }>()
  return json(results.map((r) => r.key))
}

async function putPhoto(req: Request, env: AppEnv, key: string, kind: 'full' | 'thumb') {
  const data = await req.arrayBuffer()
  if (data.byteLength === 0 || data.byteLength > MAX_PHOTO_BYTES) return error('Bad photo size', 413)

  // Keep a photo's full and thumb together; new photos go to the newest photo database.
  const existing = await env.DB.prepare('SELECT shard FROM photos WHERE key = ?').bind(key).first<{ shard: string | null }>()
  const shard = existing?.shard ?? shardNames(env).at(-1)
  const db = shard && shardDb(env, shard)
  if (!db) return error('Photo storage is not set up', 503)

  const used = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM photos WHERE shard = ?').bind(shard).first<{ bytes: number }>()
  if ((used?.bytes ?? 0) + data.byteLength > shardLimit(env)) return error('Cloud photo storage is full. A new photo database needs to be added.', 507)

  await db.prepare('INSERT OR REPLACE INTO blobs (key, kind, data) VALUES (?, ?, ?)').bind(key, kind, data).run()
  const full = kind === 'full' ? 1 : 0
  await env.DB.prepare(
    `INSERT INTO photos (key, has_full, has_thumb, uploaded_at, shard, bytes) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET has_full = max(has_full, excluded.has_full), has_thumb = max(has_thumb, excluded.has_thumb),
       uploaded_at = excluded.uploaded_at, shard = excluded.shard, bytes = photos.bytes + excluded.bytes`,
  )
    .bind(key, full, 1 - full, Date.now(), shard, data.byteLength)
    .run()
  return json({ ok: true })
}

async function getPhoto(env: AppEnv, key: string, kind: 'full' | 'thumb') {
  const row = await env.DB.prepare('SELECT shard FROM photos WHERE key = ?').bind(key).first<{ shard: string | null }>()
  const db = row?.shard ? shardDb(env, row.shard) : undefined
  if (!db) return error('Not found', 404)
  const blob = await db.prepare('SELECT data FROM blobs WHERE key = ? AND kind = ?').bind(key, kind).first<{ data: ArrayBuffer | number[] }>()
  if (!blob) return error('Not found', 404)
  return new Response(new Uint8Array(blob.data), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } })
}

// ── State for notifications ──

async function putState(req: Request, env: AppEnv) {
  const text = await req.text()
  if (text.length > MAX_STATE_BYTES) return error('State too large', 413)
  const state = JSON.parse(text) as AppState
  if (!Array.isArray(state.habits) || !Array.isArray(state.logs) || !Array.isArray(state.rival) || typeof state.startDay !== 'string') {
    return error('Bad state', 400)
  }
  await env.DB.prepare('INSERT OR REPLACE INTO state (id, updated_at, data) VALUES (1, ?, ?)').bind(Date.now(), text).run()
  return json({ ok: true })
}

/** Days the server locked in for Alankrit, so the app uses exactly the same ones. */
async function getRivalDays(req: Request, env: AppEnv) {
  const since = new URL(req.url).searchParams.get('since') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return error('Bad date', 400)
  const { results } = await env.DB.prepare('SELECT data FROM rival_days WHERE day >= ? ORDER BY day').bind(since).all<{ data: string }>()
  return json(results.map((r) => JSON.parse(r.data)))
}

// ── Push subscriptions ──

async function pushSubscribe(req: Request, env: AppEnv, deviceId: string) {
  const body = (await req.json().catch(() => null)) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    timeZone?: string
    prefs?: Partial<PushPrefs>
  } | null
  const sub = body?.subscription
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys.auth) return error('Bad subscription', 400)
  const timeZone = typeof body?.timeZone === 'string' ? body.timeZone : 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone })
  } catch {
    return error('Bad time zone', 400)
  }
  const prefs: PushPrefs = { rival: body?.prefs?.rival !== false, danger: body?.prefs?.danger !== false, evening: body?.prefs?.evening !== false }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, device_id, p256dh, auth, time_zone, prefs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth,
       time_zone = excluded.time_zone, prefs = excluded.prefs`,
  )
    .bind(sub.endpoint, deviceId, sub.keys.p256dh, sub.keys.auth, timeZone, JSON.stringify(prefs), Date.now())
    .run()
  return json({ ok: true, prefs })
}

async function pushUnsubscribe(req: Request, env: AppEnv, deviceId: string) {
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null
  if (!body?.endpoint) return error('Missing endpoint', 400)
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id = ?').bind(body.endpoint, deviceId).run()
  return json({ ok: true })
}

async function pushTest(env: AppEnv, deviceId: string) {
  const subs = await subscriptionsFor(env, deviceId)
  if (!subs.length) return error('This phone has no notification subscription. Turn notifications off and on again.', 404)
  const statuses: number[] = []
  for (const sub of subs) statuses.push(await sendPush(env, sub, { title: 'IDENTITY', body: 'Notifications work. Alankrit is watching.', tag: 'test' }))
  if (statuses.some((s) => s >= 200 && s < 300)) return json({ ok: true })
  return error(`The push service refused the test (HTTP ${statuses.join(', ')}). Turn notifications off and on again.`, 502)
}
