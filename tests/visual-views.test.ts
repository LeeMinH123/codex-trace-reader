import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSession } from '../src/main/records/session'
import { parseTrace } from '../src/main/records/trace'
import { rawIndex } from '../src/main/records/trace-evidence'
import { buildTurnGraph } from '../src/renderer/src/app/turn-graph'
import { buildTurnTimeline, formatDuration } from '../src/renderer/src/app/turn-timeline'

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

test('세션과 상세 트레이스는 종료 시각과 모델 시작 연결을 채운다', () => {
  const sessionText = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-1' }, '2026-11-23T10:00:00.000Z'),
    item({ type: 'message', role: 'user', content: [{ text: '확인해줘' }] }, '2026-11-23T10:00:01.000Z'),
    item({ type: 'function_call', name: 'read_file', call_id: 'c1', arguments: '{"file_path":"a.ts"}' }, '2026-11-23T10:00:02.000Z'),
    item({ type: 'function_call_output', call_id: 'c1', output: 'ok' }, '2026-11-23T10:00:03.500Z'),
    event({ type: 'task_complete', turn_id: 'turn-1' }, '2026-11-23T10:00:05.000Z'),
  )
  const session = parseSession('rollout-time.jsonl', sessionText)
  const sessionTurn = session.snapshot.timeline.turns.find((t) => t.id === 'turn:turn-1')!
  const sessionRead = sessionTurn.actions.find((a) => a.reading?.target?.text === 'a.ts')!
  assert.equal(sessionRead.time, Date.parse('2026-11-23T10:00:02.000Z'))
  assert.equal(sessionRead.endTime, Date.parse('2026-11-23T10:00:03.500Z'))
  assert.equal(sessionRead.startedById, undefined)
  assert.equal(sessionTurn.endTime, Date.parse('2026-11-23T10:00:05.000Z'))

  const state = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: {
      t1: {
        thread_id: 'root',
        execution: { status: 'completed', started_at_unix_ms: 1000, ended_at_unix_ms: 6000, started_seq: 1 },
      },
    },
    threads: { root: { execution: { status: 'completed', started_at_unix_ms: 1000, started_seq: 1 } } },
    conversation_items: {},
    inference_calls: {
      m1: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5',
        execution: { status: 'completed', started_at_unix_ms: 1100, ended_at_unix_ms: 2000, started_seq: 2 },
        request_item_ids: [],
        response_item_ids: [],
        tool_call_ids_started_by_response: ['t1'],
      },
    },
    tool_calls: {
      t1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'b.ts' }) },
        execution: { status: 'completed', started_at_unix_ms: 2100, ended_at_unix_ms: 2900, started_seq: 3 },
      },
    },
    code_cells: {},
    terminal_operations: {},
    terminal_sessions: {},
    compactions: {},
    compaction_requests: {},
    interaction_edges: {},
    raw_payloads: {},
  }
  const trace = parseTrace('trace-time', state, rawIndex('{"seq":1,"wall_time_unix_ms":1000}\n'), new Set())
  const traceTurn = trace.timeline.turns.find((t) => t.id === 'turn:t1')!
  const traceTool = traceTurn.actions.find((a) => a.id === 'tool_calls:t1')!
  assert.equal(traceTurn.endTime, 6000)
  assert.equal(traceTool.endTime, 2900)
  assert.equal(traceTool.startedById, 'inference_calls:m1')
})

test('buildTurnGraph는 트레이스에서 확인된 DAG와 세션에서 흐름도를 구성한다', () => {
  const outputItem = (seq: number, text: string) => ({
    responses_item_id: `resp-${seq}`,
    thread_id: 'root',
    codex_turn_id: 't1',
    kind: 'function_call_output',
    first_seen_at_unix_ms: 1000 + seq * 100,
    accepted_seq: seq,
    body: { parts: [{ text }] },
  })
  const traceState = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: {
      t1: { thread_id: 'root', execution: { status: 'completed', started_at_unix_ms: 1000, ended_at_unix_ms: 5000, started_seq: 1 } },
    },
    threads: { root: { execution: { status: 'completed', started_at_unix_ms: 1000, started_seq: 1 } } },
    conversation_items: {
      u1: {
        responses_item_id: 'r-u1',
        thread_id: 'root',
        codex_turn_id: 't1',
        kind: 'message',
        role: 'user',
        first_seen_at_unix_ms: 1050,
        accepted_seq: 2,
        body: { parts: [{ text: '코드 실행해줘' }] },
      },
      out1: outputItem(6, 'nested result'),
      a1: {
        responses_item_id: 'r-a1',
        thread_id: 'root',
        codex_turn_id: 't1',
        kind: 'message',
        role: 'assistant',
        channel: 'final',
        first_seen_at_unix_ms: 4900,
        accepted_seq: 12,
        body: { parts: [{ text: '완료' }] },
      },
    },
    inference_calls: {
      m1: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5',
        execution: { status: 'completed', started_at_unix_ms: 1100, ended_at_unix_ms: 1500, started_seq: 3 },
        request_item_ids: ['u1'],
        response_item_ids: [],
        tool_call_ids_started_by_response: ['exec1'],
      },
      m2: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5',
        execution: { status: 'completed', started_at_unix_ms: 3500, ended_at_unix_ms: 4800, started_seq: 10 },
        request_item_ids: ['u1', 'out1'],
        response_item_ids: ['a1'],
        tool_call_ids_started_by_response: [],
      },
    },
    tool_calls: {
      exec1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'exec' },
        started_code_cell_id: 'cell1',
        execution: { status: 'completed', started_at_unix_ms: 1600, ended_at_unix_ms: 3000, started_seq: 4 },
      },
      sub1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'prd.md' }) },
        requester: { code_cell_id: 'cell1' },
        model_visible_output_item_ids: ['out1'],
        execution: { status: 'completed', started_at_unix_ms: 1800, ended_at_unix_ms: 2200, started_seq: 5 },
      },
    },
    code_cells: {
      cell1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        execution: { status: 'completed', started_at_unix_ms: 1600, ended_at_unix_ms: 3000, started_seq: 4 },
        nested_tool_call_ids: ['sub1'],
      },
    },
    terminal_operations: {},
    terminal_sessions: {},
    compactions: {},
    compaction_requests: {},
    interaction_edges: {},
    raw_payloads: {},
  }

  const trace = parseTrace('trace-dag', traceState, rawIndex('{"seq":1,"wall_time_unix_ms":1000}\n'), new Set())
  const t1 = trace.timeline.turns.find((t) => t.id === 'turn:t1')!
  const dag = buildTurnGraph(t1, new Set())
  assert.equal(dag.mode, 'dag')
  assert.ok(dag.edges.some((e) => e.from === 'inference_calls:m1' && e.to === 'tool_calls:exec1' && e.kind === 'confirmed-call'))
  assert.ok(dag.edges.some((e) => e.from === 'tool_calls:exec1' && e.to === 'inference_calls:m2' && e.kind === 'confirmed-delivery'))
  const execNode = dag.stages.flatMap((s) => s.nodes).find((n) => n.id === 'tool_calls:exec1')!
  assert.equal(execNode.nestedCount, 1)
  assert.equal(execNode.nestedChildren?.[0].id, 'tool_calls:sub1')

  const sessionText = log(
    meta,
    event({ type: 'task_started', turn_id: 'turn-s' }, '2026-11-23T10:00:00.000Z'),
    item({ type: 'message', role: 'user', content: [{ text: '파일 읽고 검색해줘' }] }, '2026-11-23T10:00:01.000Z'),
    item({ type: 'function_call', name: 'read_file', call_id: 'r1', arguments: '{"file_path":"a.ts"}' }, '2026-11-23T10:00:02.000Z'),
    item({ type: 'function_call_output', call_id: 'r1', output: 'a' }, '2026-11-23T10:00:03.000Z'),
    item({ type: 'function_call', name: 'read_file', call_id: 'r2', arguments: '{"file_path":"b.ts"}' }, '2026-11-23T10:00:04.000Z'),
    item({ type: 'function_call_output', call_id: 'r2', output: 'b' }, '2026-11-23T10:00:05.000Z'),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '읽기 완료' }] }, '2026-11-23T10:00:06.000Z'),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: '답변' }] }, '2026-11-23T10:00:07.000Z'),
  )
  const session = parseSession('rollout-flow.jsonl', sessionText)
  const sTurn = session.snapshot.timeline.turns[0]
  const collapsed = buildTurnGraph(sTurn, new Set())
  assert.equal(collapsed.mode, 'flow')
  assert.ok(collapsed.edges.every((e) => e.kind === 'sequence'))
  const runNode = collapsed.stages.flatMap((s) => s.nodes).find((n) => n.kind === 'run')!
  assert.equal(runNode.count, 2)
  assert.equal(runNode.expanded, false)

  const expanded = buildTurnGraph(sTurn, new Set([runNode.groupId!]))
  const expandedStages = expanded.stages.map((s) => s.nodes.map((n) => n.kind))
  assert.deepEqual(expandedStages, [['request'], ['run'], ['message'], ['answer']])
  const expandedRun = expanded.stages.flatMap((s) => s.nodes).find((n) => n.kind === 'run')!
  assert.equal(expandedRun.expanded, true)
  assert.equal(expandedRun.actions?.length, 2)
})

test('buildTurnTimeline과 formatDuration은 상대 위치·중첩 깊이·소요시간을 정확히 계산한다', () => {
  assert.equal(formatDuration(null), '')
  assert.equal(formatDuration(450), '450ms')
  assert.equal(formatDuration(1500), '1.5s')
  assert.equal(formatDuration(65000), '1m 5s')

  const state = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: {
      t1: { thread_id: 'root', execution: { status: 'completed', started_at_unix_ms: 1000, ended_at_unix_ms: 5000, started_seq: 1 } },
    },
    threads: { root: { execution: { status: 'completed', started_at_unix_ms: 1000, started_seq: 1 } } },
    conversation_items: {},
    inference_calls: {
      m1: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5',
        execution: { status: 'completed', started_at_unix_ms: 1000, ended_at_unix_ms: 2000, started_seq: 2 },
        request_item_ids: [],
        response_item_ids: [],
        tool_call_ids_started_by_response: ['exec1'],
      },
    },
    tool_calls: {
      exec1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'exec' },
        started_code_cell_id: 'cell1',
        execution: { status: 'completed', started_at_unix_ms: 2000, ended_at_unix_ms: 5000, started_seq: 3 },
      },
      sub1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'x.ts' }) },
        requester: { code_cell_id: 'cell1' },
        execution: { status: 'completed', started_at_unix_ms: 2500, ended_at_unix_ms: 3500, started_seq: 4 },
      },
    },
    code_cells: {
      cell1: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        execution: { status: 'completed', started_at_unix_ms: 2000, ended_at_unix_ms: 5000, started_seq: 3 },
        nested_tool_call_ids: ['sub1'],
      },
    },
    terminal_operations: {},
    terminal_sessions: {},
    compactions: {},
    compaction_requests: {},
    interaction_edges: {},
    raw_payloads: {},
  }

  const trace = parseTrace('trace-wf', state, rawIndex('{"seq":1,"wall_time_unix_ms":1000}\n'), new Set())
  const t1 = trace.timeline.turns.find((t) => t.id === 'turn:t1')!
  const timeline = buildTurnTimeline(t1)

  assert.equal(timeline.startMs, 1000)
  assert.equal(timeline.endMs, 5000)
  assert.equal(timeline.totalMs, 4000)
  assert.equal(timeline.ticks.length, 5)
  assert.deepEqual(
    timeline.bars.map((b) => [b.action.id, b.depth, b.startPct, b.widthPct, b.durationMs]),
    [
      ['inference_calls:m1', 0, 0, 25, 1000],
      ['tool_calls:exec1', 0, 25, 75, 3000],
      ['tool_calls:sub1', 1, 37.5, 25, 1000],
    ],
  )
})
