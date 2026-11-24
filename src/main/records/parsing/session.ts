import { createHash } from 'node:crypto'
import type { Action, ActionDetail, ActionKind, Turn } from '../../../shared/reader'
import type { EvidenceRef, ExecutionEdge, SourceCoverage } from '../../../shared/execution-graph'
import { buildExecutionGraph, type EventRecord } from '../core/execution-graph'
import { fields, messageText, preview, string, type Fields } from '../core/json'
import { parseRollout, type RolloutPart } from './rollout'
import {
  describeInstructionMessage, describeSettingsRecord, plainPreview, readableMessage,
  selectInstructionIds, userRequest,
} from '../reading/reading'
import { readableTool, structuredInput, toolName, toolOutcome } from '../reading/tool-reading'
import { chronologically, messageLabel, section, snapshot, type Snapshot } from '../core/timeline'

export interface SessionRecord {
  id: string
  title: string
  path: string
  rolloutId: string
  sourceIds: string[]
  snapshot: Snapshot
}

interface RecordDetail {
  sourceId: string
  path: string
  raw: string
  line: number
  rule: string
  turnProvenance: EventRecord['turnProvenance']
  actor?: EventRecord['actor']
  information?: EventRecord['information']
  fingerprint?: string
  tool?: { id: string; kind: 'request' | 'result'; name?: string }
  resultId?: string
}

function rolloutEvidence(record: RecordDetail): EvidenceRef {
  return { sourceId: record.sourceId, kind: 'jsonl', availability: 'present', location: `${record.path} · ${record.line}번째 줄` }
}

function outputPreviewText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = preview(value, 120)
    return text || undefined
  }
  const obj = fields(value)
  const candidate = string(obj.output) ?? string(obj.stdout) ?? string(obj.stderr) ?? string(obj.text)
  if (!candidate) return undefined
  const text = preview(candidate, 120)
  return text || undefined
}

function finishTurn(turn: Turn, details: Map<string, RecordDetail>) {
  turn.actions.sort(chronologically)
  const seen = new Set<string>()
  const requests = new Map<string, Action[]>()
  const results = new Map<string, Action[]>()
  for (const action of turn.actions) {
    const { fingerprint, tool } = details.get(action.id)!
    if (fingerprint) {
      if (seen.has(fingerprint)) action.reading = undefined
      seen.add(fingerprint)
    }
    if (tool) {
      const group = tool.kind === 'request' ? requests : results
      const matches = group.get(tool.id) ?? []
      matches.push(action)
      group.set(tool.id, matches)
    }
  }
  for (const [callId, calls] of requests) {
    const outputs = results.get(callId)
    if (calls.length !== 1 || outputs?.length !== 1) continue
    const [action] = calls
    const [output] = outputs
    if (!action.reading || (output.sequence ?? 0) <= (action.sequence ?? 0)) continue
    const detail = details.get(action.id)!
    detail.resultId = output.id
    const returned = fields(fields(JSON.parse(details.get(output.id)!.raw)).payload).output
    const result = ['exec_command', 'write_stdin'].includes(detail.tool?.name ?? '') ? structuredInput(returned) : undefined
    action.reading.outcome = toolOutcome(result, returned !== null && returned !== undefined)
    const snippet = outputPreviewText(result ?? returned)
    if (snippet) action.outputPreview = snippet
    if (output.time !== null) action.endTime = output.time
    output.reading = undefined
  }
  if (turn.status === '턴 종료 기록 있음' && turn.actions.some((action) => action.reading?.stage === 'answer')) {
    turn.status = '응답 확인됨'
  }
  let maxEnd: number | null = turn.time
  for (const action of turn.actions) {
    const candidate = action.endTime ?? action.time
    if (candidate !== null && (maxEnd === null || candidate > maxEnd)) maxEnd = candidate
  }
  if (maxEnd !== null) turn.endTime = maxEnd
  turn.title ||= '요청 제목 없음'
}

function toolInputPreview(input: unknown): string | undefined {
  const args = fields(input)
  const command = Array.isArray(args.command) && args.command.every((arg) => typeof arg === 'string')
    ? args.command.join(' ')
    : string(args.command)
  const patch = string(args.patch) ?? string(input)
  const patchLine = patch?.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/m)?.[0]
  return string(args.cmd) ?? command ?? string(args.file_path) ?? string(args.filePath) ?? string(args.path)
    ?? patchLine ?? string(input)
}

function describe(type: string, subtype: string, role: unknown, phase: unknown): [ActionKind, string] {
  if (type === 'response_item' && subtype === 'message') return messageLabel(role, phase)
  if (type === 'response_item' && ['function_call', 'custom_tool_call'].includes(subtype)) return ['tool', '도구 요청 기록']
  if (type === 'response_item' && ['function_call_output', 'custom_tool_call_output'].includes(subtype)) return ['tool', '도구 반환 기록']
  if (type === 'event_msg' && subtype === 'user_message') return ['message', '사용자 메시지 이벤트']
  if (type === 'event_msg' && subtype === 'agent_message') return ['message', '에이전트 메시지 이벤트']
  if (type === 'event_msg' && subtype === 'reasoning') return ['record', '추론 항목 기록']
  if (type === 'token_usage_record' || subtype === 'token_count') return ['record', '토큰 사용량']
  if (type === 'turn_context' || subtype === 'thread_settings_applied') return ['instruction', '설정 기록']
  if (type === 'session_meta') return ['record', '세션 정보']
  if (subtype === 'task_started') return ['record', '턴 시작']
  if (subtype === 'task_complete') return ['record', '턴 완료']
  if (subtype === 'turn_aborted') return ['record', '턴 중단']
  return ['record', '세션 이벤트']
}

export function parseSession(path: string, text: string): SessionRecord {
  return assembleSession([parseRollout(path, text)])
}

function recordedTurn(value: Fields, threadId: string) {
  const item = fields(value.payload)
  const owner = string(item.thread_id)
  return owner && owner !== threadId ? undefined : string(item.turn_id)
}

export function rolloutTurnIds(part: RolloutPart): string[] {
  return [...new Set(part.lines.flatMap(({ value }) => recordedTurn(value, part.info.threadId) ?? []))]
}

export function assembleSession(parts: RolloutPart[], historyNote?: string): SessionRecord {
  const head = parts.at(-1)!
  const { path, id: rolloutId, threadId: id } = head.info
  const details = new Map<string, RecordDetail>()
  const turns = new Map<string, Turn>()
  let lastAt: number | null = null
  let sequence = 0
  for (const part of parts) {
    let active: string | undefined
    for (const { value, raw, line } of part.lines) {
      const item = fields(value.payload)
      const type = string(value.type) ?? ''
      const subtype = string(item.type) ?? ''
      const parsedTime = Date.parse(string(value.timestamp) ?? '')
      const time = Number.isFinite(parsedTime) ? parsedTime : null
      if (time !== null) lastAt = time
      sequence += 1
      const explicit = recordedTurn(value, part.info.threadId)
      if (type === 'event_msg' && subtype === 'task_started') active = explicit
      if (type === 'session_meta') active = undefined
      const turnId = explicit ?? active
      const group = turnId ? `turn:${turnId}` : `session:unlinked:${part.info.id}`
      const turn: Turn = turns.get(group) ?? {
        id: group, title: turnId ? '' : '턴 연결이 없는 기록', actor: '채팅',
        time, sequence, actions: [],
      }
      if (explicit) turn.threadTurnId = explicit
      turns.set(group, turn)
      const [baseKind, baseLabel] = describe(type, subtype, item.role, item.phase)
      const body = messageText(item.content) || string(item.message) || string(item.last_agent_message)
      const isInstruction = baseKind === 'instruction' && (item.role === 'developer' || item.role === 'system')
      const instructionInfo = isInstruction ? describeInstructionMessage(item.role, body ?? '') : undefined
      const kind = baseKind
      const label = instructionInfo?.label ?? baseLabel
      const isUser = (type === 'response_item' && item.role === 'user') || (type === 'event_msg' && subtype === 'user_message')
      const response = type === 'response_item' && subtype === 'message' && item.role === 'assistant'
      const channel = response ? item.phase ?? 'commentary' : subtype === 'task_complete' ? 'final' : item.phase ?? 'commentary'
      const message = isUser ? readableMessage('user', undefined, body ?? '')
        : response || (type === 'event_msg' && (subtype === 'agent_message' || subtype === 'task_complete'))
          ? readableMessage('assistant', channel, body ?? '') : undefined
      const toolRequest = label === '도구 요청 기록'
      const toolResult = label === '도구 반환 기록'
      const toolInput = toolRequest ? structuredInput(item.arguments ?? item.input) : undefined
      const settingsSummary = label === '설정 기록' ? describeSettingsRecord(item) : undefined
      const summary = toolRequest
        ? preview([string(item.name), toolInputPreview(toolInput)].filter(Boolean).join(' · '))
        : instructionInfo
          ? instructionInfo.summary
          : settingsSummary !== undefined
            ? settingsSummary
            : preview(body || string(item.name) || (label === '세션 이벤트' ? subtype || type : ''))
      const callId = string(item.call_id)
      const action: Action = {
        id: `line:${part.info.id}:${line}:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`,
        kind, label, summary, actor: isUser ? '사용자' : '채팅',
        reading: toolRequest ? readableTool(item.name, toolInput)
          : toolResult ? { stage: 'progress', title: '실행 결과 보기', outcome: toolOutcome(undefined, item.output != null) } : message,
        time, sequence,
      }
      turn.actions.push(action)
      if (!turn.title && message?.stage === 'request') turn.title = plainPreview(message.text ?? '', 180)
      if (type === 'event_msg' && ['task_complete', 'turn_aborted'].includes(subtype)) {
        turn.status = subtype === 'task_complete' ? '턴 종료 기록 있음' : '턴 중단 기록'
        if (!explicit || explicit === active) active = undefined
      }
      details.set(action.id, {
        sourceId: part.info.id, path: part.info.path, raw, line,
        rule: explicit ? '레코드의 payload.turn_id로 묶었습니다.'
          : turnId ? '턴 시작과 종료 사이의 파일 위치로 묶었습니다.'
            : '레코드에서 연결된 턴을 확인할 수 없습니다.',
        turnProvenance: explicit ? { level: 'id-confirmed', rule: 'payload.turn_id' }
          : turnId ? { level: 'rule-derived', rule: '턴 시작과 종료 사이의 JSONL 위치' }
            : { level: 'unavailable', rule: '턴 ID 미확인' },
        actor: isUser ? { id: `agent:${id}:user`, label: '사용자', role: 'user', provenance: { level: 'recorded' } }
          : response || (type === 'event_msg' && subtype === 'agent_message')
            ? { id: `agent:${id}:assistant`, label: '어시스턴트', role: 'agent', provenance: { level: 'rule-derived', rule: '채팅의 어시스턴트 역할' } }
            : undefined,
        information: toolRequest ? 'call' : toolResult ? 'result'
          : kind === 'instruction' ? 'instruction' : kind === 'message' ? 'message' : undefined,
        fingerprint: message && createHash('sha256').update(`${message.stage}:${isUser ? userRequest(body ?? '') : body}`).digest('hex'),
        tool: callId && (toolRequest || toolResult)
          ? { id: callId, kind: toolRequest ? 'request' : 'result', name: toolRequest ? toolName(item.name) : undefined }
          : undefined,
      })
    }
  }
  const ordered = [...turns.values()].sort(chronologically)
  for (const turn of ordered) finishTurn(turn, details)
  const unlinkedInstructions = ordered
    .filter((turn) => turn.id.startsWith('session:unlinked:'))
    .flatMap((turn) => turn.actions.filter((action) => action.kind === 'instruction'))
  for (const turn of ordered) {
    if (turn.id.startsWith('session:unlinked:')) continue
    const ids = selectInstructionIds([
      ...unlinkedInstructions,
      ...turn.actions.filter((action) => action.kind === 'instruction'),
    ])
    if (ids.length > 0) turn.instructionIds = ids
  }
  const opening = ordered.flatMap((turn) => turn.actions).find((action) => action.reading?.stage === 'request')
  const buildGraph = () => {
    const sources = parts.map((part, index): SourceCoverage => ({
      id: part.info.id, path: part.info.path, boundary: part.info.base,
      limitations: [
        ...(part.invalidBase || (part.info.base && part.info.base.id !== parts[index - 1]?.info.id) || (index === 0 && historyNote)
          ? ['history-base-unavailable' as const] : []),
        ...(part.partial ? ['partial-jsonl' as const] : []),
      ],
    }))
    const edges = [...details.entries()].flatMap(([from, detail]): ExecutionEdge[] => detail.resultId ? [{
      kind: 'tool-result', from, to: detail.resultId, provenance: { level: 'id-confirmed', rule: 'payload.call_id' },
    }] : [])
    return buildExecutionGraph(ordered, { kind: 'rollout', sources }, (actionId) => {
      const record = details.get(actionId)!
      const output = record.resultId ? details.get(record.resultId) : undefined
      return {
        sourceId: record.sourceId, turnProvenance: record.turnProvenance, actor: record.actor, information: record.information,
        evidence: output ? [rolloutEvidence(record), rolloutEvidence(output)] : [rolloutEvidence(record)],
      }
    }, edges)
  }
  return {
    id, path, rolloutId, sourceIds: parts.map((part) => part.info.id),
    title: head.title || plainPreview(opening?.reading?.text ?? '', 82) || '제목 없는 채팅',
    snapshot: snapshot({
      lastAt, status: historyNote ? '이전 기록 일부 미확인' : '세션 파일',
      note: [
        historyNote,
        head.partial && '마지막 JSONL 줄의 기록이 끝나지 않아 앞부분까지 읽었습니다.',
      ].filter(Boolean).join(' ') || undefined,
    }, ordered, (actionId): ActionDetail | null => {
      const detail = details.get(actionId)
      if (!detail) return null
      const payload = fields(fields(JSON.parse(detail.raw)).payload)
      const output = detail.resultId ? details.get(detail.resultId) : undefined
      const returned = output ? fields(fields(JSON.parse(output.raw)).payload).output : undefined
      return {
        sections: [
          ...section('기록된 본문', messageText(payload.content) || payload.message || payload.last_agent_message, 'message'),
          ...section('도구 입력', structuredInput(payload.arguments ?? payload.input), 'input'),
          ...section('도구 반환', payload.output ?? returned, 'result'),
          ...section('토큰 사용량', payload.usage ?? payload.info),
          ...section('묶음 규칙', detail.rule),
        ],
        relations: detail.resultId ? [{ target: detail.resultId, label: '도구 반환 기록', rule: 'payload.call_id' }] : [],
        evidence: [detail, ...(output ? [output] : [])].map((record) => ({
          type: 'raw', location: rolloutEvidence(record).location, text: record.raw,
        })),
      }
    }, buildGraph),
  }
}
