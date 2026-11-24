import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Action, ActionDetail, ActionKind, ModelInputItem, ModelRequestDetail, Relation, Turn } from '../../../shared/reader'
import type { EvidenceRef, ExecutionEdge, SourceCoverage } from '../../../shared/execution-graph'
import { buildExecutionGraph, type EventRecord } from '../core/execution-graph'
import { describeInstructionMessage, plainPreview, readableMessage, selectInstructionIds, userRequest } from '../reading/reading'
import { describeCodeExecution, readableTool, structuredInput, toolOutcome } from '../reading/tool-reading'
import { entries, fields, isFields, messageText, number, pointer, preview, string, strings, type Fields } from '../core/json'
import {
  anchorId, directPayloadValues, payloadEvidence, payloadReferences, rawIndex, rawReferenceLabel,
  rawSequence, sequences, stateEvidence,
} from './trace-evidence'
import { chronologically, executionStatus, messageLabel, position, section, snapshot } from '../core/timeline'

const collections = {
  threads: '에이전트 스레드',
  conversation_items: '대화 항목',
  inference_calls: '모델 요청',
  tool_calls: '도구 호출',
  code_cells: '코드 실행',
  terminal_operations: '터미널 작업',
  terminal_sessions: '터미널 세션',
  compaction_requests: '문맥 압축 요청',
  compactions: '문맥 압축',
  interaction_edges: '에이전트 전달',
}

const toolNames: Record<string, string> = {
  exec_command: '명령 실행', write_stdin: '터미널 입력·조회', apply_patch: '파일 패치',
  spawn_agent: '하위 에이전트 생성', assign_agent_task: '작업 전달', send_message: '메시지 전달',
  wait_agent: '에이전트 대기', close_agent: '에이전트 닫기', web: '웹 도구', image_generation: '이미지 생성',
}

const edgeNames: Record<string, string> = {
  spawn_agent: '하위 에이전트 생성', assign_agent_task: '작업 전달', send_message: '메시지 전달',
  agent_result: '하위 에이전트 결과 반환', close_agent: '에이전트 닫기',
}

type Collection = keyof typeof collections
interface Node {
  collection: Collection
  key: string
  value: Fields
  action: Action
  turnId?: string
  threadId?: string
}

interface TraceRelation extends Relation {
  kind: ExecutionEdge['kind']
  itemIds?: string[]
}

function stableId(collection: Collection, key: string, value: Fields): string {
  if (collection !== 'conversation_items') return `${collection}:${key}`
  // Reduced conversation ordinals can be reassigned if an observation is reconciled.
  const identity = [
    value.responses_item_id, value.thread_id, value.role, value.kind,
    value.first_seen_at_unix_ms, value.body,
  ]
  const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24)
  return `${collection}:${key}:${digest}`
}

function conversationLabel(value: Fields): [ActionKind, string] {
  switch (value.kind) {
    case 'function_call':
    case 'custom_tool_call': return ['tool', '모델의 도구 요청']
    case 'function_call_output':
    case 'custom_tool_call_output': return ['tool', '모델에 표시 가능한 도구 반환']
    case 'reasoning': return ['record', '기록된 추론 항목']
    case 'compaction_marker': return ['runtime', '문맥 교체 지점']
    default: return messageLabel(value.role, value.channel)
  }
}

function toolLabel(kind: Fields): string | undefined {
  const type = string(kind.type) ?? ''
  if (Object.hasOwn(toolNames, type)) return toolNames[type]
  if (type === 'mcp') return 'MCP 도구 호출'
}

function traceStatus(state: Fields): string {
  switch (state.recording_status) {
    case 'unclosed': return '여기까지 기록됨'
    case 'closed_with_partial_payloads': return '기록 닫힘 · 일부 본문 누락 또는 잘림'
    case 'complete': {
      const status = executionStatus(state.status)
      return status && state.status !== 'running' ? `기록 닫힘 · ${status}` : '기록 닫힘'
    }
    default: throw new Error('state.json에서 기록 상태를 확인할 수 없습니다.')
  }
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

export function parseTrace(bundle: string, state: Fields, events: ReturnType<typeof rawIndex>, shards: Set<number>) {
  for (const collection of ['codex_turns', 'raw_payloads', ...Object.keys(collections)]) {
    if (!isFields(state[collection])) throw new Error(`state.json의 ${collection} 객체를 확인할 수 없습니다.`)
  }
  const { raw, lastAt, partial } = events
  const references = fields(state.raw_payloads)
  const turns = new Map<string, Turn>()
  const nodes = new Map<string, Node>()
  const byKey = new Map<string, Node>()
  const links = new Map<string, TraceRelation[]>()
  const threadMap = new Map(entries(state.threads))
  const turnMap = new Map(entries(state.codex_turns))
  const tools = new Map(entries(state.tool_calls))
  const operations = new Map(entries(state.terminal_operations))
  const conversation = new Map(entries(state.conversation_items))
  const codeCells = new Map(entries(state.code_cells))
  const actor = (id?: string) => {
    if (!id) return '주체 미확인'
    const thread = threadMap.get(id)
    const path = string(thread?.agent_path)
    const nickname = string(thread?.nickname)
    if (id === state.root_thread_id) return '루트 에이전트'
    return path ? (nickname ? `${nickname} · ${path}` : path) : id
  }

  for (const [key, value] of turnMap) {
    const input = strings(value.input_item_ids)
      .map((id) => conversation.get(id))
      .find((item) => item?.role === 'user')
    const execution = fields(value.execution)
    const ended = number(execution.ended_at_unix_ms)
    turns.set(key, {
      id: `turn:${key}`, title: plainPreview(userRequest(messageText(fields(input?.body).parts)), 180),
      actor: actor(string(value.thread_id)), ...position(execution),
      ...(ended !== null ? { endTime: ended } : {}),
      threadTurnId: value.thread_id === state.root_thread_id ? key : undefined,
      status: executionStatus(execution.status, '턴 종료 기록 있음'), actions: [],
    })
  }

  for (const collection of Object.keys(collections) as Collection[]) {
    for (const [key, value] of entries(state[collection])) {
      const execution = fields(value.execution)
      const operationTool = tools.get(string(value.tool_call_id) ?? '')
      const threadId = string(value.thread_id ?? operationTool?.thread_id)
      const turnId = string(value.codex_turn_id ?? value.started_by_codex_turn_id ?? operationTool?.started_by_codex_turn_id)
      let label: string = collections[collection]
      let kind: ActionKind = 'runtime'
      let status = executionStatus(execution.status)
      let summary: unknown
      let reading: Action['reading']
      let outputPreview: string | undefined
      let time = position(execution)
      let endTime = number(execution.ended_at_unix_ms)
      if (collection === 'conversation_items') {
        const [messageKind, messageName] = conversationLabel(value)
        kind = messageKind
        const bodyText = messageText(fields(value.body).parts)
        const instructionInfo = kind === 'instruction' && (value.role === 'developer' || value.role === 'system')
          ? describeInstructionMessage(value.role, bodyText)
          : undefined
        label = instructionInfo?.label ?? messageName
        summary = instructionInfo?.summary ?? bodyText
        if (value.kind === 'message') reading = readableMessage(value.role, value.channel ?? 'commentary', bodyText)
        time = {
          time: number(value.accepted_at_unix_ms) ?? number(value.first_seen_at_unix_ms),
          sequence: number(value.accepted_seq),
        }
      } else if (collection === 'tool_calls') {
        const toolKind = fields(value.kind)
        const toolSummary = fields(value.summary)
        const operation = operations.get(string(value.terminal_operation_id) ?? '')
        const codeCell = codeCells.get(string(value.started_code_cell_id) ?? '')
        const exit = number(fields(operation?.result).exit_code)
        kind = 'tool'
        label = toolLabel(toolKind) ?? label
        summary = fields(operation?.request).display_command ?? toolSummary.message_preview
          ?? toolSummary.input_preview ?? toolKind.tool ?? toolKind.name ?? toolSummary.label ?? codeCell?.source_js
        status = [executionStatus(execution.status, '호출 종료'), exit === null ? undefined : `종료 코드 ${exit}`]
          .filter(Boolean).join(' · ') || undefined
        const type = toolKind.type === 'other' ? toolKind.name : toolKind.type
        reading = readableTool(
          type,
          operation?.request ?? structuredInput(toolSummary.input_preview) ?? codeCell?.source_js,
          toolKind.tool,
        )
        const hasResult = operation?.result != null || string(toolSummary.output_preview) !== undefined
          || strings(value.model_visible_output_item_ids).some((id) => conversation.has(id))
        reading.outcome = toolOutcome(operation?.result, hasResult, execution.status)
        const firstOutputText = strings(value.model_visible_output_item_ids)
          .map((id) => messageText(fields(conversation.get(id)?.body).parts))
          .find(Boolean)
        outputPreview = outputPreviewText(operation?.result)
          ?? outputPreviewText(toolSummary.output_preview)
          ?? outputPreviewText(firstOutputText)
        endTime ??= number(fields(operation?.execution).ended_at_unix_ms)
      } else if (collection === 'inference_calls') {
        kind = 'model'
        summary = value.model
      } else if (collection === 'interaction_edges') {
        kind = 'agent'
        const edge = string(value.kind) ?? ''
        if (Object.hasOwn(edgeNames, edge)) label = edgeNames[edge]
        time = { time: number(value.started_at_unix_ms), sequence: null }
      } else if (collection === 'code_cells') {
        summary = value.source_js
        status = executionStatus(value.runtime_status)
      } else if (collection === 'terminal_operations') {
        summary = fields(value.request).display_command ?? fields(value.request).stdin
      } else if (collection === 'compactions') {
        time = { time: number(value.installed_at_unix_ms), sequence: null }
      } else if (collection === 'threads') {
        kind = 'agent'
        summary = value.agent_path
      }
      const id = stableId(collection, key, value)
      const action: Action = {
        id, label, kind, status, reading, summary: preview(summary),
        actor: value.role === 'user' ? '사용자' : actor(threadId ?? string(turnMap.get(turnId ?? '')?.thread_id)), ...time,
        ...(endTime !== null ? { endTime } : {}),
        ...(outputPreview ? { outputPreview } : {}),
      }
      const node = { collection, key, value, action, turnId, threadId }
      nodes.set(id, node)
      byKey.set(`${collection}:${key}`, node)
    }
  }

  function lookup(collection: string, key: unknown) {
    return typeof key === 'string' ? byKey.get(`${collection}:${key}`) : undefined
  }

  function link(
    from: Node, to: Node | undefined, label: string, rule: string,
    kind: ExecutionEdge['kind'] = 'reference', itemIds?: string[],
  ) {
    if (!to || to === from) return
    const relations = links.get(from.action.id) ?? []
    relations.push({ target: to.action.id, label, rule, kind, itemIds })
    links.set(from.action.id, relations)
  }

  const requestsByItem = new Map<string, Node[]>()
  for (const node of nodes.values()) {
    if (node.collection !== 'inference_calls') continue
    for (const item of new Set(strings(node.value.request_item_ids))) {
      const requests = requestsByItem.get(item) ?? []
      requests.push(node)
      requestsByItem.set(item, requests)
    }
  }

  const turnGroupOf = new Map<string, string>()
  const cellStarters = new Map<string, Node[]>()
  const childLinks = new Map<string, Map<string, Set<string>>>()
  const startedByInference = new Map<string, Node[]>()
  const addChildLink = (childActionId: string, cellKey: string, via: string) => {
    let cells = childLinks.get(childActionId)
    if (!cells) {
      cells = new Map()
      childLinks.set(childActionId, cells)
    }
    let viaFields = cells.get(cellKey)
    if (!viaFields) {
      viaFields = new Set()
      cells.set(cellKey, viaFields)
    }
    viaFields.add(via)
  }

  for (const node of nodes.values()) {
    const { collection, value, threadId, action } = node
    const target = (collection: string, key: unknown, label: string, rule: string, kind?: ExecutionEdge['kind']) =>
      link(node, lookup(collection, key), label, rule, kind)

    if (collection === 'inference_calls') {
      for (const id of strings(value.request_item_ids)) {
        const item = lookup('conversation_items', id)
        const label = item?.turnId && item.turnId === node.turnId ? '요청에 포함된 항목'
          : item?.turnId && turns.has(item.turnId) && chronologically(turns.get(item.turnId)!, node.action) < 0
            ? '요청에 포함된 이전 턴 문맥' : '요청에 포함된 항목 · 턴 관계 미확인'
        link(node, item, label, 'request_item_ids', 'model-input')
      }
      for (const id of strings(value.response_item_ids)) target('conversation_items', id, '모델 응답 항목', 'response_item_ids', 'model-output')
      for (const id of strings(value.tool_call_ids_started_by_response)) {
        target('tool_calls', id, '응답에서 요청한 도구', 'tool_call_ids_started_by_response', 'model-call')
        const tool = lookup('tool_calls', id)
        if (tool) {
          const list = startedByInference.get(tool.action.id) ?? []
          list.push(node)
          startedByInference.set(tool.action.id, list)
        }
      }
    }
    if (collection === 'tool_calls' || collection === 'code_cells') {
      const isTool = collection === 'tool_calls'
      const inputField = isTool ? 'model_visible_call_item_ids' : 'source_item_id'
      const outputField = isTool ? 'model_visible_output_item_ids' : 'output_item_ids'
      const inputs = isTool ? strings(value[inputField]) : strings([value[inputField]])
      const outputs = strings(value[outputField])
      for (const id of inputs) target('conversation_items', id, '호출 요청 항목', inputField, 'tool-input')
      const included = new Map<Node, string[]>()
      for (const id of new Set(outputs)) {
        target('conversation_items', id, '반환 항목', outputField, 'tool-result')
        for (const request of requestsByItem.get(id) ?? []) {
          const ids = included.get(request) ?? []
          ids.push(id)
          included.set(request, ids)
        }
      }
      const deliveries: NonNullable<Action['deliveries']> = []
      for (const [request, ids] of included) {
        const itemIds = ids.flatMap((id) => lookup('conversation_items', id)?.action.id ?? [])
        link(node, request, '반환 항목이 포함된 모델 요청', `${outputField} ∩ request_item_ids · ${ids.join(', ')}`, 'delivery', itemIds)
        deliveries.push({ targetId: request.action.id, targetLabel: request.action.label, targetTime: request.action.time, itemIds })
      }
      if (deliveries.length > 0) action.deliveries = deliveries.sort((a, b) =>
        chronologically(nodes.get(a.targetId)!.action, nodes.get(b.targetId)!.action))
    }
    if (collection === 'tool_calls') {
      target('terminal_operations', value.terminal_operation_id, '터미널 작업', 'terminal_operation_id')
      target('code_cells', value.started_code_cell_id, '호출이 시작한 코드 실행', 'started_code_cell_id', 'containment')
      target('code_cells', fields(value.requester).code_cell_id, '요청한 코드 실행', 'requester.code_cell_id')
      const startedCell = string(value.started_code_cell_id)
      if (startedCell) {
        const list = cellStarters.get(startedCell) ?? []
        list.push(node)
        cellStarters.set(startedCell, list)
      }
      const requesterCell = string(fields(value.requester).code_cell_id)
      if (requesterCell) addChildLink(action.id, requesterCell, 'requester.code_cell_id')
    }
    if (collection === 'conversation_items' && Array.isArray(value.produced_by)) {
      for (const producer of value.produced_by.map(fields)) {
        target('inference_calls', producer.inference_call_id, '항목을 반환한 모델 요청', 'produced_by.inference_call_id')
        target('tool_calls', producer.tool_call_id, '항목과 연결된 도구 호출', 'produced_by.tool_call_id')
        target('code_cells', producer.code_cell_id, '항목과 연결된 코드 실행', 'produced_by.code_cell_id')
        target('interaction_edges', producer.edge_id, '항목과 연결된 에이전트 전달', 'produced_by.edge_id')
      }
    }
    if (collection === 'code_cells') {
      for (const id of strings(value.nested_tool_call_ids)) {
        target('tool_calls', id, '코드에서 요청한 도구', 'nested_tool_call_ids', 'containment')
        const child = lookup('tool_calls', id)
        if (child) addChildLink(child.action.id, node.key, 'nested_tool_call_ids')
      }
      for (const id of strings(value.wait_tool_call_ids)) target('tool_calls', id, '코드 실행을 기다린 도구', 'wait_tool_call_ids')
    }
    if (collection === 'terminal_operations') {
      target('tool_calls', value.tool_call_id, '작업을 요청한 도구', 'tool_call_id')
      target('terminal_sessions', value.terminal_id, '연결된 터미널 세션', 'terminal_id')
      for (const observation of Array.isArray(value.model_observations) ? value.model_observations.map(fields) : []) {
        for (const id of strings(observation.output_item_ids)) {
          target('conversation_items', id, '연결된 모델 반환 항목', 'model_observations.output_item_ids')
        }
      }
    }
    if (collection === 'terminal_sessions') {
      for (const id of strings(value.operation_ids)) target('terminal_operations', id, '세션에서 기록한 작업', 'operation_ids')
    }
    let turnId = node.turnId
    if (collection === 'interaction_edges') {
      for (const [field, label] of [['source', '발신'], ['target', '수신']]) {
        const anchor = anchorId(fields(value[field]))
        const endpoint = anchor && lookup(...anchor)
        if (!endpoint) continue
        link(node, endpoint, label, field, 'delegation')
        link(endpoint, node, '연결된 에이전트 전달', field)
        if (field === 'source') {
          turnId = endpoint.turnId
          action.actor = endpoint.action.actor
        }
      }
      for (const id of strings(value.carried_item_ids)) target('conversation_items', id, '전달된 항목', 'carried_item_ids')
    }
    if (collection === 'threads') {
      const origin = fields(value.origin)
      target('threads', origin.parent_thread_id, '상위 에이전트', 'origin.parent_thread_id', 'delegation')
      target('interaction_edges', origin.spawn_edge_id, '에이전트 생성 기록', 'origin.spawn_edge_id', 'delegation')
    }
    const linked = turnId && turns.get(turnId)
    if (linked) {
      linked.actions.push(action)
      if (!linked.title && action.reading?.stage === 'request') linked.title = plainPreview(action.reading.text ?? '', 180)
      turnGroupOf.set(action.id, turnId!)
    } else {
      const key = `unlinked:${threadId ?? ''}`
      const group = turns.get(key) ?? {
        id: key, title: '턴 연결이 없는 기록', actor: action.actor, time: action.time, sequence: action.sequence, actions: [],
      }
      if (chronologically(action, group) < 0) {
        group.time = action.time
        group.sequence = action.sequence
      }
      group.actions.push(action)
      turns.set(key, group)
      turnGroupOf.set(action.id, key)
    }
  }

  const resolvedParents = new Map<string, { parent: Node; rules: string[] }>()
  for (const [childActionId, cellMap] of childLinks) {
    const childNode = nodes.get(childActionId)
    if (!childNode || childNode.action.reading?.stage !== 'progress') continue
    if (cellMap.size !== 1) continue
    const [[cellKey, viaFields]] = cellMap.entries()
    const childTurnGroup = turnGroupOf.get(childActionId)
    const starters = (cellStarters.get(cellKey) ?? []).filter(
      (starter) => starter.action.reading?.stage === 'progress' && turnGroupOf.get(starter.action.id) === childTurnGroup,
    )
    const cellNode = lookup('code_cells', cellKey)
    let parentNode: Node | undefined
    let rules: string[] = []
    if (starters.length === 1) {
      parentNode = starters[0]
      rules = ['started_code_cell_id', ...[...viaFields].sort()]
    } else if (starters.length === 0 && cellNode && turnGroupOf.get(cellNode.action.id) === childTurnGroup) {
      parentNode = cellNode
      rules = [...viaFields].sort()
    }
    if (!parentNode || parentNode === childNode) continue
    resolvedParents.set(childActionId, { parent: parentNode, rules })
  }
  for (const [childActionId, { parent, rules }] of resolvedParents) {
    const childNode = nodes.get(childActionId)!
    let cyclic = false
    let cursor: Node | undefined = parent
    const seen = new Set<string>([childActionId])
    while (cursor) {
      if (seen.has(cursor.action.id)) {
        cyclic = true
        break
      }
      seen.add(cursor.action.id)
      cursor = resolvedParents.get(cursor.action.id)?.parent
    }
    if (cyclic) continue
    if (parent.collection === 'code_cells' && !parent.action.reading) {
      const described = describeCodeExecution(parent.value.source_js)
      parent.action.reading = {
        stage: 'progress',
        title: described?.title ?? '코드 실행',
        ...(described?.target ? { target: described.target } : {}),
        outcome: executionStatus(parent.value.runtime_status),
      }
    }
    childNode.action.parent = { id: parent.action.id, rule: rules.join(' · ') }
  }

  for (const [toolActionId, starters] of startedByInference) {
    const toolTurnGroup = turnGroupOf.get(toolActionId)
    const sameTurnStarters = starters.filter((starter) => turnGroupOf.get(starter.action.id) === toolTurnGroup)
    if (sameTurnStarters.length === 1) {
      nodes.get(toolActionId)!.action.startedById = sameTurnStarters[0].action.id
    }
  }

  const inferenceByThread = new Map<string, Node[]>()
  for (const node of nodes.values()) {
    if (node.collection !== 'inference_calls') continue
    const owner = node.threadId ?? string(turnMap.get(node.turnId ?? '')?.thread_id) ?? ''
    const list = inferenceByThread.get(owner) ?? []
    list.push(node)
    inferenceByThread.set(owner, list)
  }
  const previousRequestItems = new Map<string, Set<string>>()
  for (const calls of inferenceByThread.values()) {
    calls.sort((a, b) => chronologically(a.action, b.action))
    for (let i = 1; i < calls.length; i += 1) {
      previousRequestItems.set(calls[i].action.id, new Set(strings(calls[i - 1].value.request_item_ids)))
    }
  }

  const ordered = [...turns.values()].sort(chronologically)
  for (const turn of ordered) {
    turn.title ||= '요청 제목 없음'
    turn.actions.sort(chronologically)
    if (turn.status === '턴 종료 기록 있음' && turn.actions.some((action) => action.reading?.stage === 'answer')) {
      turn.status = '응답 확인됨'
    }
    if (turn.endTime === undefined || turn.endTime === null) {
      let maxEnd: number | null = turn.time
      for (const action of turn.actions) {
        const candidate = action.endTime ?? action.time
        if (candidate !== null && (maxEnd === null || candidate > maxEnd)) maxEnd = candidate
      }
      if (maxEnd !== null) turn.endTime = maxEnd
    }
    const instructionActions: Action[] = []
    const seenInst = new Set<string>()
    for (const action of turn.actions) {
      const node = nodes.get(action.id)
      if (node?.collection === 'inference_calls') {
        for (const rawId of strings(node.value.request_item_ids)) {
          const item = lookup('conversation_items', rawId)
          if (item?.action.kind === 'instruction' && !seenInst.has(item.action.id)) {
            seenInst.add(item.action.id)
            instructionActions.push(item.action)
          }
        }
      }
      if (action.kind === 'instruction' && !seenInst.has(action.id)) {
        seenInst.add(action.id)
        instructionActions.push(action)
      }
    }
    const ids = selectInstructionIds(instructionActions)
    if (ids.length > 0) turn.instructionIds = ids
  }

  function returnedItems(value: Fields) {
    return strings(value.model_visible_output_item_ids).flatMap((id) => {
      const item = conversation.get(id)
      return item ? [{ id, item }] : []
    })
  }

  function evidenceFor(node: Node) {
    const { collection, key, value } = node
    const operationId = string(value.terminal_operation_id)
    const operation = operationId ? operations.get(operationId) : undefined
    const returned = returnedItems(value)
    const stateRecords: { collection: string; key: string; value: Fields }[] = [{ collection, key, value }]
    if (operation && operationId) stateRecords.push({ collection: 'terminal_operations', key: operationId, value: operation })
    for (const { id, item } of returned) stateRecords.push({ collection: 'conversation_items', key: id, value: item })

    const rawSeq = new Set([
      ...sequences(fields(value.execution)), ...sequences(fields(operation?.execution)),
      ...rawSequence(value, 'accepted_seq'), ...rawSequence(value, 'initial_response_seq'), ...rawSequence(value, 'yielded_seq'),
    ])
    const rawRecords = [...rawSeq].sort((a, b) => a - b).map((seq) => {
      const record = raw.get(seq)
      const ref: EvidenceRef = {
        sourceId: bundle, kind: 'jsonl', availability: record ? 'present' : 'missing',
        location: `${join(bundle, 'trace.jsonl')} · ${rawReferenceLabel(seq, record?.line)}`,
      }
      return { record, ref }
    })
    const recordedBody = fields(value.body).parts
    const payloads = payloadReferences(bundle, references, [
      ...directPayloadValues(value), ...directPayloadValues(operation ?? {}),
      ...(Array.isArray(recordedBody) ? recordedBody.flatMap((part) => directPayloadValues(fields(part))) : []),
      value.carried_raw_payload_ids,
    ], shards)
    return { operation, returned, stateRecords, rawRecords, payloads }
  }

  const buildGraph = () => {
    const limitations: SourceCoverage['limitations'] = []
    if (partial) limitations.push('partial-jsonl')
    if (state.recording_status === 'unclosed') limitations.push('recording-open')
    if (state.recording_status === 'closed_with_partial_payloads') limitations.push('partial-payloads')
    const edges: ExecutionEdge[] = []
    for (const { action } of nodes.values()) {
      for (const { target, kind, rule, itemIds } of links.get(action.id) ?? []) {
        edges.push({
          kind: kind === 'containment' && turnGroupOf.get(action.id) !== turnGroupOf.get(target) ? 'reference' : kind,
          from: action.id, to: target, itemIds, provenance: { level: 'id-confirmed', rule },
        })
      }
      if (action.parent) edges.push({
        kind: 'containment', from: action.parent.id, to: action.id,
        provenance: { level: 'rule-derived', rule: action.parent.rule },
      })
    }
    return buildExecutionGraph(ordered, { kind: 'trace', sources: [{ id: bundle, path: bundle, limitations }] }, (id): EventRecord => {
      const node = nodes.get(id)!
      const { value, collection, action } = node
      const turn = turnGroupOf.get(id)
      const recordedTurn = string(value.codex_turn_id) ? 'codex_turn_id' : string(value.started_by_codex_turn_id) ? 'started_by_codex_turn_id' : undefined
      const turnProvenance: EventRecord['turnProvenance'] = turn && turnMap.has(turn)
        ? { level: 'id-confirmed', rule: collection === 'interaction_edges' ? 'source의 기록된 연결 ID' : recordedTurn ?? 'tool_call_id → 도구의 턴 ID' }
        : { level: 'unavailable', rule: '턴 ID 미확인' }
      const threadId = collection === 'threads' ? node.key : node.threadId ?? string(turnMap.get(turn ?? '')?.thread_id)
      const { stateRecords, rawRecords, payloads } = evidenceFor(node)
      const information = collection !== 'conversation_items' ? undefined
        : action.kind === 'instruction' ? 'instruction' : action.kind === 'message' ? 'message'
          : value.kind === 'function_call' || value.kind === 'custom_tool_call' ? 'call'
            : value.kind === 'function_call_output' || value.kind === 'custom_tool_call_output' ? 'result' : 'other'
      return {
        sourceId: bundle, turnProvenance, information,
        actor: value.role === 'user' ? { id: 'agent:user', label: '사용자', role: 'user', provenance: { level: 'recorded' } }
          : threadId ? { id: `agent:thread:${threadId}`, label: actor(threadId), role: 'agent', provenance: { level: 'id-confirmed', rule: '기록된 스레드 ID' } }
            : undefined,
        evidence: [
          ...stateRecords.map(({ collection, key }): EvidenceRef => ({
            sourceId: bundle, kind: 'reduced-state', location: `state.json ${pointer(collection, key)}`, availability: 'present',
          })),
          ...rawRecords.map(({ ref }) => ref),
          ...payloads.map(({ ref }) => ref),
        ],
      }
    }, edges)
  }

  return snapshot({
    lastAt, status: traceStatus(state),
    note: [
      partial && '마지막 JSONL 줄의 기록이 끝나지 않아 앞부분까지 읽었습니다.',
      '같은 시각에 순번이 없으면 ID 순으로 표시합니다. 순번이 없는 항목의 실제 순서는 확인하기 어렵습니다.',
    ].filter(Boolean).join(' '),
  }, ordered, (id): ActionDetail | null => {
    const node = nodes.get(id)
    if (!node) return null
    const { value, collection, key } = node
    const { operation, returned, stateRecords, rawRecords, payloads } = evidenceFor(node)
    const operationResult = fields(operation?.result)
    const summary = fields(value.summary)
    const recordedBody = fields(value.body).parts
    const detailSections = [
      ...section('기록된 본문', messageText(recordedBody), 'message'),
      ...section('호출 요청 주체', value.requester),
      ...section('입력', operation?.request ?? value.request ?? value.source_js, 'input'),
      ...section('기록된 입력 미리보기', summary.input_preview ?? summary.message_preview, 'input'),
      ...section('실행 결과', operation?.result ?? value.result, 'result'),
      ...section('기록된 결과 미리보기', summary.output_preview, 'result'),
      ...section('모델에 표시 가능한 반환 기록', returned.map(({ item }) => messageText(fields(item.body).parts)).filter(Boolean).join('\n\n'), 'result'),
      ...section('종료 코드', operationResult.exit_code ?? fields(value.result).exit_code, 'result'),
      ...section('토큰 사용량', value.usage),
      ...section('메시지 발신·수신', value.agent_message),
      ...section('전달 출발·도착', value.source && value.target ? { source: value.source, target: value.target } : undefined),
      ...section('표시 근거', `${pointer(collection, key)} 객체의 유형과 상태를 한국어로 표시합니다. 턴은 기록된 턴 ID로 연결합니다.`),
    ]
    const evidence = stateRecords.map(({ collection, key, value }) => stateEvidence(collection, key, value))
    for (const { ref, record } of rawRecords) {
      evidence.push({
        type: record ? 'raw' : 'reference', location: ref.location,
        text: record?.text ?? '이 스냅샷에서 원시 레코드를 찾을 수 없습니다.',
      })
    }
    evidence.push(...payloads.map(payloadEvidence))
    let modelRequest: ModelRequestDetail | undefined
    if (collection === 'inference_calls') {
      const prevSet = previousRequestItems.get(node.action.id)
      const hasPrevious = prevSet !== undefined
      const inputs: ModelInputItem[] = []
      for (const rawId of strings(value.request_item_ids)) {
        const item = lookup('conversation_items', rawId)
        if (!item) continue
        const role: ModelInputItem['role'] = item.action.kind === 'instruction'
          ? 'instruction'
          : item.value.role === 'user'
            ? 'user'
            : item.action.kind === 'tool'
              ? 'tool'
              : item.value.role === 'assistant'
                ? 'assistant'
                : 'other'
        const fresh = hasPrevious
          ? !prevSet.has(rawId)
          : item.turnId === node.turnId && role !== 'instruction'
        inputs.push({
          id: item.action.id,
          label: item.action.reading?.title ?? item.action.label,
          preview: preview(item.action.reading?.text || item.action.summary, 160),
          role,
          fresh,
        })
      }
      const outputs: ModelRequestDetail['outputs'] = []
      for (const rawId of strings(value.response_item_ids)) {
        const item = lookup('conversation_items', rawId)
        if (!item || item.value.kind !== 'message') continue
        outputs.push({
          id: item.action.id,
          label: item.action.reading?.title ?? item.action.label,
          preview: preview(item.action.reading?.text || item.action.summary, 160),
          kind: 'message',
        })
      }
      for (const rawId of strings(value.tool_call_ids_started_by_response)) {
        const tool = lookup('tool_calls', rawId)
        if (!tool) continue
        const reading = tool.action.reading
        const label = reading
          ? [reading.title, reading.target?.text].filter(Boolean).join(' · ')
          : tool.action.label
        outputs.push({
          id: tool.action.id,
          label,
          preview: preview(reading?.outcome ?? tool.action.summary, 160),
          kind: 'tool',
        })
      }
      if (outputs.length === 0) {
        for (const rawId of strings(value.response_item_ids)) {
          const item = lookup('conversation_items', rawId)
          if (!item) continue
          outputs.push({
            id: item.action.id,
            label: item.action.reading?.title ?? item.action.label,
            preview: preview(item.action.reading?.text || item.action.summary, 160),
            kind: 'other',
          })
        }
      }
      modelRequest = {
        model: string(value.model),
        hasPrevious,
        inputs,
        outputs,
      }
    }
    return {
      sections: detailSections,
      relations: (links.get(id) ?? []).map(({ target, label, rule }) => ({ target, label, rule })),
      evidence,
      ...(modelRequest ? { modelRequest } : {}),
    }
  }, buildGraph)
}
