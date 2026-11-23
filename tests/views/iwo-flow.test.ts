import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSession } from '../../src/main/records/parsing/session'
import { parseTrace } from '../../src/main/records/parsing/trace'
import { rawIndex } from '../../src/main/records/parsing/trace-evidence'
import { buildTurnIwo } from '../../src/renderer/src/model/turn-iwo'

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

test('세션 기록은 반환 미리보기와 지침 ID를 채우고 전달 화살표는 만들지 않는다', () => {
  const text = log(
    meta,
    item({ type: 'message', role: 'developer', content: [{ text: '공통 개발자 지침' }] }, '2026-11-23T10:00:00.000Z'),
    event({ type: 'task_started', turn_id: 'turn-1' }, '2026-11-23T10:00:01.000Z'),
    item({ type: 'message', role: 'user', content: [{ text: '파일을 읽고 테스트해줘.' }] }, '2026-11-23T10:00:02.000Z'),
    { type: 'turn_context', timestamp: '2026-11-23T10:00:02.500Z', payload: { turn_id: 'turn-1', cwd: 'C:/repo' } },
    item({ type: 'function_call', name: 'exec_command', call_id: 'c1', arguments: '{"cmd":"Get-Content SKILL.md"}' }, '2026-11-23T10:00:03.000Z'),
    item({ type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: '스킬 본문 첫 줄', exit_code: 0 }) }, '2026-11-23T10:00:04.000Z'),
    item({ type: 'function_call', name: 'read_file', call_id: 'c2', arguments: '{"file_path":"prd.md"}' }, '2026-11-23T10:00:05.000Z'),
    item({ type: 'function_call_output', call_id: 'c2', output: 'PRD 본문 미리보기' }, '2026-11-23T10:00:06.000Z'),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: '확인을 마쳤습니다.' }] }, '2026-11-23T10:00:07.000Z'),
    event({ type: 'task_complete', turn_id: 'turn-1' }, '2026-11-23T10:00:08.000Z'),
  )

  const { snapshot } = parseSession('rollout-iwo.jsonl', text)
  const turn = snapshot.timeline.turns.find((entry) => entry.id === 'turn:turn-1')!
  const readCmd = turn.actions.find((action) => action.reading?.title === '파일 읽기' && action.reading.target?.text === 'SKILL.md')!
  const readTool = turn.actions.find((action) => action.reading?.target?.text === 'prd.md')!

  assert.equal(readCmd.outputPreview, '스킬 본문 첫 줄')
  assert.equal(readTool.outputPreview, 'PRD 본문 미리보기')
  assert.ok(turn.actions.every((action) => action.deliveries === undefined))

  assert.equal(turn.instructionIds?.length, 2)
  const allActions = new Map(snapshot.timeline.turns.flatMap((entry) => entry.actions.map((action) => [action.id, action])))
  const instructionLabels = turn.instructionIds!.map((id) => allActions.get(id)?.label)
  assert.deepEqual(instructionLabels, ['개발자 지침', '설정 기록'])
})

test('상세 트레이스는 확인된 전달 화살표와 모델 요청의 새로 들어온 항목을 구분한다', () => {
  const win = (seq: number, ms = 1000 + seq * 1000) => ({
    status: 'completed',
    started_at_unix_ms: ms,
    started_seq: seq,
  })
  const msgItem = (seq: number, role: string, text: string, turnId = 't1', channel?: string) => ({
    responses_item_id: `resp-${seq}`,
    thread_id: 'root',
    codex_turn_id: turnId,
    kind: 'message',
    role,
    channel,
    first_seen_at_unix_ms: 1000 + seq * 1000,
    accepted_seq: seq,
    body: { parts: [{ text }] },
  })
  const outputItem = (seq: number, text: string, turnId = 't1') => ({
    responses_item_id: `resp-${seq}`,
    thread_id: 'root',
    codex_turn_id: turnId,
    kind: 'function_call_output',
    first_seen_at_unix_ms: 1000 + seq * 1000,
    accepted_seq: seq,
    body: { parts: [{ text }] },
  })

  const state = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: {
      t0: { thread_id: 'root', execution: win(1) },
      t1: { thread_id: 'root', execution: win(10), input_item_ids: ['user1'] },
    },
    threads: { root: { execution: win(1) } },
    conversation_items: {
      sys0: msgItem(1, 'developer', '루트 지침', 't0'),
      priorMsg: msgItem(2, 'assistant', '이전 턴 응답', 't0', 'final'),
      user1: msgItem(10, 'user', 'SKILL.md 읽어줘', 't1'),
      skillOut: outputItem(14, 'SKILL 문서 본문입니다.', 't1'),
      final1: msgItem(18, 'assistant', '읽었습니다.', 't1', 'final'),
    },
    inference_calls: {
      call1: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5',
        execution: win(11),
        request_item_ids: ['sys0', 'priorMsg', 'user1'],
        response_item_ids: [],
        tool_call_ids_started_by_response: ['readSkill'],
      },
      call2: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5',
        execution: win(16),
        request_item_ids: ['sys0', 'priorMsg', 'user1', 'skillOut'],
        response_item_ids: ['final1'],
        tool_call_ids_started_by_response: [],
      },
    },
    tool_calls: {
      readSkill: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'read_file' },
        summary: { input_preview: JSON.stringify({ file_path: 'SKILL.md' }) },
        model_visible_output_item_ids: ['skillOut'],
        execution: win(12),
      },
      unseenTool: {
        thread_id: 'root',
        started_by_codex_turn_id: 't1',
        kind: { type: 'exec_command' },
        summary: { input_preview: JSON.stringify({ cmd: 'git status' }) },
        model_visible_output_item_ids: [],
        execution: win(15),
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

  const trace = parseTrace('trace-iwo', state, rawIndex('{"seq":1,"wall_time_unix_ms":2000}\n'), new Set())
  const t1 = trace.timeline.turns.find((turn) => turn.id === 'turn:t1')!
  const readSkill = t1.actions.find((action) => action.id === 'tool_calls:readSkill')!
  const unseenTool = t1.actions.find((action) => action.id === 'tool_calls:unseenTool')!

  assert.equal(readSkill.outputPreview, 'SKILL 문서 본문입니다.')
  assert.equal(readSkill.deliveries?.length, 1)
  assert.equal(readSkill.deliveries?.[0].targetId, 'inference_calls:call2')
  assert.equal(readSkill.deliveries?.[0].itemIds.length, 1)
  const deliveredItemId = readSkill.deliveries![0].itemIds[0]
  assert.ok(deliveredItemId.startsWith('conversation_items:skillOut:'))
  assert.equal(unseenTool.deliveries, undefined)

  assert.equal(t1.instructionIds?.length, 1)
  assert.ok(t1.instructionIds?.[0].startsWith('conversation_items:sys0:'))

  const firstCallDetail = trace.inspect('inference_calls:call1')?.modelRequest
  assert.ok(firstCallDetail)
  assert.equal(firstCallDetail.hasPrevious, false)
  assert.deepEqual(
    firstCallDetail.inputs.map((entry) => [entry.role, entry.fresh]),
    [
      ['instruction', false],
      ['assistant', false],
      ['user', true],
    ],
  )
  assert.deepEqual(
    firstCallDetail.outputs.map((entry) => [entry.id, entry.kind]),
    [['tool_calls:readSkill', 'tool']],
  )

  const secondCallDetail = trace.inspect('inference_calls:call2')?.modelRequest
  assert.ok(secondCallDetail)
  assert.equal(secondCallDetail.hasPrevious, true)
  assert.deepEqual(
    secondCallDetail.inputs.map((entry) => [entry.id, entry.role, entry.fresh]),
    [
      [t1.instructionIds![0], 'instruction', false],
      [firstCallDetail.inputs[1].id, 'assistant', false],
      [firstCallDetail.inputs[2].id, 'user', false],
      [deliveredItemId, 'tool', true],
    ],
  )
  assert.equal(secondCallDetail.outputs[0].kind, 'message')
  assert.equal(secondCallDetail.outputs[0].preview, '읽었습니다.')
})

test('buildTurnIwo는 요청·지침, 작업 요약, 답변과 확인된 수정·검증을 정리한다', () => {
  const text = log(
    meta,
    item({ type: 'message', role: 'developer', content: [{ text: '지침' }] }),
    event({ type: 'task_started', turn_id: 'turn-1' }),
    item({ type: 'message', role: 'user', content: [{ text: '문서를 수정하고 테스트를 돌려줘.' }] }),
    item({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ text: '수정을 시작합니다.' }] }),
    item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'p1', input: '*** Begin Patch\n*** Update File: prd.md\n*** End Patch' }),
    item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'p2', input: '*** Begin Patch\n*** Update File: prd.md\n*** End Patch' }),
    item({ type: 'function_call', name: 'exec_command', call_id: 't1', arguments: '{"cmd":"npm test"}' }),
    item({ type: 'function_call_output', call_id: 't1', output: { exit_code: 0 } }),
    item({ type: 'message', role: 'assistant', phase: 'final', content: [{ text: 'prd.md를 수정했고 npm test가 코드 0으로 종료했습니다.' }] }),
  )

  const { snapshot } = parseSession('rollout-build-iwo.jsonl', text)
  const actionsById = new Map(snapshot.timeline.turns.flatMap((turn) => turn.actions.map((action) => [action.id, action])))
  const turn = snapshot.timeline.turns.find((entry) => entry.id === 'turn:turn-1')!
  const iwo = buildTurnIwo(turn, actionsById)

  assert.equal(iwo.input.requests.length, 1)
  assert.equal(iwo.input.instructions.length, 1)
  assert.deepEqual({ messages: iwo.work.messages, tools: iwo.work.tools, nested: iwo.work.nested }, {
    messages: 1,
    tools: 3,
    nested: 0,
  })
  assert.deepEqual(iwo.work.topTitles, [
    { title: '파일 수정', count: 2 },
    { title: '테스트 실행', count: 1 },
  ])
  assert.equal(iwo.output.answers.length, 1)
  assert.equal(iwo.output.modifiedFiles.length, 1)
  assert.equal(iwo.output.modifiedFiles[0].file, 'prd.md')
  assert.equal(iwo.output.verifications.length, 1)
  assert.equal(iwo.output.verifications[0].outcome, '정상 종료 · 코드 0')
})
