import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { chatPreview } from '../src/main/records/chat-preview'
import { parseSession } from '../src/main/records/session'
import { ReaderWorkspace } from '../src/main/sources/workspace'

const thread = '00000000-0000-0000-0000-000000000001'
const meta = { type: 'session_meta', payload: { id: thread } }
const item = (payload: object) => ({ type: 'response_item', payload })
const event = (payload: object) => ({ type: 'event_msg', payload })
const log = (...rows: object[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
const user = (text: string) => item({ type: 'message', role: 'user', content: [{ text }] })

test('미리보기는 기록된 사용자 요청을 첨부 안내와 내부 문맥에서 꺼낸다', () => {
  const path = 'rollout-test.jsonl'
  const text = log(meta,
    user('# AGENTS.md instructions for local\n<INSTRUCTIONS>내부 지침</INSTRUCTIONS>\n<environment_context>로컬 경로</environment_context>'),
    user('# Files mentioned by the user:\n- [PRD](C:/Users/example/secret/prd.md)\n\n## My request for Codex:\n**PRD**를 읽고&#x20; [요건](C:/Users/example/notes.md)을 확인해줘.'),
  )
  assert.equal(chatPreview(path, text)?.firstRequest, 'PRD를 읽고 요건을 확인해줘.')
})

test('읽기 화면은 대화 흐름과 확인된 도구 결과를 보여주고 모든 원본 항목을 보존한다', () => {
  const path = 'rollout-test.jsonl'
  const text = log(
    meta, event({ type: 'task_started', turn_id: 'turn' }),
    user('<environment_context>settings</environment_context>'),
    item({ type: 'message', role: 'developer', content: [{ text: 'guidance' }] }),
    user('변경 상태를 확인해줘.'),
    event({ type: 'user_message', message: '변경 상태를 확인해줘.' }),
    item({ type: 'function_call', name: 'exec_command', call_id: 'call', arguments: '{"cmd":"git status"}' }),
    item({ type: 'function_call_output', call_id: 'call', output: 'working tree clean' }),
    item({ type: 'custom_tool_call', name: 'custom-exec', call_id: 'unknown', input: 'unrecognized input' }),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: '변경 사항이 없습니다.' }] }),
    event({ type: 'task_complete', turn_id: 'turn', last_agent_message: '변경 사항이 없습니다.' }),
  )
  const { snapshot } = parseSession(path, text)
  const turn = snapshot.timeline.turns.find((entry) => entry.threadTurnId === 'turn')!
  assert.deepEqual(turn.actions.flatMap((action) => action.reading?.title ?? []), [
    '사용자 요청', 'Git 변경 상태 확인', '실행 내용 보기', '답변',
  ])
  assert.equal(turn.actions.filter((action) => action.label === '도구 반환 기록').length, 1)
  assert.equal(turn.status, '응답 확인됨')
  assert.equal(turn.actions.find((action) => action.reading?.title === 'Git 변경 상태 확인')?.reading?.outcome, '결과 있음')
  const inspection = snapshot.inspect(turn.actions.find((action) => action.reading?.title === 'Git 변경 상태 확인')!.id)!
  assert.equal(inspection.sections.find((section) => section.kind === 'result')?.text, 'working tree clean')
  assert.equal(inspection.evidence.length, 2)
})

test('진행 항목은 확인된 대상, 실행 시각, 종료 코드만 드러낸다', () => {
  const timestamp = '2026-11-23T10:01:02.000Z'
  const call = (id: string, name: string, args: object) => ({ timestamp,
    ...item({ type: 'function_call', name, call_id: id, arguments: JSON.stringify(args) }),
  })
  const output = (id: string, code: number) => item({ type: 'function_call_output', call_id: id, output: { exit_code: code } })
  const { snapshot } = parseSession('rollout-test.jsonl', log(
    meta, event({ type: 'task_started', turn_id: 'turn' }),
    call('read', 'exec_command', { cmd: 'Get-Content -LiteralPath "C:\\My Project\\SKILL.md"' }), output('read', 0),
    call('search', 'exec_command', { command: ['rg', '-c', '-g', '*.md', '-e', 'edge case', 'docs'] }), output('search', 1),
    call('dynamic', 'exec_command', { cmd: 'Get-Content $selectedPath' }),
    call('other', 'example_tool', { path: 'UNRELATED.md' }), output('other', 0),
    event({ type: 'task_complete', turn_id: 'turn' }),
  ))
  const turn = snapshot.timeline.turns.find((entry) => entry.threadTurnId === 'turn')!
  const actions = turn.actions.filter((action) => action.reading)
  assert.deepEqual(actions.map((action) => [action.reading?.title, action.reading?.target?.text, action.reading?.outcome]), [
    ['파일 읽기', 'SKILL.md', '정상 종료 · 코드 0'],
    ['텍스트 검색', 'edge case', '종료 코드 1'],
    ['명령 실행', undefined, undefined],
    ['실행 내용 보기', undefined, '결과 있음'],
  ])
  assert.ok(actions.every((action) => action.time === Date.parse(timestamp)))
  assert.equal(turn.status, '턴 종료 기록 있음')
})

test('채팅을 열면 지정된 위치에서 일치하는 번들을 등록하고 실행 파일 선택은 기다린다', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'trace-reader-auto-match-'))
  try {
    const sessionFile = join(folder, 'rollout-example.jsonl')
    await writeFile(sessionFile, log(meta, event({ type: 'task_started', turn_id: 'turn' })))
    async function trace(id: string, root: string) {
      const path = join(folder, `trace-${id}`)
      await mkdir(path)
      await writeFile(join(path, 'manifest.json'), JSON.stringify({
        schema_version: 3, trace_id: id, root_thread_id: root, rollout_id: 'capture',
        started_at_unix_ms: 1000, raw_event_log: 'trace.jsonl', payloads_dir: 'payloads',
      }))
      await writeFile(join(path, 'trace.jsonl'), log({
        schema_version: 3, rollout_id: 'capture', thread_id: root, codex_turn_id: 'turn',
        payload: { type: 'codex_turn_started', thread_id: root, codex_turn_id: 'turn' },
      }))
    }
    await trace('same', thread)
    await trace('foreign', 'another-thread')
    const reader = new ReaderWorkspace(folder, [folder])
    await reader.openSession(sessionFile)
    assert.deepEqual(reader.view().bundles.map(({ id }) => id), ['same'])
    assert.deepEqual(reader.view().traceTurns, [{ id: 'same', turnIds: ['turn'] }])
    assert.equal(reader.view().selectedId, null)
    assert.equal(reader.view().trace, null)
    await trace('later', thread)
    await reader.findTraceMatches()
    assert.deepEqual(reader.view().bundles.map(({ id }) => id), ['later', 'same'])
    assert.deepEqual(reader.view().traceSearch?.searched, [folder])
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
