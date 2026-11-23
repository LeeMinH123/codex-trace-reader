import { join } from 'node:path'
import { fields, jsonLines, string } from '../records/json'
import type { Manifest } from './bundle'
import { MiB, readBounded } from './files'

export function readTraceEvents(path: string) {
  return readBounded(join(path, 'trace.jsonl'), 64 * MiB, true)
}

export async function readTraceTurnIds(manifest: Manifest): Promise<string[]> {
  const raw = await readTraceEvents(manifest.path)
  const turns = new Set<string>()
  for (const { value } of jsonLines(raw.toString('utf8')).lines) {
    if (value.schema_version !== 3 || value.rollout_id !== manifest.rolloutId || value.thread_id !== manifest.rootId) continue
    const payload = fields(value.payload)
    if (payload.type !== 'codex_turn_started') continue
    const id = string(payload.codex_turn_id)
    if (id && (value.codex_turn_id === id || value.codex_turn_id === null || value.codex_turn_id === undefined)
      && (payload.thread_id === manifest.rootId || payload.thread_id === undefined)) {
      turns.add(id)
    }
  }
  return [...turns]
}
