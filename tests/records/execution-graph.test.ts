import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assembleSession } from '../../src/main/records/parsing/session'
import { parseRollout } from '../../src/main/records/parsing/rollout'

const firstId = '00000000-0000-0000-0000-000000000001'
const nextId = '00000000-0000-0000-0000-000000000002'

function log(...items: object[]): string {
  return items.map((value) => JSON.stringify(value)).join('\n') + '\n'
}

const turnStart = { type: 'event_msg', payload: { type: 'task_started', turn_id: 'example' } }
const item = (payload: object) => ({ type: 'response_item', payload })
const call = (call_id: string) => item({ type: 'function_call', name: 'exec_command', call_id, arguments: '{}' })
const output = (call_id: string) => item({ type: 'function_call_output', call_id, output: '결과' })

test('rollout 그래프는 이전 파일 범위와 사건 ID를 유지하며 모호한 호출을 연결하지 않는다', () => {
  const prefix = log(
    { type: 'session_meta', payload: { id: firstId } },
    turnStart,
    item({ type: 'message', role: 'user', content: [{ text: '요청' }] }),
    call('known'), output('known'), call('duplicate'), call('duplicate'), output('duplicate'),
  )
  const tail = log({ type: 'session_meta', payload: { id: firstId, history_base: {
    thread_id: firstId, end_byte_offset: Buffer.byteLength(prefix), end_ordinal_exclusive: 8,
  } } }, turnStart) + '{"type":'
  const first = parseRollout(`rollout-2026-11-23T11-00-00-${firstId}.jsonl`, prefix)
  const next = parseRollout(`rollout-2026-11-24T11-00-00-${firstId}_${nextId}.jsonl`, tail)
  const original = assembleSession([first]).snapshot
  const restored = assembleSession([first, next]).snapshot
  const orphan = assembleSession([next]).snapshot
  const { graph } = restored
  const before = original.graph.byTurn.get('turn:example')!
  const after = graph.byTurn.get('turn:example')!

  assert.equal(restored.graph, graph)
  assert.deepEqual(after.slice(0, before.length).map(({ id }) => id), before.map(({ id }) => id))
  assert.equal(after[0].turnProvenance.level, 'id-confirmed')
  assert.equal(after[1].turnProvenance.level, 'rule-derived')
  assert.equal(graph.byId.get(after[1].actorId!)?.kind, 'agent')
  assert.equal(graph.byId.get(`info:${after[1].id}`)?.kind, 'information')
  assert.deepEqual(graph.coverage.sources.map(({ id, limitations }) => [id, limitations]), [
    [firstId, []], [nextId, ['partial-jsonl']],
  ])
  assert.deepEqual(orphan.graph.coverage.sources[0].limitations, ['history-base-unavailable', 'partial-jsonl'])
  const toolResults = after.flatMap(({ id }) => graph.edgesByNode.get(id)?.filter((edge) => edge.from === id && edge.kind === 'tool-result') ?? [])
  assert.deepEqual(toolResults, [{
    kind: 'tool-result', from: after[2].id, to: after[3].id, provenance: { level: 'id-confirmed', rule: 'payload.call_id' },
  }])
  assert.equal(after[2].evidence[1].location, restored.inspect(after[2].id)?.evidence[1].location)
  assert.ok(after[2].evidence.every(({ sourceId, availability }) => sourceId === firstId && availability === 'present'))
  assert.ok(after.every(({ id }) => graph.edgesByNode.get(id)?.every(({ kind }) => kind !== 'delivery') ?? true))
})
