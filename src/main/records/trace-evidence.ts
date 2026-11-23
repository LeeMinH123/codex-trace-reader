import { fields, isFields, jsonLines, number, pointer, string, type Fields } from './json'
import type { Evidence } from '../../shared/reader'
import { join } from 'node:path'

export function rawIndex(text: string) {
  const { lines, partial } = jsonLines(text)
  const raw = new Map<number, { text: string; line: number }>()
  let lastAt: number | null = null
  for (const { value, raw: lineText, line } of lines) {
    const seq = number(value.seq)
    if (seq === null) continue
    raw.set(seq, { text: lineText, line })
    lastAt = number(value.wall_time_unix_ms) ?? lastAt
  }
  return { raw, lastAt, partial }
}

export function sequences(value: Fields): number[] {
  return ['started_seq', 'ended_seq'].flatMap((key) => {
    const seq = number(value[key])
    return seq === null ? [] : [seq]
  })
}

export function payloadEvidence(
  bundle: string,
  references: Fields,
  values: unknown[],
  shards: Set<number>,
): Evidence[] {
  const ids = new Set<string>()
  const pending = [...values]
  while (pending.length) {
    const value = pending.pop()
    if (typeof value === 'string' && /^raw_payload:\d+$/.test(value)) ids.add(value)
    if (Array.isArray(value)) for (const item of value) pending.push(item)
    if (isFields(value)) for (const item of Object.values(value)) pending.push(item)
  }
  return [...ids].sort().map((id) => {
    const reference = fields(references[id])
    const shard = number(reference.shard)
    const location = shard === null
      ? join(bundle, 'payloads') : join(bundle, 'payloads', `${String(shard).padStart(6, '0')}.zst`)
    const notes = new Set<string>()
    const parts = [reference]
    while (parts.length) {
      const part = parts.pop()!
      const capture = fields(part.capture)
      if (capture.status === 'truncated') notes.add(`본문 잘림 · ${capture.retained_bytes ?? '?'} / ${capture.original_bytes ?? '?'} 바이트`)
      if (capture.status === 'omitted') notes.add(`본문 누락 · 원본 ${capture.original_bytes ?? '?'} 바이트`)
      if (Array.isArray(part.parts)) for (const child of part.parts) parts.push(fields(child))
    }
    if (shard !== null) notes.add(shards.has(shard) ? '압축 샤드 위치가 확보됐습니다.' : '스냅샷에서 샤드를 확인할 수 없습니다.')
    else if (!notes.size) notes.add('샤드 위치를 확인할 수 없습니다.')
    return {
      type: 'reference', location: `${location} · ${id}`,
      text: [...notes, `state.json ${pointer('raw_payloads', id)}`, JSON.stringify(reference, null, 2)].join('\n'),
    }
  })
}

export function stateEvidence(collection: string, key: string, value: Fields): Evidence {
  return { type: 'derived', location: `state.json ${pointer(collection, key)}`, text: JSON.stringify(value, null, 2) }
}

export function directPayloadValues(value: Fields): unknown[] {
  const references = Object.entries(value).filter(([key]) => key.endsWith('payload_id') || key.endsWith('payload_ids'))
  return references.map(([, item]) => item)
}

export function rawSequence(value: Fields, key: string): number[] {
  const seq = number(value[key])
  return seq === null ? [] : [seq]
}

export function rawReferenceLabel(seq: number, line?: number): string {
  return line === undefined ? `순번 ${seq}` : `순번 ${seq} · ${line}번째 줄`
}

export function anchorId(value: Fields): [string, string] | undefined {
  const type = string(value.type)
  if (type === 'thread' && string(value.thread_id)) return ['threads', String(value.thread_id)]
  if (type === 'tool_call' && string(value.tool_call_id)) return ['tool_calls', String(value.tool_call_id)]
  if (type === 'conversation_item' && string(value.item_id)) return ['conversation_items', String(value.item_id)]
}
