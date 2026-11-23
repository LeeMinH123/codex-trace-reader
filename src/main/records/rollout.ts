import { basename } from 'node:path'
import type { RolloutInfo } from '../../shared/reader'
import { fields, isFields, jsonLines, number, string, type Fields } from './json'
import { plainPreview } from './reading'

const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
const standardName = new RegExp(`^rollout-.*-(${uuid})(?:_(${uuid}))?\\.jsonl$`, 'i')
const uuidPattern = new RegExp(`^${uuid}$`, 'i')

export function rolloutName(path: string) {
  return basename(path).match(standardName)
}

export function matchesRolloutName(path: string): boolean {
  return /^rollout-.*\.jsonl$/i.test(basename(path))
}

export interface RolloutPart {
  info: RolloutInfo
  lines: ReturnType<typeof jsonLines>['lines']
  partial: boolean
  invalidBase: boolean
  length: number
  title: string
}

function rolloutMetadata(path: string, value: Fields) {
  const meta = fields(value.payload)
  const metaId = string(meta.id)
  if (!metaId) throw new Error('session_meta.payload.id에서 채팅 ID를 확인할 수 없습니다.')
  const name = rolloutName(path)
  const legacyThreadId = string(meta.session_id)
  const legacyName = name?.[2]?.toLowerCase() === metaId.toLowerCase()
    && name?.[1].toLowerCase() === legacyThreadId?.toLowerCase()
  const threadId = legacyName && legacyThreadId ? legacyThreadId : metaId
  if (name && name[1].toLowerCase() !== threadId.toLowerCase()) {
    throw new Error('파일명의 채팅 ID가 session_meta의 채팅 ID와 다릅니다.')
  }
  const stamp = Date.parse(string(meta.timestamp) ?? string(value.timestamp) ?? '')
  const base = fields(meta.history_base)
  const baseId = string(base.thread_id)
  const bytes = number(base.end_byte_offset)
  const ordinal = number(base.end_ordinal_exclusive)
  const hasBase = meta.history_base !== null && meta.history_base !== undefined
  const historyBase = baseId && bytes !== null && bytes > 0 && ordinal !== null && ordinal > 0
    ? { id: uuidPattern.test(baseId) ? baseId.toLowerCase() : baseId, bytes, ordinal } : undefined
  const info: RolloutInfo = {
    id: name ? (name[2] ?? threadId).toLowerCase() : threadId,
    threadId, path, startedAt: Number.isFinite(stamp) ? stamp : null, base: historyBase,
  }
  return { info, invalidBase: hasBase && !historyBase, title: plainPreview(string(meta.thread_name ?? meta.title) ?? '', 120) }
}

export function rolloutHeader(path: string, text: string) {
  // Codex writes its metadata before conversation records. Inspect just the header during discovery.
  const line = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]
  const value: unknown = JSON.parse(line)
  if (!isFields(value) || value.type !== 'session_meta') throw new Error('파일 첫 줄의 session_meta를 확인할 수 없습니다.')
  return { info: rolloutMetadata(path, value).info, metadata: fields(value.payload) }
}

export function parseRollout(path: string, text: string): RolloutPart {
  const { lines, partial } = jsonLines(text)
  const header = lines.find(({ value }) => value.type === 'session_meta')
  if (!header) throw new Error('session_meta.payload.id에서 채팅 ID를 확인할 수 없습니다.')
  return { ...rolloutMetadata(path, header.value), lines, partial, length: Buffer.byteLength(text) }
}

export function checkRolloutPrefix(part: RolloutPart, bytes: Buffer, boundary: number) {
  const last = part.lines.at(-1)
  if (part.partial || bytes.at(-1) !== 10 || !last || number(last.value.ordinal) !== boundary - 1) {
    throw new Error('이전 rollout의 바이트 또는 순번 경계를 확인할 수 없습니다.')
  }
  let previous: number | null = null
  for (const { value } of part.lines) {
    const ordinal = number(value.ordinal)
    if (ordinal === null || ordinal < 0 || ordinal >= boundary || (previous !== null && ordinal <= previous)) {
      throw new Error('이전 rollout의 순번이 기록된 경계와 일치하지 않습니다.')
    }
    previous = ordinal
  }
}
