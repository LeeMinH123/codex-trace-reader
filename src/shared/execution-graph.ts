import type { ActionKind } from './reader'

export type Provenance =
  | { level: 'recorded' }
  | { level: 'id-confirmed' | 'rule-derived' | 'hypothesis' | 'unavailable'; rule: string }

export interface EvidenceRef {
  sourceId: string
  location: string
  kind: 'jsonl' | 'reduced-state' | 'payload'
  availability: 'present' | 'reference-only' | 'partial' | 'missing'
  capture?: ('truncated' | 'omitted')[]
}

export interface SourceCoverage {
  id: string
  path: string
  boundary?: { id: string; bytes: number; ordinal: number }
  limitations: ('history-base-unavailable' | 'partial-jsonl' | 'recording-open' | 'partial-payloads')[]
}

export interface ExecutionCoverage {
  kind: 'rollout' | 'trace'
  sources: SourceCoverage[]
}

export interface ExecutionEvent {
  kind: 'event'
  id: string
  actionKind: ActionKind
  turnId: string
  turnProvenance: Provenance
  actorId?: string
  sourceId: string
  time: number | null
  endTime?: number | null
  sequence: number | null
  evidence: EvidenceRef[]
}

export interface ExecutionAgent {
  kind: 'agent'
  id: string
  label: string
  role: 'agent' | 'user'
  provenance: Provenance
}

export interface ExecutionInformation {
  kind: 'information'
  id: string
  eventId: string
  role: 'message' | 'instruction' | 'call' | 'result' | 'other'
}

export type ExecutionNode = ExecutionEvent | ExecutionAgent | ExecutionInformation

export interface ExecutionEdge {
  kind: 'model-call' | 'tool-result' | 'tool-input' | 'model-input' | 'model-output'
    | 'delivery' | 'containment' | 'delegation' | 'sequence' | 'reference'
  from: string
  to: string
  provenance: Provenance
  itemIds?: string[]
}

export interface ExecutionGraph {
  coverage: ExecutionCoverage
  byId: ReadonlyMap<string, ExecutionNode>
  byTurn: ReadonlyMap<string, readonly ExecutionEvent[]>
  edgesByNode: ReadonlyMap<string, readonly ExecutionEdge[]>
  childrenByParent: ReadonlyMap<string, readonly string[]>
}
