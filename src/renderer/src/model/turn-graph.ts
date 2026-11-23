import type { Action, Turn } from '../../../shared/reader'
import { buildProgressFlow, tallyTitles, type TitleCount } from './reading-groups'

function clipText(value: string | undefined, limit: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

function compareChrono(a: Pick<Action, 'time' | 'sequence' | 'id'>, b: Pick<Action, 'time' | 'sequence' | 'id'>): number {
  const timeOrder = (a.time ?? Infinity) - (b.time ?? Infinity)
  const sequenceOrder = (a.sequence ?? Infinity) - (b.sequence ?? Infinity)
  return timeOrder || sequenceOrder || (a.id < b.id ? -1 : a.id === b.id ? 0 : 1)
}

export type GraphNodeKind = 'request' | 'model' | 'message' | 'tool' | 'run' | 'answer'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  actionId?: string
  groupId?: string
  title: string
  subtitle?: string
  durationMs: number | null
  count?: number
  tally?: TitleCount[]
  actions?: Action[]
  nestedCount?: number
  nestedChildren?: Action[]
  expanded?: boolean
  deliveryCount?: number
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  kind: 'confirmed-call' | 'confirmed-delivery' | 'sequence'
}

export interface GraphStage {
  id: string
  nodes: GraphNode[]
}

export interface TurnGraph {
  mode: 'dag' | 'flow'
  stages: GraphStage[]
  edges: GraphEdge[]
}

function durationOf(start: number | null, end: number | null | undefined): number | null {
  if (start === null || end === null || end === undefined || end < start) return null
  return end - start
}

function collectNestedMap(progressActions: Action[]) {
  const byId = new Map(progressActions.map((action) => [action.id, action]))
  const childrenByParent = new Map<string, Action[]>()
  const nestedIds = new Set<string>()
  for (const action of progressActions) {
    if (action.kind === 'message') continue
    const parentId = action.parent?.id
    if (!parentId || parentId === action.id) continue
    const parent = byId.get(parentId)
    if (!parent || parent.kind === 'message') continue
    const seen = new Set<string>([action.id])
    let cursor: string | undefined = parentId
    let cyclic = false
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic = true
        break
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parent?.id
    }
    if (cyclic) continue
    nestedIds.add(action.id)
    const list = childrenByParent.get(parentId) ?? []
    list.push(action)
    childrenByParent.set(parentId, list)
  }

  function allDescendants(parentId: string): Action[] {
    const out: Action[] = []
    for (const child of childrenByParent.get(parentId) ?? []) {
      out.push(child, ...allDescendants(child.id))
    }
    return out
  }

  return { nestedIds, allDescendants }
}

function addEdge(edges: GraphEdge[], seen: Set<string>, from: string, to: string, kind: GraphEdge['kind']) {
  if (from === to) return
  const key = `${kind}:${from}->${to}`
  if (seen.has(key)) return
  seen.add(key)
  edges.push({ id: key, from, to, kind })
}

export function buildTurnGraph(turn: Turn, expandedGroups: Set<string>): TurnGraph {
  const requests = turn.actions.filter((action) => action.reading?.stage === 'request')
  const answers = turn.actions.filter((action) => action.reading?.stage === 'answer')
  const progress = turn.actions.filter((action) => action.reading?.stage === 'progress')
  const models = turn.actions.filter((action) => action.kind === 'model')
  const { nestedIds, allDescendants } = collectNestedMap(progress)
  const modelIds = new Set(models.map((model) => model.id))

  const makeToolNode = (action: Action): GraphNode => {
    const nested = allDescendants(action.id)
    const groupId = nested.length > 0 ? `call:${action.id}` : undefined
    const deliveries = [action, ...nested].flatMap((item) => item.deliveries ?? [])
    const deliveryTargets = new Set(deliveries.map((d) => d.targetId).filter((id) => modelIds.has(id)))
    return {
      id: action.id,
      kind: 'tool',
      actionId: action.id,
      groupId,
      title: action.reading?.title ?? action.label,
      subtitle: action.reading?.target?.text,
      durationMs: durationOf(action.time, action.endTime),
      nestedCount: nested.length > 0 ? nested.length : undefined,
      nestedChildren: nested.length > 0 ? nested : undefined,
      expanded: groupId ? expandedGroups.has(groupId) : undefined,
      deliveryCount: deliveryTargets.size > 0 ? deliveryTargets.size : undefined,
    }
  }

  const makeMessageNode = (action: Action): GraphNode => ({
    id: action.id,
    kind: 'message',
    actionId: action.id,
    title: clipText(action.reading?.text ?? action.summary, 44) || '진행 메시지',
    durationMs: null,
  })

  const stages: GraphStage[] = []
  const edges: GraphEdge[] = []
  const edgeKeys = new Set<string>()
  const stageAnchors: { stageId: string; anchorId: string }[] = []

  if (requests.length > 0) {
    const req = requests[0]
    const stageId = `stage:${req.id}`
    stages.push({
      id: stageId,
      nodes: [{
        id: req.id,
        kind: 'request',
        actionId: req.id,
        title: '사용자 요청',
        subtitle: clipText(req.reading?.text ?? req.summary, 38) || undefined,
        durationMs: null,
      }],
    })
    stageAnchors.push({ stageId, anchorId: req.id })
  }

  if (models.length > 0) {
    const topProgress = progress.filter((action) => !nestedIds.has(action.id))
    const startedByModel = new Map<string, Action[]>()
    const unlinked: Action[] = []
    for (const action of topProgress) {
      if (action.kind !== 'message' && action.startedById && modelIds.has(action.startedById)) {
        const list = startedByModel.get(action.startedById) ?? []
        list.push(action)
        startedByModel.set(action.startedById, list)
      } else {
        unlinked.push(action)
      }
    }

    const flushUnlinked = (items: Action[], prefix: string) => {
      let buffer: Action[] = []
      const flushBuffer = () => {
        if (buffer.length === 0) return
        if (buffer.length === 1) {
          const tool = buffer[0]
          stages.push({ id: `stage:${tool.id}`, nodes: [makeToolNode(tool)] })
          stageAnchors.push({ stageId: `stage:${tool.id}`, anchorId: tool.id })
        } else {
          const groupId = `run:${prefix}:${buffer[0].id}`
          const expanded = expandedGroups.has(groupId)
          const first = buffer[0].time
          const last = buffer.at(-1)?.endTime ?? buffer.at(-1)?.time ?? null
          stages.push({
            id: `stage:${groupId}`,
            nodes: [{
              id: groupId,
              kind: 'run',
              groupId,
              title: `실행 ${buffer.length}개`,
              count: buffer.length,
              tally: tallyTitles(buffer),
              actions: buffer,
              durationMs: durationOf(first, last),
              expanded,
            }],
          })
          stageAnchors.push({ stageId: `stage:${groupId}`, anchorId: groupId })
        }
        buffer = []
      }
      for (const item of items) {
        if (item.kind === 'message') {
          flushBuffer()
          const node = makeMessageNode(item)
          stages.push({ id: `stage:${item.id}`, nodes: [node] })
          stageAnchors.push({ stageId: `stage:${item.id}`, anchorId: node.id })
        } else {
          buffer.push(item)
        }
      }
      flushBuffer()
    }

    let cursor = 0
    models.forEach((model, index) => {
      const before: Action[] = []
      while (cursor < unlinked.length && compareChrono(unlinked[cursor], model) < 0) {
        before.push(unlinked[cursor])
        cursor += 1
      }
      if (before.length > 0) flushUnlinked(before, `pre-${index}`)

      const modelNode: GraphNode = {
        id: model.id,
        kind: 'model',
        actionId: model.id,
        title: `모델 요청 ${index + 1}`,
        subtitle: model.summary || undefined,
        durationMs: durationOf(model.time, model.endTime),
      }
      stages.push({ id: `stage:${model.id}`, nodes: [modelNode] })
      stageAnchors.push({ stageId: `stage:${model.id}`, anchorId: modelNode.id })

      const started = startedByModel.get(model.id) ?? []
      if (started.length > 0) {
        if (started.length <= 4) {
          const nodes = started.map(makeToolNode)
          const stageId = `stage:calls:${model.id}`
          stages.push({ id: stageId, nodes })
          stageAnchors.push({ stageId, anchorId: nodes[0].id })
          for (const tool of started) {
            addEdge(edges, edgeKeys, model.id, tool.id, 'confirmed-call')
            const related = [tool, ...allDescendants(tool.id)]
            for (const item of related) {
              for (const delivery of item.deliveries ?? []) {
                if (modelIds.has(delivery.targetId)) {
                  addEdge(edges, edgeKeys, tool.id, delivery.targetId, 'confirmed-delivery')
                }
              }
            }
          }
        } else {
          const groupId = `model-run:${model.id}`
          const expanded = expandedGroups.has(groupId)
          const first = started[0].time
          const last = started.at(-1)?.endTime ?? started.at(-1)?.time ?? null
          stages.push({
            id: `stage:${groupId}`,
            nodes: [{
              id: groupId,
              kind: 'run',
              groupId,
              title: `실행 ${started.length}개`,
              count: started.length,
              tally: tallyTitles(started),
              actions: started,
              durationMs: durationOf(first, last),
              expanded,
            }],
          })
          stageAnchors.push({ stageId: `stage:${groupId}`, anchorId: groupId })
          addEdge(edges, edgeKeys, model.id, groupId, 'confirmed-call')
          for (const tool of started) {
            for (const item of [tool, ...allDescendants(tool.id)]) {
              for (const delivery of item.deliveries ?? []) {
                if (modelIds.has(delivery.targetId)) {
                  addEdge(edges, edgeKeys, groupId, delivery.targetId, 'confirmed-delivery')
                }
              }
            }
          }
        }
      }
    })
    if (cursor < unlinked.length) {
      flushUnlinked(unlinked.slice(cursor), 'tail')
    }
  } else {
    const entries = buildProgressFlow(progress)
    for (const entry of entries) {
      if (entry.kind === 'message') {
        const node = makeMessageNode(entry.action)
        stages.push({ id: `stage:${node.id}`, nodes: [node] })
        stageAnchors.push({ stageId: `stage:${node.id}`, anchorId: node.id })
      } else if (entry.kind === 'action') {
        const node = makeToolNode(entry.action)
        stages.push({ id: `stage:${node.id}`, nodes: [node] })
        stageAnchors.push({ stageId: `stage:${node.id}`, anchorId: node.id })
      } else if (entry.kind === 'call-group') {
        const node = makeToolNode(entry.parent)
        stages.push({ id: `stage:${node.id}`, nodes: [node] })
        stageAnchors.push({ stageId: `stage:${node.id}`, anchorId: node.id })
      } else {
        const expanded = expandedGroups.has(entry.id)
        stages.push({
          id: `stage:${entry.id}`,
          nodes: [{
            id: entry.id,
            kind: 'run',
            groupId: entry.id,
            title: `실행 ${entry.actions.length}개`,
            count: entry.actions.length,
            tally: entry.titles,
            actions: entry.actions,
            durationMs: durationOf(entry.startTime, entry.endTime),
            expanded,
          }],
        })
        stageAnchors.push({ stageId: `stage:${entry.id}`, anchorId: entry.id })
      }
    }
  }

  if (answers.length > 0) {
    const ans = answers[answers.length - 1]
    const stageId = `stage:${ans.id}`
    stages.push({
      id: stageId,
      nodes: [{
        id: ans.id,
        kind: 'answer',
        actionId: ans.id,
        title: '최종 답변',
        subtitle: clipText(ans.reading?.text ?? ans.summary, 38) || undefined,
        durationMs: null,
      }],
    })
    stageAnchors.push({ stageId, anchorId: ans.id })
  }

  // Connect consecutive stages with sequence edges when no confirmed edge links them
  const stageNodeIds = new Map(stages.map((stage) => [stage.id, new Set(stage.nodes.map((node) => node.id))]))
  const incomingNodes = new Set(edges.map((edge) => edge.to))
  const outgoingNodes = new Set(edges.map((edge) => edge.from))
  for (let i = 0; i < stageAnchors.length - 1; i += 1) {
    const current = stageAnchors[i]
    const next = stageAnchors[i + 1]
    const currentIds = stageNodeIds.get(current.stageId)!
    const nextIds = stageNodeIds.get(next.stageId)!
    const hasDirect = edges.some((edge) => currentIds.has(edge.from) && nextIds.has(edge.to))
    if (hasDirect) continue
    const currentConnectedOut = [...currentIds].some((id) => outgoingNodes.has(id))
    const nextConnectedIn = [...nextIds].some((id) => incomingNodes.has(id))
    if (models.length === 0 || !currentConnectedOut || !nextConnectedIn) {
      addEdge(edges, edgeKeys, current.anchorId, next.anchorId, 'sequence')
    }
  }

  return {
    mode: models.length > 0 ? 'dag' : 'flow',
    stages,
    edges,
  }
}
