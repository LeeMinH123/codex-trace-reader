import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSession } from '../../src/main/records/parsing/session'
import { parseTrace } from '../../src/main/records/parsing/trace'
import { rawIndex } from '../../src/main/records/parsing/trace-evidence'
import {
  buildProgressFlow,
  formatTitleTally,
  summarizeTurnProgress,
  visibleReadingOrder,
} from '../../src/renderer/src/model/reading-groups'
import { highlightSegments, searchTimeline } from '../../src/renderer/src/model/timeline-search'

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

test('연속 도구 실행을 진행 메시지 단위로 접고 집계하며 단독 도구는 접지 않는다', () => {
  const call = (id: string, name: string, args: unknown, sec: number) => {
    const time = `2026-11-23T10:00:${String(sec).padStart(2, '0')}.000Z`
    return [
      item({ type: 'function_call', name, call_id: id, arguments: typeof args === 'string' ? args : JSON.stringify(args) }, time),
      item({ type: 'function_call_output', call_id: id, output: { exit_code: 0 } }, time),
    ]
  }
  const text = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }, '2026-11-23T10:00:00.000Z'),
    item({ type: 'message', role: 'user', content: [{ text: '구조를 확인해줘' }] }, '2026-11-23T10:00:01.000Z'),
    ...call('c1', 'exec_command', { cmd: 'Get-Content a.ts' }, 2),
    ...call('c2', 'exec_command', { cmd: 'Get-Content b.ts' }, 3),
    ...call('c3', 'exec_command', { cmd: 'Get-Content c.ts' }, 4),
    ...call('c4', 'exec_command', { cmd: 'rg -n foo src' }, 5),
    ...call('c5', 'exec_command', { cmd: 'rg -n bar src' }, 6),
    ...call('c6', 'exec_command', { cmd: 'git status' }, 7),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '중간 확인 1' }] }, '2026-11-23T10:00:08.000Z'),
    ...call('c7', 'exec_command', { cmd: 'Get-Content d.ts' }, 9),
    ...call('c8', 'exec_command', { cmd: 'rg -n baz src' }, 10),
    ...call('c9', 'exec_command', { cmd: 'git diff' }, 11),
    ...call('c10', 'exec_command', { cmd: 'Get-ChildItem src' }, 12),
    ...call('c11', 'apply_patch', '*** Begin Patch\n*** Update File: src/app.ts\n*** End Patch', 13),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '중간 확인 2' }] }, '2026-11-23T10:00:14.000Z'),
    ...call('c12', 'exec_command', { cmd: 'npm test' }, 15),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: '완료했습니다.' }] }, '2026-11-23T10:00:16.000Z'),
    event({ type: 'task_complete', turn_id: 'turn-1' }, '2026-11-23T10:00:17.000Z'),
  )

  const { snapshot } = parseSession('rollout-run.jsonl', text)
  const turn = snapshot.timeline.turns[0]
  assert.deepEqual(summarizeTurnProgress(turn), { messages: 2, tools: 12, nested: 0 })

  const progress = turn.actions.filter((action) => action.reading?.stage === 'progress')
  const entries = buildProgressFlow(progress)
  assert.deepEqual(
    entries.map((entry) => (entry.kind === 'run' ? `run:${entry.actions.length}` : entry.kind)),
    ['run:6', 'message', 'run:5', 'message', 'action'],
  )

  const firstRun = entries[0]
  assert.equal(firstRun.kind, 'run')
  assert.deepEqual(firstRun.titles, [
    { title: '파일 읽기', count: 3 },
    { title: '텍스트 검색', count: 2 },
    { title: 'Git 변경 상태 확인', count: 1 },
  ])
  assert.equal(formatTitleTally(firstRun.titles), '파일 읽기 ×3 · 텍스트 검색 ×2 · Git 변경 상태 확인')
  assert.equal(firstRun.startTime, Date.parse('2026-11-23T10:00:02.000Z'))
  assert.equal(firstRun.endTime, Date.parse('2026-11-23T10:00:07.000Z'))

  const secondRun = entries[2]
  assert.equal(secondRun.kind, 'run')
  assert.equal(
    formatTitleTally(secondRun.titles, 4),
    '파일 읽기 · 텍스트 검색 · 코드 변경 비교 · 폴더 내용 확인 외 1종',
  )
})

test('세션 기록은 호출 부모를 추론하지 않고 도구 입력 요약을 보존한다', () => {
  const text = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }),
    item({ type: 'function_call', name: 'exec_command', call_id: 'a', arguments: '{"cmd":"git status"}' }),
    item({ type: 'function_call', name: 'read_file', call_id: 'b', arguments: '{"file_path":"src/main/index.ts"}' }),
    item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'c', input: '*** Begin Patch\n*** Update File: src/app.ts\n*** End Patch' }),
  )
  const { snapshot } = parseSession('rollout-session.jsonl', text)
  const turn = snapshot.timeline.turns[0]
  assert.ok(turn.actions.every((action) => action.parent === undefined))
  const summaries = turn.actions.map((action) => action.summary)
  assert.equal(summaries[1], 'exec_command · git status')
  assert.equal(summaries[2], 'read_file · src/main/index.ts')
  assert.equal(summaries[3], 'apply_patch · *** Update File: src/app.ts')
})

test('상세 트레이스는 확인된 코드 실행과 하위 도구만 중첩 묶음으로 구성한다', () => {
  const win = (seq: number, ms = 1000 + seq * 100) => ({
    status: 'completed',
    started_at_unix_ms: ms,
    started_seq: seq,
  })
  const state = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: {
      t1: { thread_id: 'root', execution: win(1) },
      t2: { thread_id: 'root', execution: win(20) },
    },
    threads: { root: { execution: win(1) } },
    conversation_items: {},
    inference_calls: {},
    tool_calls: {
      exec1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'exec' },
        execution: win(2),
        started_code_cell_id: 'cell1',
      },
      sub1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'src/a.ts' }) },
        requester: { code_cell_id: 'cell1' },
        execution: win(3),
      },
      sub2: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'exec_command' },
        summary: { input_preview: JSON.stringify({ cmd: 'rg -n target src' }) },
        execution: win(4),
      },
      waited: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'wait' },
        execution: win(5),
      },
      sub3: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'src/b.ts' }) },
        execution: win(7),
      },
      otherTurnTool: {
        thread_id: 'root',
        started_by_codex_turn_id: 't2',
        kind: { type: 'read_file' },
        execution: win(21),
      },
    },
    code_cells: {
      cell1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        runtime_status: 'completed',
        execution: win(2),
        nested_tool_call_ids: ['sub1', 'sub2', 'otherTurnTool'],
        wait_tool_call_ids: ['waited'],
      },
      orphanCell: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        runtime_status: 'completed',
        source_js: 'await tools.read_file({ file_path: "src/b.ts" })',
        execution: win(6),
        nested_tool_call_ids: ['sub3'],
      },
    },
    terminal_operations: {},
    terminal_sessions: {},
    compactions: {},
    compaction_requests: {},
    interaction_edges: {},
    raw_payloads: {},
  }

  const trace = parseTrace('trace-calls', state, rawIndex('{"seq":2,"wall_time_unix_ms":1200}\n'), new Set())
  const t1 = trace.timeline.turns.find((turn) => turn.id === 'turn:t1')!
  const t2 = trace.timeline.turns.find((turn) => turn.id === 'turn:t2')!

  const byId = new Map(t1.actions.map((action) => [action.id, action]))
  assert.deepEqual(byId.get('tool_calls:sub1')?.parent, {
    id: 'tool_calls:exec1',
    rule: 'started_code_cell_id · nested_tool_call_ids · requester.code_cell_id',
  })
  assert.deepEqual(byId.get('tool_calls:sub2')?.parent, {
    id: 'tool_calls:exec1',
    rule: 'started_code_cell_id · nested_tool_call_ids',
  })
  assert.equal(byId.get('tool_calls:waited')?.parent, undefined)
  assert.equal(t2.actions.find((action) => action.id === 'tool_calls:otherTurnTool')?.parent, undefined)
  assert.deepEqual(byId.get('tool_calls:sub3')?.parent, {
    id: 'code_cells:orphanCell',
    rule: 'nested_tool_call_ids',
  })
  assert.equal(byId.get('code_cells:orphanCell')?.reading?.title, '코드 실행')
  assert.deepEqual(trace.graph.childrenByParent.get('code_cells:cell1'), ['tool_calls:sub1', 'tool_calls:sub2'])
  assert.ok(trace.graph.edgesByNode.get('tool_calls:otherTurnTool')?.some(({ kind, from }) => kind === 'reference' && from === 'code_cells:cell1'))
  assert.ok(trace.graph.edgesByNode.get('tool_calls:sub1')?.some(({ kind, from, provenance }) => (
    kind === 'containment' && from === 'tool_calls:exec1' && provenance.level === 'rule-derived'
  )))

  assert.deepEqual(summarizeTurnProgress(t1), { messages: 0, tools: 6, nested: 3 })

  const flow = buildProgressFlow(t1.actions.filter((action) => action.reading?.stage === 'progress'))
  assert.deepEqual(flow.map((entry) => entry.kind), ['call-group', 'action', 'call-group'])
  const firstGroup = flow[0]
  assert.equal(firstGroup.kind, 'call-group')
  assert.equal(firstGroup.id, 'call:tool_calls:exec1')
  assert.equal(firstGroup.descendantCount, 2)
  assert.deepEqual(firstGroup.rules, ['started_code_cell_id', 'nested_tool_call_ids', 'requester.code_cell_id'])

  const order = visibleReadingOrder(t1)
  assert.deepEqual(
    order.map((entry) => [entry.action.id, entry.groupIds]),
    [
      ['tool_calls:exec1', []],
      ['tool_calls:sub1', ['call:tool_calls:exec1']],
      ['tool_calls:sub2', ['call:tool_calls:exec1']],
      ['tool_calls:waited', []],
      ['code_cells:orphanCell', []],
      ['tool_calls:sub3', ['call:code_cells:orphanCell']],
    ],
  )
})

test('타임라인 검색은 맥락과 그룹 위치 정보를 유지하고 안전한 강조 조각을 만든다', () => {
  const text = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }),
    item({ type: 'message', role: 'user', content: [{ text: '레포 상태 확인' }] }),
    item({ type: 'function_call', name: 'exec_command', call_id: 'c1', arguments: '{"cmd":"git status"}' }),
    item({ type: 'function_call', name: 'exec_command', call_id: 'c2', arguments: '{"cmd":"rg -n MatchNeedle src"}' }),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: 'MatchNeedle 결과를 정리했습니다.' }] }),
  )
  const { snapshot } = parseSession('rollout-search.jsonl', text)
  const turns = snapshot.timeline.turns

  const readingSearch = searchTimeline(turns, 'git status', false)
  assert.equal(readingSearch.matches.length, 1)
  assert.equal(readingSearch.turnMatchCounts.get('turn:turn-1'), 1)
  const [hit] = readingSearch.matches
  assert.equal(hit.groupIds.length, 1)
  assert.ok(hit.groupIds[0].startsWith('run:'))
  assert.equal(readingSearch.groupMatchCounts.get(hit.groupIds[0]), 1)
  assert.equal(hit.hiddenHint, 'exec_command · git status')

  const multiWord = searchTimeline(turns, 'ＲＧ matchneedle', false)
  assert.equal(multiWord.matches.length, 1)

  const rawSearch = searchTimeline(turns, 'MatchNeedle', true)
  assert.equal(rawSearch.matches.length, 2)
  assert.ok(rawSearch.matches.every((match) => match.groupIds.length === 0))

  assert.deepEqual(
    highlightSegments('readFile and Read', ['read', 'readfile']),
    [
      { text: 'readFile', match: true },
      { text: ' and ', match: false },
      { text: 'Read', match: true },
    ],
  )
})
