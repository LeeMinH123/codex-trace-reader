import { readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { ReaderApi, RolloutInfo } from '../../shared/reader'
import { compareId } from '../records/json'
import { checkRolloutPrefix, matchesRolloutName, parseRollout, rolloutHeader, rolloutName, type RolloutPart } from '../records/rollout'
import { assembleSession, rolloutTurnIds, type SessionRecord } from '../records/session'
import { canonicalPath, failureMessage, fixedPath, MiB, pathKey, readBounded, readPrefix } from './files'

const fileLimit = 96 * MiB
const lineageLimit = 160 * MiB
const dateParts = [/^\d{4}$/, /^\d{2}$/, /^\d{2}$/]

function ordered(a: RolloutInfo, b: RolloutInfo) {
  return (b.startedAt ?? 0) - (a.startedAt ?? 0) || compareId(a.id, b.id)
}

function discoveryFolders(path: string) {
  const folder = dirname(path)
  let root = folder
  for (const pattern of [...dateParts].reverse()) {
    if (!pattern.test(basename(root))) break
    root = dirname(root)
  }
  if (basename(root).toLowerCase() === 'sessions') {
    return [{ path: root, dated: true }, { path: join(dirname(root), 'archived_sessions'), dated: false }]
  }
  if (basename(folder).toLowerCase() === 'archived_sessions') {
    return [{ path: folder, dated: false }, { path: join(dirname(folder), 'sessions'), dated: true }]
  }
  return [{ path: folder, dated: false }]
}

export async function* rolloutFiles(folder: string, dated: boolean, level = 0): AsyncGenerator<string> {
  await fixedPath(folder, 'directory')
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isFile() && matchesRolloutName(path)) yield path
    if (dated && entry.isDirectory() && dateParts[level]?.test(entry.name)) {
      try {
        yield* rolloutFiles(path, dated, level + 1)
      } catch {
        // A dated folder can move to the archive while discovery is in progress.
      }
    }
  }
}

interface Entry {
  info: RolloutInfo
  turnIds: string[]
}

async function loadFile(path: string) {
  if (!matchesRolloutName(path)) throw new Error('rollout-*.jsonl 파일을 선택하세요.')
  const bytes = await readBounded(path, fileLimit, true)
  return parseRollout(path, bytes.toString('utf8'))
}

async function assemble(head: RolloutPart, entries: Map<string, Entry>) {
  const chain = [head]
  const seen = new Set([head.info.id])
  let remaining = lineageLimit - head.length
  let child = head
  let note: string | undefined
  while (child.info.base || child.invalidBase) {
    const base = child.info.base
    if (!base) {
      note = 'history_base의 이전 파일 또는 기록 경계를 확인할 수 없습니다.'
      break
    }
    const entry = entries.get(base.id)
    if (!entry) {
      note = `이전 rollout ${base.id}을 찾으면 이어진 기록을 복원할 수 있습니다.`
      break
    }
    if (seen.has(base.id) || chain.length >= 32) {
      note = `이전 rollout ${base.id}의 참조가 반복되거나 읽기 범위를 초과했습니다.`
      break
    }
    try {
      const bytes = await readBounded(entry.info.path, Math.min(fileLimit, remaining), true, base.bytes)
      const parent = parseRollout(entry.info.path, bytes.toString('utf8'))
      if (parent.info.id !== base.id || parent.info.threadId !== head.info.threadId) {
        throw new Error('이전 파일의 rollout ID 또는 채팅 ID가 등록 정보와 다릅니다.')
      }
      checkRolloutPrefix(parent, bytes, base.ordinal)
      chain.push(parent)
      seen.add(base.id)
      remaining -= bytes.length
      child = parent
    } catch (error) {
      note = `${entry.info.path} · ${failureMessage(error)}`
      break
    }
  }
  return assembleSession(chain.reverse(), note)
}

export class RolloutSources {
  current: SessionRecord | null = null
  private entries = new Map<string, Entry>()
  private candidates = new Map<string, RolloutInfo>()

  view() {
    return {
      rollouts: [...this.entries.values()].map((entry) => entry.info).sort(ordered),
      rolloutTurns: [...this.entries].map(([id, { turnIds }]) => ({ id, turnIds })),
    }
  }

  path(id: string) {
    return this.entries.get(id)?.info.path ?? this.candidates.get(id)?.path
  }

  async open(path: string, keepSelection = false, expected?: Pick<RolloutInfo, 'id' | 'threadId'>) {
    const canonical = expected ? path : await canonicalPath(path, 'file')
    const part = await loadFile(canonical)
    if (expected && (part.info.id !== expected.id || part.info.threadId !== expected.threadId)) {
      throw new Error('목록을 읽은 뒤 채팅 또는 rollout의 식별 정보가 바뀌었습니다.')
    }
    const sameThread = part.info.threadId === this.current?.id
    if (keepSelection && this.current && !sameThread) throw new Error('선택한 rollout의 채팅 ID가 열려 있는 채팅과 다릅니다.')
    const entries = sameThread ? new Map(this.entries) : new Map<string, Entry>()
    const registered = entries.get(part.info.id)
    if (registered && pathKey(registered.info.path) !== pathKey(canonical)) {
      try {
        await fixedPath(registered.info.path, 'file')
        throw new Error('같은 rollout ID의 파일이 이미 등록되어 있습니다.')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    for (const [id, entry] of entries) {
      if (id !== part.info.id && pathKey(entry.info.path) === pathKey(canonical)) {
        throw new Error('등록한 파일의 rollout ID가 바뀌었습니다.')
      }
    }
    entries.set(part.info.id, { info: part.info, turnIds: rolloutTurnIds(part) })
    const selected = keepSelection ? this.current : null
    if (selected) {
      // Keep the new registration even when the selected file can no longer be reread.
      this.entries = entries
      this.candidates.delete(part.info.id)
    }
    let head = part
    if (selected && selected.rolloutId !== part.info.id) {
      try {
        head = await this.readRegistered(selected.rolloutId, entries)
      } catch (error) {
        throw new Error(`${selected.path} · ${failureMessage(error)}`)
      }
    }
    const fresh = await assemble(head, entries)
    if (selected?.sourceIds.some((id) => !fresh.sourceIds.includes(id))) {
      throw new Error(fresh.snapshot.timeline.note ?? '이전 rollout을 다시 읽을 수 없습니다.')
    }
    this.entries = entries
    this.current = fresh
    if (!sameThread) this.candidates.clear()
    this.candidates.delete(part.info.id)
  }

  async select(id: string, refresh = false) {
    if (!this.entries.has(id)) return
    const head = await this.readRegistered(id, this.entries)
    const fresh = await assemble(head, this.entries)
    if (refresh && this.current?.rolloutId === id && this.current.sourceIds.some((source) => !fresh.sourceIds.includes(source))) {
      throw new Error(fresh.snapshot.timeline.note ?? '이전 rollout을 다시 읽을 수 없습니다.')
    }
    this.entries.set(id, { info: head.info, turnIds: rolloutTurnIds(head) })
    this.current = fresh
  }

  async addCandidate(id: string) {
    const candidate = this.candidates.get(id)
    if (candidate) await this.open(candidate.path, true, candidate)
  }

  async discover(): ReturnType<ReaderApi['discoverRollouts']> {
    this.candidates.clear()
    if (!this.current) return { candidates: [] }
    const thread = this.current.id
    const roots = new Map<string, { path: string; dated: boolean }>()
    for (const { info } of this.entries.values()) {
      for (const root of discoveryFolders(info.path)) roots.set(pathKey(root.path), root)
    }
    const registered = new Set([...this.entries.values()].map(({ info }) => pathKey(info.path)))
    let issue
    for (const root of roots.values()) {
      try {
        for await (const path of rolloutFiles(root.path, root.dated)) {
          const filename = rolloutName(path)
          if (registered.has(pathKey(path)) || (filename && filename[1].toLowerCase() !== thread.toLowerCase())) continue
          try {
            const { info } = rolloutHeader(path, (await readPrefix(path, MiB)).toString('utf8'))
            if (info.threadId === thread && !this.entries.has(info.id) && !this.candidates.has(info.id)) {
              this.candidates.set(info.id, info)
            }
          } catch {
            // A candidate must have a readable, matching header.
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issue ??= { path: root.path, message: failureMessage(error) }
      }
    }
    return { candidates: [...this.candidates.values()].sort(ordered), issue }
  }

  private async readRegistered(id: string, entries: Map<string, Entry>) {
    const info = entries.get(id)!.info
    const part = await loadFile(info.path)
    if (part.info.id !== id || part.info.threadId !== info.threadId) throw new Error('등록한 rollout의 식별 정보가 바뀌었습니다.')
    return part
  }
}
