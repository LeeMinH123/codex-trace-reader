import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseSession } from '../../src/main/records/parsing/session'
import { parseTrace } from '../../src/main/records/parsing/trace'
import { rawIndex } from '../../src/main/records/parsing/trace-evidence'
import { ReaderWorkspace } from '../../src/main/sources/workspace'

const sessionMeta = JSON.stringify({ type: 'session_meta', payload: { id: 'root' } })

test('세션은 마지막 미완성 줄과 이전 줄의 원시 근거를 구별한다', () => {
  const session = parseSession('rollout-check.jsonl', sessionMeta + '\n{"type":')
  const [record] = session.snapshot.timeline.turns.flatMap((turn) => turn.actions)
  assert.match(session.snapshot.timeline.note ?? '', /끝나지 않아/)
  assert.equal(session.snapshot.inspect(record.id)?.evidence[0].text, sessionMeta)
  assert.throws(() => parseSession('rollout-check.jsonl', sessionMeta + '\n{"type":\n'), /2번째/)
})

test('동명 도구의 상태와 종료 코드를 표시하고 ID가 일치하는 모델 요청만 연결한다', () => {
  const window = (seq: number) => ({ status: 'completed', started_at_unix_ms: 1000, started_seq: seq })
  const tool = (seq: number, out: string, operation?: string) => ({
    thread_id: 'root', started_by_codex_turn_id: 'turn', kind: { type: 'exec_command' },
    execution: window(seq), model_visible_output_item_ids: [out], terminal_operation_id: operation,
  })
  const state = {
    root_thread_id: 'root', recording_status: 'unclosed',
    codex_turns: { turn: { thread_id: 'root', execution: window(1) } },
    threads: { root: { execution: window(1) } }, conversation_items: {},
    inference_calls: {
      exact: { thread_id: 'root', codex_turn_id: 'turn', execution: window(8), request_item_ids: ['returned'] },
      other: { thread_id: 'root', codex_turn_id: 'turn', execution: window(9), request_item_ids: ['another-item'] },
    },
    tool_calls: { a: tool(3, 'returned', 'terminal'), b: tool(2, 'unused') },
    terminal_operations: { terminal: {
      tool_call_id: 'a', execution: window(4), result: { exit_code: 1 },
      request: { command: ['C:\\Windows\\powershell.exe', '-NoProfile', '-Command', 'Get-Content -LiteralPath "C:\\My Project\\SKILL.md"'] },
    } },
    code_cells: {}, terminal_sessions: {}, compactions: {}, compaction_requests: {}, interaction_edges: {}, raw_payloads: {},
  }
  const trace = parseTrace('trace-check', state, rawIndex('{"seq":3,"wall_time_unix_ms":1000}'), new Set())
  const tools = trace.timeline.turns.flatMap((turn) => turn.actions).filter((action) => action.kind === 'tool')
  assert.deepEqual(tools.map((action) => action.id), ['tool_calls:b', 'tool_calls:a'])
  assert.equal(tools[1].status, '호출 종료 · 종료 코드 1')
  assert.deepEqual(tools[1].reading, { stage: 'progress', title: '파일 읽기', target: { label: '읽기 대상', text: 'SKILL.md' }, outcome: '종료 코드 1' })
  assert.deepEqual(
    trace.inspect(tools[1].id)?.relations.map((relation) => relation.target),
    ['inference_calls:exact', 'terminal_operations:terminal'],
  )
  assert.ok(trace.inspect(tools[1].id)?.evidence.some((evidence) => evidence.type === 'raw'))
})

test('잘못된 경로와 다른 채팅은 등록을 막고 갱신 실패 후 세션 근거를 유지한다', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'trace-reader-test-'))
  try {
    const reader = new ReaderWorkspace()
    const session = join(temp, 'rollout-check.jsonl')
    await writeFile(session, sessionMeta)
    await reader.openSession(session)
    const opened = reader.view().session!
    const rawAction = opened.timeline.turns[0].actions[0]

    async function bundle(name: string, id: string, root = 'root', raw = 'trace.jsonl') {
      const path = join(temp, `trace-${name}`)
      await mkdir(path)
      await writeFile(join(path, 'manifest.json'), JSON.stringify({
        schema_version: 3, trace_id: id, root_thread_id: root, rollout_id: 'run',
        started_at_unix_ms: 1000, raw_event_log: raw, payloads_dir: 'payloads',
      }))
      return path
    }
    const first = await bundle('a', 'a')
    await bundle('b', 'b')
    const different = await bundle('other', 'other', 'elsewhere')
    const escaping = await bundle('escape', 'escape', 'root', '../trace.jsonl')
    await reader.openBundle(different)
    assert.match(reader.view().issues[0].message, /세션과 다릅니다/)
    await reader.openBundle(escaping)
    assert.match(reader.view().issues[0].message, /표준 번들 경로/)
    await reader.openBundle(first)
    assert.deepEqual((await reader.discover()).candidates.map((candidate) => candidate.id), ['b'])
    await reader.addCandidate('b')
    await reader.openBundle(first)
    assert.deepEqual(reader.view().bundles.map((registered) => registered.id), ['a', 'b'])

    await rename(session, join(temp, 'moved.jsonl'))
    await reader.refresh()
    const failed = reader.view()
    assert.equal(failed.session?.timeline.token, opened.timeline.token)
    assert.ok(failed.issues.some((issue) => issue.path.endsWith('rollout-check.jsonl')))
    assert.equal(reader.inspect(opened.timeline.token, rawAction.id)?.evidence[0].text, sessionMeta)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
