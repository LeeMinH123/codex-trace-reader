import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSession } from '../../src/main/records/parsing/session'
import { parseTrace } from '../../src/main/records/parsing/trace'
import { rawIndex } from '../../src/main/records/parsing/trace-evidence'
import { describeCodeExecution } from '../../src/main/records/reading/tool-reading'
import { buildTurnStory } from '../../src/renderer/src/model/story-chapters'

const thread = '00000000-0000-0000-0000-000000000099'
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

test('describeCodeExecution은 Computer Use, 파일/명령 호출, 폴백을 의미 단위로 요약한다', () => {
  assert.deepEqual(
    describeCodeExecution(`await page.click('.story-expand-btn'); await page.screenshot({ path: 'tmp/step1.png' })`),
    { title: '화면 클릭 후 캡처', target: { label: '대상', text: '.story-expand-btn' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await page.getByText('타임라인').click()`),
    { title: '화면 클릭', target: { label: '대상', text: '타임라인' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await page.mouse.click(240, 180)`),
    { title: '화면 클릭', target: { label: '대상', text: '(240, 180)' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await page.fill('input[name="q"]', 'auth'); await page.screenshot()`),
    { title: '키보드 입력 후 캡처', target: { label: '입력', text: 'auth' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await page.keyboard.press('Enter')`),
    { title: '키보드 입력', target: { label: '키', text: 'Enter' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await page.mouse.wheel(0, 400)`),
    { title: '화면 스크롤', target: undefined },
  )
  assert.deepEqual(
    describeCodeExecution(`await _electron.launch({ args: ['out/main/index.js'] })`),
    { title: '앱·페이지 열기', target: { label: '대상', text: 'index.js' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await page.goto('http://localhost:5173')`),
    { title: '앱·페이지 열기', target: { label: '주소', text: 'http://localhost:5173' } },
  )
  assert.deepEqual(
    describeCodeExecution(`const shot = await page.screenshot({ path: 'shots/timeline.png' })`),
    { title: '화면 캡처', target: { label: '파일', text: 'timeline.png' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await codex.tool('view_image', { path: 'shots/inspect.png' })`),
    { title: '이미지 확인', target: { label: '파일', text: 'inspect.png' } },
  )
  assert.deepEqual(
    describeCodeExecution(`await codex.tool('read_file', { file_path: 'src/app.ts' })`),
    { title: '파일 읽기', target: { label: '읽기 대상', text: 'app.ts' } },
  )
  assert.deepEqual(
    describeCodeExecution(`execSync('npm test')`),
    { title: '테스트 실행' },
  )
  assert.deepEqual(
    describeCodeExecution(`const raw = fs.readFileSync('package.json', 'utf8')`),
    { title: '파일 읽기', target: { label: '읽기 대상', text: 'package.json' } },
  )
  assert.deepEqual(
    describeCodeExecution(`fs.writeFileSync('notes/summary.md', 'ok')`),
    { title: '파일 수정', target: { label: '파일 대상', text: 'summary.md' } },
  )
  assert.deepEqual(
    describeCodeExecution(`// 턴 목록 스크롤 위치 계산\nconst y = 10`),
    { title: '코드 실행', target: { label: '내용', text: '턴 목록 스크롤 위치 계산' } },
  )
  const lineFallback = describeCodeExecution(`import fs from 'node:fs'\nprocess.stdout.write('ok')`)
  assert.equal(lineFallback?.title, '코드 실행')
  assert.equal(lineFallback?.target?.label, '실행')
  assert.equal(lineFallback?.target?.text, `process.stdout.write('ok')`)
})

test('parseSession은 지침 XML 태그를 분류·정리하고 반복 설정 기록을 하나로 추린다', () => {
  const ctx = { type: 'turn_context', payload: { turn_id: 'turn-1', cwd: 'C:/work/agent_log', model: 'gpt-5.4', approval_policy: 'on-request', sandbox_policy: { type: 'workspace-write' }, effort: 'high' } }
  const emptyCtx = { type: 'turn_context', payload: { turn_id: 'turn-1' } }
  const unlinkedEmptyCtx = { type: 'turn_context', payload: {} }

  const text = log(
    meta,
    unlinkedEmptyCtx,
    unlinkedEmptyCtx,
    item({ type: 'message', role: 'developer', content: [{ text: '<app-context> # Codex desktop context - Workspace active </app-context>' }] }),
    item({ type: 'message', role: 'developer', content: [{ text: '<app-context> # Codex desktop context - Workspace active </app-context>' }] }),
    item({ type: 'message', role: 'developer', content: [{ text: '<multi_agent_role>You are root coordinator</multi_agent_role>' }] }),
    item({ type: 'message', role: 'developer', content: [{ text: '<codex_apps_client_time_context><timezone>Asia/Seoul</timezone><current_date>2026-11-23</current_date></codex_apps_client_time_context>' }] }),
    event({ type: 'task_started', turn_id: 'turn-1' }),
    emptyCtx,
    ctx,
    item({ type: 'message', role: 'user', content: [{ text: '앱 화면을 점검해줘' }] }),
    event({ type: 'task_complete', turn_id: 'turn-1' }),
  )

  const { snapshot } = parseSession('rollout-inst.jsonl', text)
  const turn = snapshot.timeline.turns.find((t) => t.id === 'turn:turn-1')!
  const actionById = new Map(snapshot.timeline.turns.flatMap((t) => t.actions.map((a) => [a.id, a])))
  const instructions = (turn.instructionIds ?? []).map((id) => actionById.get(id)!)

  assert.equal(instructions.length, 4)
  assert.deepEqual(
    instructions.map((inst) => inst.label),
    ['앱·작업공간 맥락', '하위 에이전트 역할', '현재 시각 정보', '설정 기록'],
  )
  assert.ok(!instructions[0].summary.includes('<app-context>'))
  assert.ok(!instructions[1].summary.includes('<multi_agent_role>'))
  assert.equal(instructions[2].summary, 'Asia/Seoul · 2026-11-23')
  assert.equal(instructions[3].summary, '모델 gpt-5.4 · 폴더 agent_log · 승인 on-request · 샌드박스 workspace-write · 추론 high')

  const rawDetail = snapshot.inspect(instructions[0].id)
  assert.ok(rawDetail?.sections.some((sec) => sec.text.includes('<app-context>')))
})

test('parseTrace와 buildTurnStory는 code_cells의 source_js로 Computer Use 호출과 visualTags를 요약한다', () => {
  const state = {
    root_thread_id: 'root',
    recording_status: 'complete',
    status: 'completed',
    codex_turns: {
      t1: {
        thread_id: 'root',
        input_item_ids: ['u1'],
        execution: { status: 'completed', started_at_unix_ms: 1000, ended_at_unix_ms: 8000, started_seq: 1 },
      },
    },
    threads: {
      root: { agent_path: '/' },
    },
    conversation_items: {
      d1: { kind: 'message', role: 'developer', body: { parts: [{ text: '<app-context>Desktop session</app-context>' }] }, first_seen_at_unix_ms: 900, accepted_seq: 1 },
      d2: { kind: 'message', role: 'developer', body: { parts: [{ text: '<app-context>Desktop session</app-context>' }] }, first_seen_at_unix_ms: 901, accepted_seq: 2 },
      u1: { kind: 'message', role: 'user', codex_turn_id: 't1', body: { parts: [{ text: 'Computer Use로 확인해줘' }] }, accepted_at_unix_ms: 1000, accepted_seq: 3 },
      p1: { kind: 'message', role: 'assistant', channel: 'commentary', codex_turn_id: 't1', body: { parts: [{ text: 'Computer Use 스킬로 앱 화면을 점검하겠습니다.' }] }, accepted_at_unix_ms: 1500, accepted_seq: 4 },
      a1: { kind: 'message', role: 'assistant', channel: 'final', codex_turn_id: 't1', body: { parts: [{ text: '점검을 마쳤습니다.' }] }, accepted_at_unix_ms: 7500, accepted_seq: 15 },
    },
    inference_calls: {
      m1: {
        thread_id: 'root',
        codex_turn_id: 't1',
        model: 'gpt-5.4',
        request_item_ids: ['d1', 'd2', 'u1'],
        execution: { status: 'completed', started_at_unix_ms: 1100, ended_at_unix_ms: 1400, started_seq: 5 },
      },
    },
    code_cells: {
      cell1: { source_js: `await _electron.launch({ args: ['out/main/index.js'] })`, runtime_status: 'completed' },
      cell2: { source_js: `await page.click('.story-expand-btn'); await page.screenshot({ path: 'shots/step2.png' })`, runtime_status: 'completed' },
      cell3: { source_js: `await page.mouse.wheel(0, 500)`, runtime_status: 'completed' },
      cell4: { source_js: `await page.screenshot({ path: 'shots/final.png' })`, runtime_status: 'completed' },
    },
    tool_calls: {
      tc1: { kind: { type: 'exec' }, thread_id: 'root', started_by_codex_turn_id: 't1', started_code_cell_id: 'cell1', execution: { status: 'completed', started_at_unix_ms: 2000, ended_at_unix_ms: 3000, started_seq: 6 } },
      tc2: { kind: { type: 'exec' }, thread_id: 'root', started_by_codex_turn_id: 't1', started_code_cell_id: 'cell2', execution: { status: 'completed', started_at_unix_ms: 3100, ended_at_unix_ms: 4200, started_seq: 7 } },
      tc3: { kind: { type: 'exec' }, thread_id: 'root', started_by_codex_turn_id: 't1', started_code_cell_id: 'cell3', execution: { status: 'completed', started_at_unix_ms: 4300, ended_at_unix_ms: 4600, started_seq: 8 } },
      tc4: { kind: { type: 'exec' }, thread_id: 'root', started_by_codex_turn_id: 't1', started_code_cell_id: 'cell4', execution: { status: 'completed', started_at_unix_ms: 4700, ended_at_unix_ms: 5200, started_seq: 9 } },
    },
    terminal_operations: {},
    terminal_sessions: {},
    compactions: {},
    compaction_requests: {},
    interaction_edges: {},
    raw_payloads: {},
  }

  const trace = parseTrace('trace-semantic', state, rawIndex('{"seq":1,"wall_time_unix_ms":1000}\n'), new Set())
  const turn = trace.timeline.turns.find((t) => t.id === 'turn:t1')!
  const actionById = new Map(trace.timeline.turns.flatMap((t) => t.actions.map((a) => [a.id, a])))

  assert.equal(turn.instructionIds?.length, 1)
  const instAction = actionById.get(turn.instructionIds![0])!
  assert.equal(instAction.label, '앱·작업공간 맥락')
  assert.equal(instAction.summary, 'Desktop session')

  const story = buildTurnStory(turn, actionById)
  assert.equal(story.chapters.length, 1)
  assert.equal(story.chapters[0].totalActionCount, 4)
  assert.deepEqual(story.chapters[0].visualTags, [{ label: '화면', count: 4, phase: 'ui' }])
  assert.equal(
    story.chapters[0].summary,
    '앱·페이지 열기 (index.js) · 화면 클릭 후 캡처 (.story-expand-btn) · 화면 스크롤',
  )
  assert.deepEqual(
    story.chapters[0].actions.map((action) => action.reading?.title),
    ['앱·페이지 열기', '화면 클릭 후 캡처', '화면 스크롤', '화면 캡처'],
  )
})
