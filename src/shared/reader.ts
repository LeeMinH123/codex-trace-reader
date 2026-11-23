export type ActionKind = 'message' | 'instruction' | 'model' | 'tool' | 'runtime' | 'agent' | 'record'

export type ReadingStage = 'request' | 'progress' | 'answer'

export interface ReadingAction {
  stage: ReadingStage
  title: string
  text?: string
  target?: { label: string; text: string }
  outcome?: string
}

export interface ActionParent {
  id: string
  rule: string
}

export interface DeliveryLink {
  targetId: string
  targetLabel: string
  targetTime: number | null
  itemIds: string[]
}

export interface ModelInputItem {
  id: string
  label: string
  preview: string
  role: 'instruction' | 'user' | 'assistant' | 'tool' | 'other'
  fresh: boolean
}

export interface ModelRequestDetail {
  model?: string
  hasPrevious: boolean
  inputs: ModelInputItem[]
  outputs: { id: string; label: string; preview: string; kind: 'message' | 'tool' | 'other' }[]
}

export interface Action {
  id: string
  kind: ActionKind
  label: string
  summary: string
  actor: string
  time: number | null
  endTime?: number | null
  sequence: number | null
  status?: string
  reading?: ReadingAction
  parent?: ActionParent
  startedById?: string
  outputPreview?: string
  deliveries?: DeliveryLink[]
}

export interface Turn {
  id: string
  title: string
  actor: string
  time: number | null
  endTime?: number | null
  sequence: number | null
  status?: string
  threadTurnId?: string
  instructionIds?: string[]
  actions: Action[]
}

export interface Timeline {
  token: string
  checkedAt: number
  lastAt: number | null
  status: string
  note?: string
  turns: Turn[]
}

export interface DetailSection {
  title: string
  text: string
  kind?: 'message' | 'input' | 'result'
}

export interface Relation {
  target: string
  label: string
  rule: string
}

export interface Evidence {
  location: string
  type: 'derived' | 'raw' | 'reference'
  text?: string
}

export interface ActionDetail {
  sections: DetailSection[]
  relations: Relation[]
  evidence: Evidence[]
  modelRequest?: ModelRequestDetail
}

export interface BundleInfo {
  id: string
  path: string
  startedAt: number
}

export interface RolloutInfo {
  id: string
  threadId: string
  path: string
  startedAt: number | null
  base?: { id: string; bytes: number; ordinal: number }
}

export interface TurnCoverage {
  id: string
  turnIds: string[]
}

interface Discovery<T> {
  candidates: T[]
  issue?: SourceIssue
}

export interface SourceIssue {
  path: string
  message: string
  previousCheckedAt?: number
}

export interface RecentChat {
  id: string
  title: string
  firstRequest: string | null
  updatedAt: number
}

export interface RecentChatList {
  chats: RecentChat[]
  limited: boolean
  issue?: SourceIssue
}

export interface Workspace {
  session: { id: string; title: string; path: string; rolloutId: string; sourceIds: string[]; timeline: Timeline } | null
  rollouts: RolloutInfo[]
  rolloutTurns: TurnCoverage[]
  bundles: BundleInfo[]
  traceTurns: TurnCoverage[]
  selectedId: string | null
  trace: Timeline | null
  executable: string | null
  executableHint: string | null
  traceSearch: { searched: string[]; issue?: SourceIssue } | null
  issues: SourceIssue[]
}

export interface ReaderApi {
  workspace(): Promise<Workspace>
  recentChats(): Promise<RecentChatList>
  openRecentChat(id: string): Promise<Workspace>
  chooseSession(): Promise<Workspace>
  chooseRollout(): Promise<Workspace>
  selectRollout(id: string): Promise<Workspace>
  discoverRollouts(): Promise<Discovery<RolloutInfo>>
  addRolloutCandidate(id: string): Promise<Workspace>
  chooseBundle(): Promise<Workspace>
  findTraceMatches(): Promise<Workspace>
  chooseTraceRoot(): Promise<Workspace>
  chooseExecutable(): Promise<Workspace>
  useExecutableHint(): Promise<Workspace>
  selectBundle(id: string): Promise<Workspace>
  refresh(): Promise<Workspace>
  discover(): Promise<Discovery<BundleInfo>>
  addCandidate(id: string): Promise<Workspace>
  inspect(token: string, actionId: string): Promise<ActionDetail | null>
}
