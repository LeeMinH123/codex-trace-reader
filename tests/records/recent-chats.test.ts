import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ReaderWorkspace } from '../../src/main/sources/workspace'

const parent = '00000000-0000-0000-0000-000000000001'
const continuation = '00000000-0000-0000-0000-000000000002'
const another = '00000000-0000-0000-0000-000000000003'
const child = '00000000-0000-0000-0000-000000000004'
const archived = '00000000-0000-0000-0000-000000000005'

function jsonl(...rows: object[]) {
  return rows.map((row) => JSON.stringify(row) + '\n').join('')
}

function meta(id: string, more: Record<string, unknown> = {}) {
  return { type: 'session_meta', payload: { id, ...more } }
}

function request(text: string) {
  return { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }
}

async function writeRollout(home: string, day: string, fileId: string, text: string) {
  const folder = join(home, 'sessions', '2026', '11', day)
  await mkdir(folder, { recursive: true })
  const path = join(folder, `rollout-2026-11-${day}T10-00-00-${fileId}.jsonl`)
  await writeFile(path, text)
  const modified = Date.parse(`2026-11-${day}T11:00:00Z`) / 1000
  await utimes(path, modified, modified)
  return path
}

test('최근 채팅은 제목 인덱스와 보존된 첫 요청을 사용하고 동일 채팅의 최신 rollout을 연다', async () => {
  const home = await mkdtemp(join(tmpdir(), 'trace-reader-recent-'))
  try {
    const prefix = jsonl(meta(parent), request('첫 요청 · 설치 경로 확인'))
    await writeRollout(home, '20', parent, prefix + jsonl(request('되돌린 요청')))
    await writeRollout(home, '21', `${parent}_${continuation}`, jsonl(
      meta(parent, { history_base: { thread_id: parent, end_byte_offset: Buffer.byteLength(prefix), end_ordinal_exclusive: 2 } }),
      request('후속 요청'),
    ))
    await writeRollout(home, '22', another, jsonl(meta(another), request('두 번째 채팅')))
    await writeFile(join(home, 'session_index.jsonl'), jsonl(
      { id: parent, thread_name: '최신 제목', updated_at: '2026-11-23T08:00:00Z' },
      { id: parent, thread_name: '이전 제목', updated_at: '2026-11-20T08:00:00Z' },
      { id: archived, thread_name: '실제 파일 없음', updated_at: '2026-11-24T08:00:00Z' },
    ) + '{"id":')

    const reader = new ReaderWorkspace(home)
    const list = await reader.recentChats()
    assert.equal(list.limited, false)
    assert.deepEqual(list.chats.map(({ id }) => id), [parent, another])
    assert.deepEqual(list.chats[0], {
      id: parent, title: '최신 제목', firstRequest: '첫 요청 · 설치 경로 확인', updatedAt: Date.parse('2026-11-23T08:00:00Z'),
    })
    await reader.openRecentChat(parent)
    assert.equal(reader.view().session?.rolloutId, continuation)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('제목 인덱스 없이 첫 요청을 사용하고 보관 기록·하위 작업은 최근 채팅에서 제외한다', async () => {
  const home = await mkdtemp(join(tmpdir(), 'trace-reader-recent-preview-'))
  try {
    await writeRollout(home, '20', another, jsonl(
      meta(another),
      request('<environment_context>로컬 설정</environment_context>'),
      { type: 'event_msg', payload: { type: 'user_message', message: '첫 사용자 요청' } },
    ))
    await writeRollout(home, '21', child, jsonl(meta(child, { source: { subagent: 'review' } }), request('하위 작업')))
    await mkdir(join(home, 'archived_sessions'))
    await writeFile(join(home, 'archived_sessions', `rollout-2026-11-22T10-00-00-${archived}.jsonl`),
      jsonl(meta(archived), request('별도 보관')))

    const { chats } = await new ReaderWorkspace(home).recentChats()
    assert.deepEqual(chats.map(({ id, title, firstRequest }) => ({ id, title, firstRequest })), [
      { id: another, title: '첫 사용자 요청', firstRequest: '첫 사용자 요청' },
    ])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('최근 목록에서 확인한 ID와 파일이 바뀌면 열려 있던 대화를 유지한다', async () => {
  const home = await mkdtemp(join(tmpdir(), 'trace-reader-recent-stale-'))
  try {
    await writeRollout(home, '20', parent, jsonl(meta(parent), request('현재 채팅')))
    const pathname = await writeRollout(home, '21', 'standalone', jsonl(meta(another), request('다른 채팅')))
    const reader = new ReaderWorkspace(home)
    await reader.recentChats()
    await reader.openRecentChat(parent)
    const before = reader.view().session
    await writeFile(pathname, jsonl(meta(child), request('이름이 같은 다른 파일')))
    await reader.openRecentChat(another)
    assert.equal(reader.view().session?.timeline.token, before?.timeline.token)
    assert.match(reader.view().issues[0].message, /식별 정보가 바뀌었습니다/)
    await assert.rejects(reader.openRecentChat(archived), /최근 채팅 목록/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
