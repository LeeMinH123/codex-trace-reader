import { dirname } from 'node:path'
import type { BundleInfo, ReaderApi, RolloutInfo, SourceIssue, Workspace } from '../../shared/reader'
import { compareId } from '../records/json'
import type { Snapshot } from '../records/timeline'
import { bundleInfo, readManifest } from './bundle'
import { canonicalPath, failureMessage, fixedPath, pathKey } from './files'
import { recordingExecutable, reduceBundle, type RecordingExecutable } from './reducer'
import { defaultCodexHome, RecentChats } from './recent-chats'
import { RolloutSources } from './rollouts'
import { readTraceTurnIds } from './trace-turns'
import { findDesktopExecutable, findTraceBundles } from './trace-discovery'

function bundleOrder(a: BundleInfo, b: BundleInfo) {
  return b.startedAt - a.startedAt || compareId(a.id, b.id)
}

export class ReaderWorkspace {
  private readonly recent: RecentChats
  private rollouts = new RolloutSources()
  private bundles = new Map<string, BundleInfo>()
  private traces = new Map<string, Snapshot>()
  private traceTurns = new Map<string, string[]>()
  private failures = new Map<string, SourceIssue>()
  private candidates = new Map<string, BundleInfo>()
  private firstParent: string | null = null
  private searchFolders = new Set<string>()
  private traceSearch: Workspace['traceSearch'] = null
  private executables = new Map<string, RecordingExecutable>()
  private lastExecutable: string | null = null
  private selectedId: string | null = null
  private pending: Promise<void> = Promise.resolve()
  private desktopExecutable: string | null = null
  private desktopLookup: Promise<string | null> | undefined

  constructor(codexHome = defaultCodexHome(), private readonly defaultRoots: string[] = []) {
    this.recent = new RecentChats(codexHome)
  }

  queue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation)
    this.pending = next.then(() => undefined, () => undefined)
    return next
  }

  whenIdle(): Promise<void> {
    return this.pending
  }

  view(): Workspace {
    const session = this.rollouts.current
    const { selectedId } = this
    const trace = (selectedId ? this.traces.get(selectedId)?.timeline : undefined) ?? null
    const traceKey = `trace:${selectedId}`
    const issues = ['session', 'bundle', 'executable', traceKey].flatMap((key) => {
      const issue = this.failures.get(key)
      if (!issue) return []
      const previousCheckedAt = key === 'session' ? session?.snapshot.timeline.checkedAt
        : key === traceKey ? trace?.checkedAt : undefined
      return [{ ...issue, previousCheckedAt }]
    })
    return {
      session: session && {
        id: session.id, title: this.recent.title(session.id) ?? session.title,
        path: session.path, rolloutId: session.rolloutId,
        sourceIds: session.sourceIds, timeline: session.snapshot.timeline,
      },
      ...this.rollouts.view(),
      bundles: [...this.bundles.values()].sort(bundleOrder),
      traceTurns: [...this.traceTurns].map(([id, turnIds]) => ({ id, turnIds })),
      selectedId,
      trace,
      executable: (selectedId ? this.executables.get(selectedId)?.path : undefined) ?? null,
      executableHint: this.lastExecutable ?? this.desktopExecutable,
      traceSearch: this.traceSearch,
      issues,
    }
  }

  recentChats() { return this.recent.list() }

  async openRecentChat(id: string) {
    const source = this.recent.source(id)
    if (!source) throw new Error('최근 채팅 목록에서 항목을 다시 선택하세요.')
    await this.openSession(source.path, source)
  }

  async openSession(path: string, expected?: Pick<RolloutInfo, 'id' | 'threadId'>) {
    await this.attempt('session', path, async () => {
      const previous = this.rollouts.current?.id
      await this.rollouts.open(path, false, expected)
      if (this.rollouts.current?.id !== previous) {
        this.bundles.clear()
        this.traces.clear()
        this.traceTurns.clear()
        this.executables.clear()
        this.failures.clear()
        this.candidates.clear()
        this.selectedId = null
        this.firstParent = null
        this.traceSearch = null
      }
    })
    if (!this.failures.has('session') && this.traceSearch === null) await this.findTraceMatches()
  }

  async openRollout(path: string) {
    await this.attempt('session', path, () => this.rollouts.open(path, true))
  }

  async selectRollout(id: string) {
    const path = this.rollouts.path(id)
    if (path) await this.attempt('session', path, () => this.rollouts.select(id))
  }

  discoverRollouts() { return this.rollouts.discover() }

  async addRolloutCandidate(id: string) {
    const path = this.rollouts.path(id)
    if (path) await this.attempt('session', path, () => this.rollouts.addCandidate(id))
  }

  async openBundle(path: string, candidateId?: string) {
    await this.attempt('bundle', path, async () => {
      const session = this.rollouts.current
      if (!session) throw new Error('먼저 세션 파일을 여세요.')
      const manifest = await readManifest(await canonicalPath(path, 'directory'), session.id)
      if (candidateId && candidateId !== manifest.id) throw new Error('탐색 이후 번들 ID가 바뀌었습니다.')
      const existing = this.bundles.get(manifest.id)
      const existingAtPath = [...this.bundles.values()].find((bundle) => pathKey(bundle.path) === pathKey(manifest.path))
      if (existing && pathKey(existing.path) !== pathKey(manifest.path)) {
        try {
          await fixedPath(existing.path, 'directory')
          throw new Error('같은 trace_id의 번들이 이미 등록되어 있습니다.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      if (existingAtPath && existingAtPath.id !== manifest.id) {
        this.bundles.delete(existingAtPath.id)
        this.traces.delete(existingAtPath.id)
        this.traceTurns.delete(existingAtPath.id)
        this.executables.delete(existingAtPath.id)
        this.failures.delete(`trace:${existingAtPath.id}`)
      }
      this.bundles.set(manifest.id, bundleInfo(manifest))
      this.candidates.delete(manifest.id)
      this.firstParent ??= dirname(manifest.path)
      this.searchFolders.add(dirname(manifest.path))
      await this.selectBundle(manifest.id)
    })
  }

  async openTraceRoot(path: string) {
    await this.attempt('bundle', path, async () => {
      this.searchFolders.add(await canonicalPath(path, 'directory'))
      await this.findTraceMatches()
    })
  }

  async findTraceMatches() {
    const session = this.rollouts.current
    if (!session) return
    const result = await findTraceBundles([...this.searchFolders, ...this.defaultRoots],
      session.id, [...this.bundles.values()].map(({ path }) => path))
    this.traceSearch = { searched: result.searched, issue: result.issue }
    this.failures.delete('bundle')
    const matches = result.matches.sort(bundleOrder)
    for (const manifest of matches) {
      if (this.bundles.has(manifest.id)) continue
      this.bundles.set(manifest.id, bundleInfo(manifest))
      try {
        this.traceTurns.set(manifest.id, await readTraceTurnIds(manifest))
      } catch {
        // The folder still belongs to this chat. Opening it reports any read failure.
      }
    }
  }

  async selectBundle(id: string) {
    const bundle = this.bundles.get(id)
    if (!bundle) return
    this.selectedId = bundle.id
    if (!this.lastExecutable && !this.executables.has(id)) {
      this.desktopLookup ??= findDesktopExecutable()
      this.desktopExecutable = await this.desktopLookup
    }
    await this.loadTrace(bundle)
  }

  async setExecutable(path: string) {
    await this.attempt('executable', path, async () => {
      const executable = await recordingExecutable(path)
      this.lastExecutable = executable.path
      const bundle = this.selectedId && this.bundles.get(this.selectedId)
      if (bundle) {
        this.executables.set(bundle.id, executable)
        await this.loadTrace(bundle)
      }
    })
  }

  async useExecutableHint() {
    const hint = this.view().executableHint
    if (hint) await this.setExecutable(hint)
  }

  async refresh() {
    const bundle = this.selectedId && this.bundles.get(this.selectedId)
    const session = this.rollouts.current
    if (!session) return
    await Promise.all([
      this.attempt('session', session.path, () => this.rollouts.select(session.rolloutId, true)),
      bundle ? this.loadTrace(bundle) : Promise.resolve(),
    ])
  }

  async discover(): ReturnType<ReaderApi['discover']> {
    this.candidates.clear()
    const parent = this.firstParent
    const session = this.rollouts.current
    if (!parent || !session) return { candidates: [] }
    const { matches, issue } = await findTraceBundles([parent], session.id, [...this.bundles.values()].map(({ path }) => path))
    for (const manifest of matches) {
      if (!this.bundles.has(manifest.id)) this.candidates.set(manifest.id, bundleInfo(manifest))
    }
    return { candidates: [...this.candidates.values()].sort(bundleOrder), issue }
  }

  async addCandidate(id: string) {
    const candidate = this.candidates.get(id)
    if (candidate) await this.openBundle(candidate.path, id)
  }

  inspect(token: string, actionId: string) {
    const session = this.rollouts.current?.snapshot
    const trace = this.selectedId ? this.traces.get(this.selectedId) : undefined
    if (session?.timeline.token === token) return session.inspect(actionId)
    if (trace?.timeline.token === token) return trace.inspect(actionId)
    return null
  }

  private async loadTrace(bundle: BundleInfo) {
    await this.attempt(`trace:${bundle.id}`, bundle.path, async () => {
      const session = this.rollouts.current
      if (!session) return
      const manifest = await readManifest(bundle.path, session.id)
      if (manifest.id !== bundle.id) throw new Error('등록한 번들 ID가 바뀌었습니다. 폴더를 다시 선택하세요.')
      const executable = this.executables.get(bundle.id)
      if (!executable) {
        if (!this.traceTurns.has(bundle.id)) this.traceTurns.set(bundle.id, await readTraceTurnIds(manifest))
        return
      }
      try {
        const trace = await reduceBundle(manifest, executable)
        this.traces.set(bundle.id, trace)
        this.traceTurns.set(bundle.id, trace.timeline.turns.flatMap((turn) => turn.threadTurnId ?? []))
      } catch (error) {
        if (!this.traces.has(bundle.id) && !this.traceTurns.has(bundle.id)) {
          try {
            this.traceTurns.set(bundle.id, await readTraceTurnIds(manifest))
          } catch {
            // Keep the conversion error when the raw turn index is also unavailable.
          }
        }
        throw error
      }
      this.bundles.set(bundle.id, bundleInfo(manifest))
    })
  }

  private async attempt(key: string, path: string, operation: () => Promise<void>) {
    try {
      await operation()
      this.failures.delete(key)
    } catch (error) {
      this.failures.set(key, { path, message: failureMessage(error) })
    }
  }
}
