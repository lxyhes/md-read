import Database from '@tauri-apps/plugin-sql'
import type { Annotation, DocumentRecord, ReaderDocument, ReadingProgress } from './types'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
let database: Awaited<ReturnType<typeof Database.load>> | null = null

async function getDatabase() {
  if (!isTauri()) return null
  if (!database) {
    database = await Database.load('sqlite:moyue.db')
    await database.execute(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, source_hash TEXT NOT NULL, source TEXT, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS progress (document_id TEXT PRIMARY KEY, region_id TEXT, heading_id TEXT, scroll_percent REAL NOT NULL, reading_time INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, region_id TEXT NOT NULL, selected_text TEXT NOT NULL, color TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL);`)
  }
  return database
}

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as T } catch { return fallback }
}

function writeJson(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)) }

export async function saveDocument(document: DocumentRecord): Promise<void> {
  writeJson(`moyue:document:${document.id}`, document)
  const db = await getDatabase()
  await db?.execute('INSERT OR REPLACE INTO documents (id, path, title, source_hash, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [document.id, document.path, document.title, document.sourceHash, document.source ?? null, document.updatedAt])
}

export async function saveDocumentSnapshot(document: ReaderDocument): Promise<void> {
  const existing = readJson<ReaderDocument[]>('moyue:documents:full', [])
  writeJson('moyue:documents:full', [...existing.filter((item) => item.id !== document.id), document])
}

export async function deleteDocument(documentId: string): Promise<void> {
  const existing = readJson<ReaderDocument[]>('moyue:documents:full', [])
  writeJson('moyue:documents:full', existing.filter((item) => item.id !== documentId))
  localStorage.removeItem(`moyue:document:${documentId}`)
  localStorage.removeItem(`moyue:progress:${documentId}`)
  localStorage.removeItem(`moyue:annotations:${documentId}`)
  const db = await getDatabase()
  await db?.execute('DELETE FROM documents WHERE id = ?', [documentId])
  await db?.execute('DELETE FROM progress WHERE document_id = ?', [documentId])
  await db?.execute('DELETE FROM annotations WHERE document_id = ?', [documentId])
}

export function loadDocumentSnapshots(): ReaderDocument[] {
  return readJson<ReaderDocument[]>('moyue:documents:full', [])
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  writeJson(`moyue:progress:${progress.documentId}`, progress)
  const db = await getDatabase()
  await db?.execute('INSERT OR REPLACE INTO progress (document_id, region_id, heading_id, scroll_percent, reading_time, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [progress.documentId, progress.regionId, progress.headingId, progress.scrollPercent, progress.readingTime, progress.updatedAt])
}

export async function getProgress(documentId: string): Promise<ReadingProgress | null> {
  const local = readJson<ReadingProgress | null>(`moyue:progress:${documentId}`, null)
  if (local) return local
  const db = await getDatabase()
  if (!db) return null
  const rows = await db.select<ReadingProgress[]>('SELECT document_id as documentId, region_id as regionId, heading_id as headingId, scroll_percent as scrollPercent, reading_time as readingTime, updated_at as updatedAt FROM progress WHERE document_id = ?', [documentId])
  return rows[0] ?? null
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const key = `moyue:annotations:${annotation.documentId}`
  const existing = readJson<Annotation[]>(key, [])
  writeJson(key, [...existing.filter((item) => item.id !== annotation.id), annotation])
  const db = await getDatabase()
  await db?.execute('INSERT OR REPLACE INTO annotations (id, document_id, region_id, selected_text, color, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [annotation.id, annotation.documentId, annotation.regionId, annotation.selectedText, annotation.color, annotation.note, annotation.createdAt])
}

export function loadAnnotations(documentId: string): Annotation[] {
  return readJson<Annotation[]>(`moyue:annotations:${documentId}`, [])
}
