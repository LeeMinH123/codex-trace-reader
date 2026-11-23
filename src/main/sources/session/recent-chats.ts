import { lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import type { RecentChat, RecentChatList, RolloutInfo } from '../../../shared/reader'
import { chatPreview } from '../../records/reading/chat-preview'
import { compareId, fields, preview, string } from '../../records/core/json'
import { rolloutName } from '../../records/parsing/rollout'
import { plainPreview } from '../../records/reading/reading'
import { failureMessage, MiB, readBounded, readPrefix } from '../files'
import { rolloutFiles } from './rollouts'

const recentLimit = 100

export function defaultCodexHome(): string {
  const configured = process.env.CODEX_HOME
  return configured && isAbsolute(configured) ? configured : join(homedir(), '.codex')
}

interface FileEntry {
  path: string
  modified: number
}

interface IndexEntry {
  title: string
  updatedAt: number
}

async function readChatIndex(home: string) {
  const index = new Map<string, IndexEntry>()
  try {
    const bytes = await readBounded(join(home, 'session_index.jsonl'), 8 * MiB, true)
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
      let row
      try { row = fields(JSON.parse(line)) } catch { continue }
      const id = string(row.id)?.toLowerCase()
      if (!id) continue
      const date = Date.parse(string(row.updated_at) ?? '')
      const updatedAt = Number.isFinite(date) ? date : 0
      if (updatedAt >= (index.get(id)?.updatedAt ?? 0)) {
        index.set(id, { title: plainPreview(string(row.thread_name) ?? '', 120), updatedAt })
      }
    }
  } catch {
    // The index is optional. The rollout is the source used to open the chat.
  }
  return index
}

async function inventory(folder: string) {
  const files: FileEntry[] = []
  let batch: string[] = []
  async function addBatch() {
    const result = await Promise.allSettled(batch.map(async (path) => {
      const info = await lstat(path)
      return info.isFile() && info.nlink === 1 ? { path, modified: info.mtimeMs } : null
    }))
    files.push(...result.flatMap((item) => item.status === 'fulfilled' && item.value ? [item.value] : []))
    batch = []
  }
  for await (const path of rolloutFiles(folder, true)) {
    batch.push(path)
    if (batch.length === 16) await addBatch()
  }
  if (batch.length) await addBatch()
  return files
}

function newestFile(a: FileEntry, b: FileEntry) {
  return compareId(basename(b.path), basename(a.path)) || compareId(a.path, b.path)
}

export class RecentChats {
  private sources = new Map<string, RolloutInfo>()
  private titles = new Map<string, string>()

  constructor(private readonly home: string) {}

  source(id: string) {
    return this.sources.get(id)
  }

  title(id: string) { return this.titles.get(id.toLowerCase()) }

  async list(): Promise<RecentChatList> {
    const folder = join(this.home, 'sessions')
    let files
    try {
      files = await inventory(folder)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.sources.clear()
        this.titles.clear()
        return { chats: [], limited: false }
      }
      return { chats: [], limited: false, issue: { path: folder, message: failureMessage(error) } }
    }

    const titles = await readChatIndex(this.home)
    const groups = new Map<string, { files: FileEntry[]; updatedAt: number }>()
    const byRollout = new Map<string, FileEntry[]>()
    for (const file of files) {
      const name = rolloutName(file.path)
      const threadId = name?.[1].toLowerCase()
      const key = threadId ?? file.path
      const group = groups.get(key) ?? { files: [], updatedAt: 0 }
      group.files.push(file)
      group.updatedAt = Math.max(group.updatedAt, file.modified, titles.get(key)?.updatedAt ?? 0)
      groups.set(key, group)
      if (name && threadId) {
        const id = (name[2] ?? threadId).toLowerCase()
        const choices = byRollout.get(id) ?? []
        choices.push(file)
        byRollout.set(id, choices)
      }
    }

    const sources = new Map<string, RolloutInfo>()
    const chats: RecentChat[] = []
    const ordered = [...groups].sort(([aKey, a], [bKey, b]) => b.updatedAt - a.updatedAt || compareId(aKey, bKey))
    let limited = false
    for (const [, group] of ordered) {
      if (chats.length === recentLimit) {
        limited = true
        break
      }
      const head = await this.preview(group.files.sort(newestFile))
      if (!head || sources.has(head.info.threadId)) continue
      const title = titles.get(head.info.threadId.toLowerCase())
      const firstRequest = await this.firstRequest(head, byRollout)
      sources.set(head.info.threadId, head.info)
      chats.push({
        id: head.info.threadId, firstRequest: firstRequest || null,
        title: title?.title || head.title || preview(firstRequest, 82) || '제목 없는 채팅',
        updatedAt: Math.max(group.updatedAt, title?.updatedAt ?? 0),
      })
    }
    this.sources = sources
    this.titles = new Map([...titles].flatMap(([id, { title }]) => title ? [[id, title] as const] : []))
    for (const chat of chats) this.titles.set(chat.id.toLowerCase(), chat.title)
    chats.sort((a, b) => b.updatedAt - a.updatedAt || compareId(a.id, b.id))
    return { chats, limited }
  }

  private async preview(files: FileEntry[], base?: RolloutInfo['base'], threadId?: string) {
    for (const { path } of files) {
      try {
        const bytes = await readPrefix(path, Math.min(MiB, base?.bytes ?? MiB))
        const result = chatPreview(path, bytes.toString('utf8'))
        if (result && (!base || (result.info.id === base.id && result.info.threadId === threadId))) return result
      } catch {
        // A file can be archived or have an incomplete header while the list loads.
      }
    }
    return null
  }

  private async firstRequest(head: NonNullable<ReturnType<typeof chatPreview>>, byRollout: Map<string, FileEntry[]>) {
    const seen = new Set([head.info.id])
    let { firstRequest } = head
    let base = head.info.base
    while (base && seen.size < 32 && !seen.has(base.id)) {
      seen.add(base.id)
      const part = await this.preview(byRollout.get(base.id) ?? [], base, head.info.threadId)
      if (!part) break
      firstRequest = part.firstRequest || firstRequest
      base = part.info.base
    }
    return firstRequest
  }
}
