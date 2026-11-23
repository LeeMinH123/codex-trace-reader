import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ReaderWorkspace } from '../src/main/sources/workspace'

const thread = '00000000-0000-0000-0000-000000000001'
const continuation = '00000000-0000-0000-0000-000000000002'
const descendant = '00000000-0000-0000-0000-000000000003'
const foreign = '00000000-0000-0000-0000-000000000004'

function jsonl(...items: object[]) {
  return items.map((item) => JSON.stringify(item) + '\n').join('')
}

function meta(ordinal: number, id = thread, previous?: { id: string; bytes: number; ordinal: number }) {
  return {
    type: 'session_meta', ordinal, payload: {
      id, history_base: previous && { thread_id: previous.id, end_byte_offset: previous.bytes, end_ordinal_exclusive: previous.ordinal },
    },
  }
}

function turn(ordinal: number, id: string) {
  return { type: 'event_msg', ordinal, payload: { type: 'task_started', turn_id: id, thread_id: thread } }
}

async function writeRollout(root: string, date: string, id: string, text: string, next?: string) {
  const folder = join(root, 'sessions', '2026', '11', date)
  await mkdir(folder, { recursive: true })
  const file = join(folder, `rollout-2026-11-${date}T11-00-00-${id}${next ? `_${next}` : ''}.jsonl`)
  await writeFile(file, text)
  return realpath(file)
}

function restoredTurns(reader: ReaderWorkspace) {
  return reader.view().session?.timeline.turns.flatMap((item) => item.threadTurnId ?? [])
}

test('다른 날짜의 이전 rollout을 찾아 지정된 경계까지 복원하고 원본 근거를 유지한다', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'trace-reader-rollouts-'))
  try {
    const prefix = jsonl(meta(0), turn(1, 'kept'), { type: 'response_item', ordinal: 2, payload: { message: '한글 원본' } })
    const first = await writeRollout(temp, '22', thread, prefix + jsonl(turn(3, 'reverted')))
    const second = await writeRollout(temp, '23', thread, jsonl(
      meta(3, thread, { id: thread, bytes: Buffer.byteLength(prefix), ordinal: 3 }), turn(4, 'new'),
    ), continuation)
    const other = await writeRollout(temp, '23', foreign, jsonl(meta(0, foreign)))
    const reader = new ReaderWorkspace()

    await reader.openSession(second)
    assert.deepEqual(restoredTurns(reader), ['new'])
    assert.match(reader.view().session?.timeline.status ?? '', /이전 기록 일부 미확인/)
    assert.deepEqual((await reader.discoverRollouts()).candidates.map(({ path }) => path), [first])
    await reader.openRollout(other)
    assert.match(reader.view().issues[0].message, /열려 있는 채팅과 다릅니다/)
    await reader.addRolloutCandidate(thread)

    const loaded = reader.view().session!
    assert.equal(loaded.rolloutId, continuation)
    assert.deepEqual(loaded.sourceIds, [thread, continuation])
    assert.deepEqual(restoredTurns(reader), ['kept', 'new'])
    const original = loaded.timeline.turns.find(({ threadTurnId }) => threadTurnId === 'kept')!
    assert.equal(reader.inspect(loaded.timeline.token, original.actions[1].id)?.evidence[0].location, `${first} · 3번째 줄`)
    assert.deepEqual((await reader.discoverRollouts()).candidates, [])

    await reader.selectRollout(thread)
    assert.deepEqual(restoredTurns(reader), ['kept', 'reverted'])
    await reader.selectRollout(continuation)
    const before = reader.view().session!.timeline
    await rename(first, join(temp, 'moved.jsonl'))
    await reader.refresh()
    assert.equal(reader.view().session?.timeline.token, before.token)
    assert.equal(reader.view().issues[0].previousCheckedAt, before.checkedAt)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('후속 rollout의 물리 ID를 따라가고 잘못된 순번 경계는 합치지 않는다', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'trace-reader-rollout-boundary-'))
  try {
    const firstPart = jsonl(meta(0), turn(1, 'initial'))
    const first = await writeRollout(temp, '21', thread, firstPart)
    const secondPart = jsonl(meta(2, thread, { id: thread, bytes: Buffer.byteLength(firstPart), ordinal: 2 }), turn(3, 'second'))
    const second = await writeRollout(temp, '22', thread, secondPart + jsonl(turn(4, 'second-tail')), continuation)
    const third = await writeRollout(temp, '23', thread, jsonl(
      meta(4, thread, { id: continuation, bytes: Buffer.byteLength(secondPart), ordinal: 4 }), turn(5, 'third'),
    ), descendant)
    const reader = new ReaderWorkspace()
    await reader.openSession(third)
    await reader.openRollout(first)
    await reader.openRollout(second)
    assert.deepEqual(restoredTurns(reader), ['initial', 'second', 'third'])

    await writeFile(third, jsonl(
      meta(5, thread, { id: continuation, bytes: Buffer.byteLength(secondPart), ordinal: 5 }), turn(6, 'third'),
    ))
    await reader.openSession(third)
    assert.deepEqual(restoredTurns(reader), ['third'])
    assert.match(reader.view().session?.timeline.note ?? '', /바이트 또는 순번 경계/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('스키마 3 원시 턴으로 동일 채팅의 여러 번들을 연결하고 다른 주체의 턴을 제외한다', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'trace-reader-turn-links-'))
  try {
    const reader = new ReaderWorkspace()
    await reader.openSession(await writeRollout(temp, '23', thread, jsonl(meta(0), turn(1, 'shared'))))
    for (const id of ['first', 'next']) {
      const folder = join(temp, `trace-${id}`)
      await mkdir(folder)
      await writeFile(join(folder, 'manifest.json'), JSON.stringify({
        schema_version: 3, trace_id: id, root_thread_id: thread, rollout_id: 'capture',
        started_at_unix_ms: 1000, raw_event_log: 'trace.jsonl', payloads_dir: 'payloads',
      }))
      const start = (owner: string, turnId: string, capture = 'capture') => ({
        schema_version: 3, rollout_id: capture, thread_id: owner, codex_turn_id: turnId,
        payload: { type: 'codex_turn_started', thread_id: owner, codex_turn_id: turnId },
      })
      await writeFile(join(folder, 'trace.jsonl'), jsonl(
        start(thread, 'shared'), start(foreign, 'child'), start(thread, 'another-capture', 'incorrect'),
        { ...start(thread, 'disagrees'), codex_turn_id: 'different' },
      ))
      await reader.openBundle(folder)
    }
    assert.deepEqual(reader.view().traceTurns, [
      { id: 'first', turnIds: ['shared'] }, { id: 'next', turnIds: ['shared'] },
    ])
    assert.deepEqual(reader.view().rolloutTurns, [{ id: thread, turnIds: ['shared'] }])
    assert.equal(reader.view().trace, null)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
