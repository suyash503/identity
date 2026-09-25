import { db, setSetting, type Photo } from '../db'
import { buildManifest, photoKey, replaceAllData, summarize, validateManifest, type BackupSummary, type Manifest } from './backup'

/** The IDENTITY backup server (worker/). Not a secret: every request needs a paired device token. */
export const CLOUD_URL = 'https://identity-api.suyashsingh2711.workers.dev'

export interface CloudSyncState {
  at: number
  error?: string
  photoStorage?: boolean
  photosSafe?: number
  photosPending?: number
  /** A freshly paired, empty phone found an existing cloud backup: restore it instead of overwriting it. */
  needsRestore?: boolean
}

class NotPaired extends Error {}

async function call(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(CLOUD_URL + path, {
      ...init,
      cache: 'no-store',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    })
  } catch {
    throw new Error('Can’t reach the cloud. Are you offline?')
  }
  if (res.status === 401) throw new NotPaired('This phone was disconnected from the cloud. Connect it again.')
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Cloud error ${res.status}`)
  }
  return res
}

const getToken = async () => (await db.settings.get('cloudToken'))?.value as string | undefined

async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const gzip = (text: string) => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
const gunzip = (blob: Blob) => new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()

// ── Pairing: the phone shows a code, it's approved on the computer, the phone gets its own token ──

export async function startPairing(): Promise<{ id: string; code: string; expiresAt: number }> {
  const name = /Android/i.test(navigator.userAgent) ? 'Android phone' : 'Browser'
  const res = await call('/v1/pair/start', undefined, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function pollPairing(id: string): Promise<'waiting' | 'paired' | 'expired'> {
  const d = (await (await call(`/v1/pair/${id}`)).json()) as { status: 'waiting' | 'paired' | 'expired'; token?: string }
  if (d.status === 'paired' && d.token) {
    await setSetting('cloudToken', d.token)
    await db.settings.delete('cloudHash')
    void syncCloud()
  }
  return d.status
}

export async function disconnectCloud() {
  await db.settings.bulkDelete(['cloudToken', 'cloudSync', 'cloudHash'])
}

// ── Sync ──

let running: Promise<void> | undefined

/** Uploads a snapshot when anything changed, then any photos the cloud doesn't have yet. */
export function syncCloud(): Promise<void> {
  running ??= doSync().finally(() => (running = undefined))
  return running
}

async function doSync() {
  const token = await getToken()
  if (!token) return
  try {
    const manifest = await buildManifest()
    const status = (await (await call('/v1/status', token)).json()) as { photoStorage: boolean; latest: { created_at: number } | null }
    const prevHash = (await db.settings.get('cloudHash'))?.value

    // A new or wiped phone must never replace the real backup with an empty one.
    if (!prevHash && manifest.logs.length === 0 && status.latest) {
      await setSetting('cloudSync', { at: Date.now(), photoStorage: status.photoStorage, needsRestore: true } satisfies CloudSyncState)
      return
    }

    const { exportedAt: _, ...content } = manifest
    const hash = await sha256(JSON.stringify(content))
    if (hash !== prevHash) {
      await call('/v1/snapshot', token, { method: 'POST', headers: { 'content-type': 'application/gzip' }, body: await gzip(JSON.stringify(manifest)) })
      await setSetting('cloudHash', hash)
    }

    let pending = manifest.photos.length
    if (status.photoStorage) {
      const have = new Set((await (await call('/v1/photos', token)).json()) as string[])
      pending = 0
      for (const meta of manifest.photos) {
        const key = photoKey(meta)
        if (have.has(key)) continue
        const p = await db.photos.get(meta.id)
        if (!p) continue
        await call(`/v1/photos/${key}/full`, token, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: p.blob })
        await call(`/v1/photos/${key}/thumb`, token, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: p.thumb })
      }
    }

    await setSetting('cloudSync', {
      at: Date.now(),
      photoStorage: status.photoStorage,
      photosSafe: manifest.photos.length - pending,
      photosPending: pending,
    } satisfies CloudSyncState)
    // Only a backup with the photos counts as fully backed up.
    if (pending === 0) await setSetting('lastBackup', Date.now())
  } catch (e) {
    if (e instanceof NotPaired) await disconnectCloud()
    const prev = (await db.settings.get('cloudSync'))?.value as CloudSyncState | undefined
    await setSetting('cloudSync', { ...prev, at: Date.now(), error: (e as Error).message } satisfies CloudSyncState)
  }
}

// ── Restore ──

export async function fetchCloudBackup(): Promise<{ manifest: Manifest; summary: BackupSummary }> {
  const token = await getToken()
  if (!token) throw new Error('This phone isn’t connected to the cloud.')
  const res = await call('/v1/snapshot/latest', token)
  const manifest = JSON.parse(await gunzip(await res.blob())) as Manifest
  validateManifest(manifest)
  return { manifest, summary: summarize(manifest) }
}

export async function restoreFromCloud(manifest: Manifest, onProgress?: (done: number, total: number) => void) {
  const token = await getToken()
  if (!token) throw new Error('This phone isn’t connected to the cloud.')
  const status = (await (await call('/v1/status', token)).json()) as { photoStorage: boolean }
  const photos: Photo[] = []
  if (status.photoStorage) {
    for (const [i, meta] of manifest.photos.entries()) {
      const key = photoKey(meta)
      const [blob, thumb] = await Promise.all([
        call(`/v1/photos/${key}/full`, token).then((r) => r.blob()),
        call(`/v1/photos/${key}/thumb`, token).then((r) => r.blob()),
      ])
      photos.push({ ...meta, blob, thumb })
      onProgress?.(i + 1, manifest.photos.length)
    }
  }
  // Without photo storage the history still comes back; seals just show without their photo.
  const restored = status.photoStorage ? manifest : { ...manifest, photos: [], logs: manifest.logs.map(({ photoId: _, ...l }) => l) }
  await replaceAllData(restored, photos)
  if (!status.photoStorage) await db.settings.delete('lastBackup')
}
