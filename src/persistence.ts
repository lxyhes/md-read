import type { Annotation, DocumentRecord, ReaderDocument, ReadingProgress } from './types'
import type { KnowledgeActivity, KnowledgeConversation } from './knowledgeConversations'
import { isTauri as tauriIsTauri } from '@tauri-apps/api/core'

const isTauri = () => tauriIsTauri()
const SNAPSHOT_INDEX_KEY = 'moyue:documents:index'
const LEGACY_SNAPSHOT_KEY = 'moyue:documents:full'
const snapshotKey = (documentId: string) => `moyue:document-snapshot:${documentId}`
const KNOWLEDGE_CONVERSATIONS_KEY = 'moyue:knowledge-conversations'
const KNOWLEDGE_ACTIVITY_KEY = 'moyue:knowledge-activity'
type DatabaseConnection = Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql')['default']['load']>>
let database: DatabaseConnection | null = null
let databasePromise: Promise<DatabaseConnection | null> | null = null

async function getDatabase() {
  if (!isTauri()) return null
  if (database) return database
  return databasePromise ??= (async () => {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    const connection = await Database.load('sqlite:moyue.db')
    await connection.execute(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, source_hash TEXT NOT NULL, source TEXT, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS progress (document_id TEXT PRIMARY KEY, region_id TEXT, heading_id TEXT, scroll_percent REAL NOT NULL, reading_time INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, region_id TEXT NOT NULL, selected_text TEXT NOT NULL, color TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS knowledge_conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, source_ids TEXT NOT NULL, messages TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS knowledge_activity (day TEXT PRIMARY KEY, answer_count INTEGER NOT NULL);`)
    database = connection
    return connection
  })().catch((error: unknown) => {
    databasePromise = null
    throw error
  })
}

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as T } catch { return fallback }
}

function writeJson(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)) }

function snapshotIndex() {
  const saved = readJson<string[]>(SNAPSHOT_INDEX_KEY, [])
  if (saved.length) return saved
  const legacy = readJson<ReaderDocument[]>(LEGACY_SNAPSHOT_KEY, [])
  if (!legacy.length) return []
  for (const document of legacy) writeJson(snapshotKey(document.id), document)
  const ids = legacy.map((document) => document.id)
  writeJson(SNAPSHOT_INDEX_KEY, ids)
  localStorage.removeItem(LEGACY_SNAPSHOT_KEY)
  return ids
}

function validKnowledgeCitation(value: unknown): value is KnowledgeConversation['messages'][number]['citations'][number] {
  if (!value || typeof value !== 'object') return false
  const citation = value as Partial<KnowledgeConversation['messages'][number]['citations'][number]>
  return Number.isFinite(citation.index) && typeof citation.documentId === 'string' && typeof citation.documentTitle === 'string'
    && typeof citation.documentPath === 'string' && typeof citation.regionId === 'string'
    && typeof citation.excerpt === 'string' && typeof citation.sourceHash === 'string'
}

function validKnowledgeMessage(value: unknown): value is KnowledgeConversation['messages'][number] {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<KnowledgeConversation['messages'][number]>
  return typeof message.id === 'string' && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string' && Number.isFinite(message.createdAt)
    && Array.isArray(message.citations) && message.citations.every(validKnowledgeCitation)
}

function validKnowledgeConversations(value: unknown): KnowledgeConversation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const conversation = item as Partial<KnowledgeConversation>
    if (typeof conversation.id !== 'string' || typeof conversation.title !== 'string'
      || !Number.isFinite(conversation.createdAt) || !Number.isFinite(conversation.updatedAt)
      || !Array.isArray(conversation.sourceIds) || !Array.isArray(conversation.messages)) return []
    return [{
      id: conversation.id, title: conversation.title,
      sourceIds: conversation.sourceIds.filter((id): id is string => typeof id === 'string'),
      createdAt: conversation.createdAt!, updatedAt: conversation.updatedAt!,
      messages: conversation.messages.filter(validKnowledgeMessage),
    }]
  })
}

function validKnowledgeActivity(value: unknown): KnowledgeActivity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([day, count]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(count) && Number(count) >= 0
      ? [[day, Math.floor(Number(count))]] : []))
}

function readKnowledgeConversations() {
  return validKnowledgeConversations(readJson<unknown>(KNOWLEDGE_CONVERSATIONS_KEY, []))
}

async function writeKnowledgeConversationToDatabase(database: NonNullable<DatabaseConnection>, conversation: KnowledgeConversation) {
  await database.execute('INSERT OR REPLACE INTO knowledge_conversations (id, title, source_ids, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [conversation.id, conversation.title, JSON.stringify(conversation.sourceIds), JSON.stringify(conversation.messages), conversation.createdAt, conversation.updatedAt])
}

export async function loadKnowledgeConversations(): Promise<KnowledgeConversation[]> {
  const local = readKnowledgeConversations()
  const database = await getDatabase()
  if (!database) return local
  const rows = await database.select<Array<{ id: string; title: string; sourceIds: string; messages: string; createdAt: number; updatedAt: number }>>('SELECT id, title, source_ids as sourceIds, messages, created_at as createdAt, updated_at as updatedAt FROM knowledge_conversations')
  const saved = rows.flatMap((row) => {
    try {
      const conversation = { ...row, sourceIds: JSON.parse(row.sourceIds), messages: JSON.parse(row.messages) }
      return validKnowledgeConversations([conversation])
    } catch { return [] }
  })
  const merged = new Map(local.map((conversation) => [conversation.id, conversation]))
  for (const conversation of saved) {
    const previous = merged.get(conversation.id)
    if (!previous || previous.updatedAt < conversation.updatedAt) merged.set(conversation.id, conversation)
  }
  const conversations = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  writeJson(KNOWLEDGE_CONVERSATIONS_KEY, conversations)
  if (conversations.length !== saved.length) await Promise.all(conversations.map((conversation) => writeKnowledgeConversationToDatabase(database, conversation)))
  return conversations
}

export async function saveKnowledgeConversation(conversation: KnowledgeConversation): Promise<void> {
  const conversations = readKnowledgeConversations()
  writeJson(KNOWLEDGE_CONVERSATIONS_KEY, [conversation, ...conversations.filter((item) => item.id !== conversation.id)])
  const database = await getDatabase()
  if (database) await writeKnowledgeConversationToDatabase(database, conversation)
}

export async function deleteKnowledgeConversation(conversationId: string): Promise<void> {
  writeJson(KNOWLEDGE_CONVERSATIONS_KEY, readKnowledgeConversations().filter((item) => item.id !== conversationId))
  const database = await getDatabase()
  await database?.execute('DELETE FROM knowledge_conversations WHERE id = ?', [conversationId])
}

export async function loadKnowledgeActivity(): Promise<KnowledgeActivity> {
  const local = validKnowledgeActivity(readJson<unknown>(KNOWLEDGE_ACTIVITY_KEY, {}))
  const database = await getDatabase()
  if (!database) return local
  const rows = await database.select<Array<{ day: string; answerCount: number }>>('SELECT day, answer_count as answerCount FROM knowledge_activity')
  if (!rows.length) {
    await Promise.all(Object.entries(local).map(([day, count]) => database.execute('INSERT OR REPLACE INTO knowledge_activity (day, answer_count) VALUES (?, ?)', [day, count])))
    return local
  }
  const activity = { ...local }
  for (const row of rows) {
    const count = Number(row.answerCount)
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isFinite(count) && count >= 0) activity[row.day] = Math.max(activity[row.day] ?? 0, count)
  }
  writeJson(KNOWLEDGE_ACTIVITY_KEY, activity)
  return activity
}

export async function recordKnowledgeAnswer(day: string): Promise<KnowledgeActivity> {
  const activity = validKnowledgeActivity(readJson<unknown>(KNOWLEDGE_ACTIVITY_KEY, {}))
  activity[day] = (activity[day] ?? 0) + 1
  writeJson(KNOWLEDGE_ACTIVITY_KEY, activity)
  const database = await getDatabase()
  await database?.execute('INSERT INTO knowledge_activity (day, answer_count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET answer_count = answer_count + 1', [day])
  return activity
}

export async function saveDocument(document: DocumentRecord): Promise<void> {
  writeJson(`moyue:document:${document.id}`, document)
  const db = await getDatabase()
  await db?.execute('INSERT OR REPLACE INTO documents (id, path, title, source_hash, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [document.id, document.path, document.title, document.sourceHash, document.source ?? null, document.updatedAt])
}

export async function saveDocumentSnapshot(document: ReaderDocument): Promise<void> {
  const ids = snapshotIndex()
  writeJson(snapshotKey(document.id), document)
  if (!ids.includes(document.id)) writeJson(SNAPSHOT_INDEX_KEY, [...ids, document.id])
}

export async function deleteDocument(documentId: string): Promise<void> {
  const ids = snapshotIndex()
  writeJson(SNAPSHOT_INDEX_KEY, ids.filter((id) => id !== documentId))
  localStorage.removeItem(snapshotKey(documentId))
  localStorage.removeItem(`moyue:document:${documentId}`)
  localStorage.removeItem(`moyue:progress:${documentId}`)
  localStorage.removeItem(`moyue:annotations:${documentId}`)
  const db = await getDatabase()
  await db?.execute('DELETE FROM documents WHERE id = ?', [documentId])
  await db?.execute('DELETE FROM progress WHERE document_id = ?', [documentId])
  await db?.execute('DELETE FROM annotations WHERE document_id = ?', [documentId])
}

export function loadDocumentSnapshots(): ReaderDocument[] {
  return snapshotIndex()
    .map((id) => readJson<ReaderDocument | null>(snapshotKey(id), null))
    .filter((document): document is ReaderDocument => Boolean(document))
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  writeJson(`moyue:progress:${progress.documentId}`, progress)
  const db = await getDatabase()
  await db?.execute('INSERT OR REPLACE INTO progress (document_id, region_id, heading_id, scroll_percent, reading_time, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [progress.documentId, progress.regionId, progress.headingId, progress.scrollPercent, progress.readingTime, progress.updatedAt])
}

export async function getProgress(documentId: string): Promise<ReadingProgress | null> {
  const local = getLocalProgress(documentId)
  if (local) return local
  const db = await getDatabase()
  if (!db) return null
  const rows = await db.select<ReadingProgress[]>('SELECT document_id as documentId, region_id as regionId, heading_id as headingId, scroll_percent as scrollPercent, reading_time as readingTime, updated_at as updatedAt FROM progress WHERE document_id = ?', [documentId])
  return rows[0] ?? null
}

export function getLocalProgress(documentId: string): ReadingProgress | null {
  return readJson<ReadingProgress | null>(`moyue:progress:${documentId}`, null)
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const key = `moyue:annotations:${annotation.documentId}`
  const existing = readJson<Annotation[]>(key, [])
  writeJson(key, [...existing.filter((item) => item.id !== annotation.id), annotation])
  const db = await getDatabase()
  await db?.execute('INSERT OR REPLACE INTO annotations (id, document_id, region_id, selected_text, color, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [annotation.id, annotation.documentId, annotation.regionId, annotation.selectedText, annotation.color, annotation.note, annotation.createdAt])
}

export async function deleteAnnotation(annotation: Annotation): Promise<void> {
  const key = `moyue:annotations:${annotation.documentId}`
  const existing = readJson<Annotation[]>(key, [])
  writeJson(key, existing.filter((item) => item.id !== annotation.id))
  const db = await getDatabase()
  await db?.execute('DELETE FROM annotations WHERE id = ?', [annotation.id])
}

export function loadAnnotations(documentId: string): Annotation[] {
  return readJson<Annotation[]>(`moyue:annotations:${documentId}`, [])
}
