import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate'
import { db, type Habit, type Log, type Miss, type Photo, type RivalDay, type Setting } from '../db'
import { dayKeyOf, type DayKey } from './day'

const FORMAT = 'identity-backup'
const VERSION = 1

/** Secrets and bookkeeping that stay on this device and never go into a backup file. */
const LOCAL_ONLY = new Set(['githubToken', 'githubSync', 'lastBackup'])

type PhotoMeta = Omit<Photo, 'blob' | 'thumb'> & { id: number }

interface Manifest {
  format: typeof FORMAT
  version: number
  exportedAt: number
  habits: Habit[]
  logs: Log[]
  misses: Miss[]
  settings: Setting[]
  rival: RivalDay[]
  photos: PhotoMeta[]
}

export interface BackupSummary {
  exportedAt: number
  startDay?: DayKey
  days: number
  seals: number
  photos: number
}

export interface ParsedBackup {
  manifest: Manifest
  files: Unzipped
  summary: BackupSummary
}

const zipAsync = (files: Zippable) =>
  new Promise<Uint8Array>((resolve, reject) => zip(files, (err, data) => (err ? reject(err) : resolve(data))))
const unzipAsync = (data: Uint8Array) =>
  new Promise<Unzipped>((resolve, reject) => unzip(data, (err, files) => (err ? reject(err) : resolve(files))))

function summarize(m: Manifest): BackupSummary {
  const startDay = m.settings.find((s) => s.key === 'startDay')?.value as DayKey | undefined
  return {
    exportedAt: m.exportedAt,
    startDay,
    days: new Set(m.logs.map((l) => l.day)).size,
    seals: m.logs.length,
    photos: m.photos.length,
  }
}

/** Everything in one .zip: backup.json plus the photos as plain JPEGs you can open anywhere. */
export async function createBackup(): Promise<{ file: File; summary: BackupSummary }> {
  const [habits, logs, misses, settings, rival, photos] = await Promise.all([
    db.habits.toArray(),
    db.logs.toArray(),
    db.misses.toArray(),
    db.settings.toArray(),
    db.rival.toArray(),
    db.photos.toArray(),
  ])

  const files: Zippable = {}
  for (const p of photos) {
    // JPEGs are already compressed; storing them avoids burning CPU for nothing.
    files[`photos/${p.id}.jpg`] = [new Uint8Array(await p.blob.arrayBuffer()), { level: 0 }]
    files[`thumbs/${p.id}.jpg`] = [new Uint8Array(await p.thumb.arrayBuffer()), { level: 0 }]
  }

  const manifest: Manifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    habits,
    logs,
    misses,
    settings: settings.filter((s) => !LOCAL_ONLY.has(s.key)),
    rival,
    photos: photos.map(({ blob: _b, thumb: _t, ...meta }) => meta as PhotoMeta),
  }
  files['backup.json'] = strToU8(JSON.stringify(manifest))

  const data = await zipAsync(files)
  const file = new File([data as BlobPart], `identity-backup-${dayKeyOf()}.zip`, { type: 'application/zip' })
  return { file, summary: summarize(manifest) }
}

export async function readBackup(file: Blob): Promise<ParsedBackup> {
  let files: Unzipped
  try {
    files = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('That file isn’t an IDENTITY backup (not a zip).')
  }
  const raw = files['backup.json']
  if (!raw) throw new Error('That zip isn’t an IDENTITY backup (no backup.json).')
  const manifest = JSON.parse(strFromU8(raw)) as Manifest
  if (manifest.format !== FORMAT) throw new Error('That zip isn’t an IDENTITY backup.')
  if (manifest.version > VERSION) throw new Error('This backup was made by a newer version of the app. Update first.')
  const missing = manifest.photos.find((p) => !files[`photos/${p.id}.jpg`] || !files[`thumbs/${p.id}.jpg`])
  if (missing) throw new Error('This backup is incomplete: some photos are missing.')
  return { manifest, files, summary: summarize(manifest) }
}

/** Replaces everything on this device with the backup. Local-only settings (like the GitHub token) are kept. */
export async function restoreBackup({ manifest, files }: ParsedBackup) {
  const photos: Photo[] = manifest.photos.map((p) => ({
    ...p,
    blob: new Blob([files[`photos/${p.id}.jpg`] as BlobPart], { type: 'image/jpeg' }),
    thumb: new Blob([files[`thumbs/${p.id}.jpg`] as BlobPart], { type: 'image/jpeg' }),
  }))
  const tables = [db.habits, db.logs, db.photos, db.misses, db.settings, db.rival]
  await db.transaction('rw', tables, async () => {
    const keep = (await db.settings.toArray()).filter((s) => LOCAL_ONLY.has(s.key) && s.key !== 'lastBackup')
    await Promise.all(tables.map((t) => t.clear()))
    await db.habits.bulkAdd(manifest.habits)
    await db.logs.bulkAdd(manifest.logs)
    await db.photos.bulkAdd(photos)
    await db.misses.bulkAdd(manifest.misses)
    await db.rival.bulkAdd(manifest.rival)
    await db.settings.bulkPut([...manifest.settings.filter((s) => !LOCAL_ONLY.has(s.key)), ...keep])
    // A restore counts as a backup you already have.
    await db.settings.put({ key: 'lastBackup', value: manifest.exportedAt })
  })
}

/** Share sheet on Android (e.g. "Save to Drive"); a plain download everywhere else. */
export async function saveBackupFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'IDENTITY backup' })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // Share failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

const WEEK_MS = 7 * 86_400_000

/** Nag only once there's something worth losing: 3+ days of use without a backup, or a backup older than a week. */
export function backupOverdue(lastBackup: number | undefined, sealCount: number, daysSinceStart: number): boolean {
  if (sealCount === 0) return false
  return lastBackup ? Date.now() - lastBackup > WEEK_MS : daysSinceStart >= 3
}

export function backupAgo(lastBackup: number): string {
  const days = Math.floor((Date.now() - lastBackup) / 86_400_000)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
