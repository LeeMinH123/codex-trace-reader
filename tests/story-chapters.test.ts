import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSession } from '../src/main/records/session'
import { parseTrace } from '../src/main/records/trace'
import { rawIndex } from '../src/main/records/trace-evidence'
import { buildTurnStory, summarizeChapterActions } from '../src/renderer/src/app/story-chapters'

const thread = '00000000-0000-0000-0000-000000000001'
const meta = { type: 'session_meta', payload: { id: thread } }
const item = (payload: object, time = '2026-11-23T10:00:00.000Z') => ({
  timestamp: time,
  type: 'response_item',
  payload,
})
const event = (payload: object, time = '2026-11-23T10:00:00.000Z') => ({
  timestamp: time,
  type: 'event_msg',
  payload,
})
const log = (...rows: object[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n'

test('진행 메시지 2개와 도구 6개·5개 흐름을 2개 챕터와 사실 요약으로 정리한다', () => {
  const call = (id: string, name: string, args: unknown, code = 0) => [
    item({ type: 'function_call', name, call_id: id, arguments: typeof args === 'string' ? args : JSON.stringify(args) }),
    item({ type: 'function_call_output', call_id: id, output: { exit_code: code } }),
  ]
  const text = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }),
    item({ type: 'message', role: 'user', content: [{ text: '문서와 코드를 검토해줘.' }] }),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '두 문서를 먼저 읽고 검색하겠습니다.\n세부 설명 줄' }] }),
    ...call('c1', 'read_file', { file_path: 'SKILL.md' }),
    ...call('c2', 'read_file', { file_path: 'prd.md' }),
    ...call('c3', 'read_file', { file_path: 'README.md' }),
    ...call('c4', 'exec_command', { cmd: 'rg -n auth src' }),
    ...call('c5', 'exec_command', { cmd: 'rg -n trace src' }),
    ...call('c6', 'exec_command', { cmd: 'git status' }),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '문서를 수정하고 테스트를 실행합니다.' }] }),
    ...call('c7', 'apply_patch', '*** Begin Patch\n*** Update File: prd.md\n*** End Patch'),
    ...call('c8', 'apply_patch', '*** Begin Patch\n*** Update File: README.md\n*** End Patch'),
    ...call('c9', 'read_file', { file_path: 'package.json' }),
    ...call('c10', 'exec_command', { cmd: 'npm test' }, 0),
    ...call('c11', 'exec_command', { cmd: 'git diff' }),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: '수정을 마쳤습니다.' }] }),
  )

  const { snapshot } = parseSession('rollout-story.jsonl', text)
  const actionsById = new Map(snapshot.timeline.turns.flatMap((turn) => turn.actions.map((action) => [action.id, action])))
  const turn = snapshot.timeline.turns.find((entry) => entry.id === 'turn:turn-1')!
  const story = buildTurnStory(turn, actionsById)

  assert.equal(story.chapters.length, 2)
  assert.equal(story.chapters[0].index, 1)
  assert.equal(story.chapters[0].heading, '두 문서를 먼저 읽고 검색하겠습니다.')
  assert.ok(story.chapters[0].fullMessage)
  assert.equal(story.chapters[0].totalActionCount, 6)
  assert.equal(
    story.chapters[0].summary,
    'SKILL.md, prd.md 외 1개 파일 읽음 · "auth" 외 1건 검색 · Git 변경 상태 확인',
  )

  assert.equal(story.chapters[1].index, 2)
  assert.equal(story.chapters[1].heading, '문서를 수정하고 테스트를 실행합니다.')
  assert.equal(story.chapters[1].fullMessage, undefined)
  assert.equal(story.chapters[1].totalActionCount, 5)
  assert.equal(
    story.chapters[1].summary,
    'package.json 읽음 · prd.md 외 1개 파일 수정 · 테스트 실행 (정상 종료 · 코드 0)',
  )
})

test('첫 진행 메시지 앞의 선행 도구는 별도 챕터로 분리된다', () => {
  const text = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }),
    item({ type: 'message', role: 'user', content: [{ text: '먼저 확인해줘' }] }),
    item({ type: 'function_call', name: 'read_file', call_id: 'r1', arguments: '{"file_path":"a.ts"}' }),
    item({ type: 'function_call', name: 'read_file', call_id: 'r2', arguments: '{"file_path":"b.ts"}' }),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '이제 수정하겠습니다.' }] }),
    item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'p1', input: '*** Begin Patch\n*** Update File: a.ts\n*** End Patch' }),
  )

  const { snapshot } = parseSession('rollout-lead.jsonl', text)
  const actionsById = new Map(snapshot.timeline.turns.flatMap((turn) => turn.actions.map((action) => [action.id, action])))
  const turn = snapshot.timeline.turns.find((entry) => entry.id === 'turn:turn-1')!
  const story = buildTurnStory(turn, actionsById)

  assert.equal(story.chapters.length, 2)
  assert.equal(story.chapters[0].heading, '자료와 코드 확인')
  assert.equal(story.chapters[0].headingAction, undefined)
  assert.equal(story.chapters[0].summary, 'a.ts, b.ts 읽음')
  assert.equal(story.chapters[1].heading, '이제 수정하겠습니다.')
  assert.equal(story.chapters[1].summary, 'a.ts 수정')
})

test('진행 메시지가 없는 턴은 행동 유형별 챕터로 묶인다', () => {
  const text = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }),
    item({ type: 'message', role: 'user', content: [{ text: '고쳐줘' }] }),
    item({ type: 'function_call', name: 'read_file', call_id: 'r1', arguments: '{"file_path":"x.ts"}' }),
    item({ type: 'function_call', name: 'read_file', call_id: 'r2', arguments: '{"file_path":"y.ts"}' }),
    item({ type: 'function_call', name: 'exec_command', call_id: 's1', arguments: '{"cmd":"rg -n token src"}' }),
    item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'p1', input: '*** Begin Patch\n*** Update File: x.ts\n*** End Patch' }),
    item({ type: 'function_call', name: 'exec_command', call_id: 't1', arguments: '{"cmd":"npm test"}' }),
    item({ type: 'function_call_output', call_id: 't1', output: { exit_code: 0 } }),
  )

  const { snapshot } = parseSession('rollout-nomsg.jsonl', text)
  const actionsById = new Map(snapshot.timeline.turns.flatMap((turn) => turn.actions.map((action) => [action.id, action])))
  const turn = snapshot.timeline.turns.find((entry) => entry.id === 'turn:turn-1')!
  const story = buildTurnStory(turn, actionsById)

  assert.deepEqual(
    story.chapters.map((chapter) => [chapter.index, chapter.heading, chapter.summary]),
    [
      [1, '자료와 코드 확인', 'x.ts, y.ts 읽음 · "token" 검색'],
      [2, '파일 수정', 'x.ts 수정'],
      [3, '테스트 확인', '테스트 실행 (정상 종료 · 코드 0)'],
    ],
  )
  assert.equal(summarizeChapterActions([]), '')
})

test('상세 트레이스의 코드 실행 하위 도구가 nestedByParent와 요약에 반영된다', () => {
  const win = (seq: number) => ({ status: 'completed', started_at_unix_ms: 1000 + seq * 100, started_seq: seq })
  const state = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: { t1: { thread_id: 'root', execution: win(1) } },
    threads: { root: { execution: win(1) } },
    conversation_items: {},
    inference_calls: {},
    tool_calls: {
      exec1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'exec' },
        started_code_cell_id: 'cell1',
        execution: win(2),
      },
      sub1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'SKILL.md' }) },
        requester: { code_cell_id: 'cell1' },
        execution: win(3),
      },
      sub2: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'prd.md' }) },
        requester: { code_cell_id: 'cell1' },
        execution: win(4),
      },
    },
    code_cells: {
      cell1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        execution: win(2),
        nested_tool_call_ids: ['sub1', 'sub2'],
      },
    },
    terminal_operations: {},
    terminal_sessions: {},
    compactions: {},
    compaction_requests: {},
    interaction_edges: {},
    raw_payloads: {},
  }

  const trace = parseTrace('trace-story', state, rawIndex('{"seq":1,"wall_time_unix_ms":1000}\n'), new Set())
  const t1 = trace.timeline.turns.find((turn) => turn.id === 'turn:t1')!
  const actionsById = new Map(t1.actions.map((action) => [action.id, action]))
  const story = buildTurnStory(t1, actionsById)

  assert.equal(story.chapters.length, 1)
  const [chapter] = story.chapters
  assert.equal(chapter.actions.length, 1)
  assert.equal(chapter.nestedByParent.get('tool_calls:exec1')?.length, 2)
  assert.equal(chapter.totalActionCount, 3)
  assert.equal(chapter.summary, 'SKILL.md, prd.md 읽음 · 코드 실행')
})
