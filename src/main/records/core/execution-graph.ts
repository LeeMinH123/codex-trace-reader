import type { Turn } from '../../../shared/reader'
import type {
  EvidenceRef, ExecutionAgent, ExecutionCoverage, ExecutionEdge, ExecutionEvent, ExecutionGraph, ExecutionInformation,
  ExecutionNode, Provenance,
} from '../../../shared/execution-graph'

export interface EventRecord {
  sourceId: string
  turnProvenance: Provenance
  evidence: EvidenceRef[]
  actor?: Omit<ExecutionAgent, 'kind'>
  information?: ExecutionInformation['role']
}

export function buildExecutionGraph(
  turns: readonly Turn[],
  coverage: ExecutionCoverage,
  recordFor: (actionId: string) => EventRecord,
  recordedEdges: readonly ExecutionEdge[],
): ExecutionGraph {
  const byId = new Map<string, ExecutionNode>()
  const byTurn = new Map<string, ExecutionEvent[]>()
  const edgesByNode = new Map<string, ExecutionEdge[]>()
  const children = new Map<string, Set<string>>()
  const seenEdges = new Set<string>()

  for (const turn of turns) {
    const events = turn.actions.map((action): ExecutionEvent => {
      const { sourceId, turnProvenance, evidence, actor, information } = recordFor(action.id)
      if (actor && !byId.has(actor.id)) byId.set(actor.id, { kind: 'agent', ...actor })
      if (information) {
        const id = `info:${action.id}`
        byId.set(id, { kind: 'information', id, eventId: action.id, role: information })
      }
      const event: ExecutionEvent = {
        kind: 'event', id: action.id, actionKind: action.kind, turnId: turn.id, turnProvenance,
        actorId: actor?.id, sourceId, time: action.time, endTime: action.endTime, sequence: action.sequence, evidence,
      }
      byId.set(action.id, event)
      return event
    })
    byTurn.set(turn.id, events)
  }

  function addEdge(edge: ExecutionEdge) {
    if (edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) return
    const identity = JSON.stringify([edge.kind, edge.from, edge.to, edge.provenance, edge.itemIds])
    if (seenEdges.has(identity)) return
    seenEdges.add(identity)
    for (const id of [edge.from, edge.to]) {
      const edges = edgesByNode.get(id) ?? []
      edges.push(edge)
      edgesByNode.set(id, edges)
    }
    if (edge.kind === 'containment') {
      const ids = children.get(edge.from) ?? new Set<string>()
      ids.add(edge.to)
      children.set(edge.from, ids)
    }
  }

  for (const edge of recordedEdges) addEdge(edge)
  for (const events of byTurn.values()) {
    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1]
      const current = events[index]
      if (previous.sourceId !== current.sourceId) continue
      addEdge({
        kind: 'sequence', from: previous.id, to: current.id,
        provenance: { level: 'rule-derived', rule: '같은 기록 구간에서 시각·순번·ID로 정렬한 표시 순서' },
      })
    }
  }
  const childrenByParent = new Map([...children].map(([id, ids]) => [id, [...ids]]))
  return { coverage, byId, byTurn, edgesByNode, childrenByParent }
}
