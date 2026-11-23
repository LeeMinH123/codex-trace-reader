import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Action, DeliveryLink, RecentChatList, RolloutInfo, Workspace } from '../../shared/reader'
import { CandidateList, Sources } from './components/layout/Sources'
import { Timeline, type TimelineViewMode } from './components/views/Timeline'
import { TimelineToolbar } from './components/views/TimelineToolbar'
import { Inspector } from './components/Inspector'
import { RecentChats } from './components/layout/RecentChats'
import { TraceSearch, TraceSetup } from './components/layout/TraceSetup'
import { TurnLinks } from './components/common/TurnLinks'
import { stamp } from './components/common/time'
import { visibleReadingOrder } from './model/reading-groups'
import { searchTimeline, visibleTimelineTurns, type TimelineSearchResult } from './model/timeline-search'
import { indexDestinations, rolloutLabel } from './model/turn-destinations'

type RecordMode = 'session' | 'trace'
type Mode = 'recent' | RecordMode
type Reading = { selectedTurnId: string | null; expandedGroups: Set<string>; selected: string | null }
type TurnJump = { key: string; turn: string; offset?: number }
type TurnReturn = { rollout: string; bundle: string; turn: string; offset?: number }
type InspectContext = { highlightItemIds: string[]; returnTo: { id: string; label: string } | null }

const emptyReading: Reading = { selectedTurnId: null, expandedGroups: new Set(), selected: null }
const emptyInspectContext: InspectContext = { highlightItemIds: [], returnTo: null }
const emptySearch: TimelineSearchResult = {
  words: [],
  matches: [],
  matchedActions: new Map(),
  turnMatchCounts: new Map(),
  groupMatchCounts: new Map(),
}
const sourceKey = (mode: Mode, source?: string) => `${mode}:${source ?? ''}`

const viewLabels: { id: TimelineViewMode; label: string }[] = [
  { id: 'story', label: '이야기' },
  { id: 'graph', label: '흐름도' },
  { id: 'waterfall', label: '타임라인' },
  { id: 'raw', label: '원본' },
]

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>()
  const [mode, setMode] = useState<Mode>('recent')
  const [recent, setRecent] = useState<RecentChatList>()
  const [recentQuery, setRecentQuery] = useState('')
  const [timelineQuery, setTimelineQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [matchesOnly, setMatchesOnly] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const [viewMode, setViewMode] = useState<TimelineViewMode>('story')
  const [busy, setBusy] = useState('')
  const busyRef = useRef(false)
  const [problem, setProblem] = useState('')
  const [reading, setReading] = useState<Record<string, Reading>>({})
  const [inspectContext, setInspectContext] = useState<InspectContext>(emptyInspectContext)
  const [candidates, setCandidates] = useState<RolloutInfo[] | null>(null)
  const [turnJump, setTurnJump] = useState<TurnJump | null>(null)
  const turnReturn = useRef<TurnReturn | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const focusSearchRef = useRef(false)
  const positions = useRef(new Map<string, number>())
  const restore = useRef<{ key: string; top: number; selector?: string; offset?: number } | null>(null)
  const jump = useRef<string | null>(null)
  const matchJump = useRef<string | null>(null)
  const lastFocused = useRef<string | null>(null)

  const raw = viewMode === 'raw'

  useEffect(() => {
    void window.reader.workspace().then(setWorkspace, () => setProblem('앱과 연결할 수 없습니다. 앱을 다시 실행하세요.'))
    void window.reader.recentChats().then(setRecent, () => setRecent({
      chats: [], limited: false, issue: { path: '', message: '갱신 버튼으로 다시 시도하세요.' },
    }))
  }, [])

  const session = workspace?.session
  const bundle = workspace?.bundles.find(({ id }) => id === workspace.selectedId)
  const data = mode === 'session' ? session?.timeline : mode === 'trace' ? workspace?.trace ?? undefined : undefined
  const key = sourceKey(mode, mode === 'session' ? session?.rolloutId : mode === 'trace' ? bundle?.id : undefined)
  const { selected, selectedTurnId, expandedGroups } = reading[key] ?? emptyReading

  const index = useMemo(() => {
    const actions = new Map<string, Action>()
    const groups = new Map<string, { turn: string; groupIds: string[]; previous?: Action; next?: Action }>()
    for (const turn of data?.turns ?? []) {
      for (const action of turn.actions) {
        actions.set(action.id, action)
        groups.set(action.id, { turn: turn.id, groupIds: [] })
      }
      const visible = raw
        ? turn.actions.map((action) => ({ action, groupIds: [] as string[] }))
        : visibleReadingOrder(turn)
      for (const [position, entry] of visible.entries()) {
        groups.set(entry.action.id, {
          turn: turn.id,
          groupIds: entry.groupIds,
          previous: visible[position - 1]?.action,
          next: visible[position + 1]?.action,
        })
      }
    }
    return { actions, groups }
  }, [data, raw])

  const searchResult = useMemo(
    () => (data ? searchTimeline(data.turns, timelineQuery, raw) : emptySearch),
    [data, timelineQuery, raw],
  )
  const baseTurns = useMemo(() => visibleTimelineTurns(data?.turns ?? [], raw), [data, raw])
  const filtering = matchesOnly && searchResult.words.length > 0
  const displayedTurns = useMemo(
    () => (filtering ? baseTurns.filter((turn) => (searchResult.turnMatchCounts.get(turn.id) ?? 0) > 0) : baseTurns),
    [baseTurns, filtering, searchResult],
  )
  const activeTurn = useMemo(
    () => displayedTurns.find((turn) => turn.id === selectedTurnId) ?? displayedTurns[0],
    [displayedTurns, selectedTurnId],
  )
  const activeMatch = activeMatchIndex >= 0 && activeMatchIndex < searchResult.matches.length
    ? searchResult.matches[activeMatchIndex]
    : undefined
  const selectedAction = selected ? index.actions.get(selected) : undefined
  const adjacent = selected ? index.groups.get(selected) : undefined
  const traceDestinations = useMemo(() => indexDestinations(
    workspace?.bundles ?? [], workspace?.traceTurns ?? [], (info) => stamp(info.startedAt),
  ), [workspace?.bundles, workspace?.traceTurns])
  const rolloutDestinations = useMemo(() => indexDestinations(
    workspace?.rollouts ?? [], workspace?.rolloutTurns ?? [], rolloutLabel,
  ), [workspace?.rollouts, workspace?.rolloutTurns])
  const visibleSessionTurns = useMemo(
    () => new Set(session?.timeline.turns.flatMap((turn) => turn.threadTurnId ?? [])),
    [session?.timeline],
  )

  useLayoutEffect(() => {
    const area = scroller.current
    if (!area) return
    area.scrollTop = positions.current.get(key) ?? 0
  }, [key])

  useLayoutEffect(() => {
    const area = scroller.current
    const pending = restore.current
    if (area && pending?.key === key) {
      restore.current = null
      const element = pending.selector ? area.querySelector(pending.selector) : null
      area.scrollTop = pending.top
      if (element && pending.offset !== undefined) {
        area.scrollTop += element.getBoundingClientRect().top - area.getBoundingClientRect().top - pending.offset
      }
    }
  }, [data?.token, key, busy])

  useLayoutEffect(() => {
    if (!jump.current || jump.current !== selected) return
    const row = scroller.current?.querySelector<HTMLElement>(`[data-action="${CSS.escape(jump.current)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
    jump.current = null
  }, [selected, selectedTurnId, expandedGroups, viewMode])

  useLayoutEffect(() => {
    if (!matchJump.current) return
    const row = scroller.current?.querySelector<HTMLElement>(`[data-action="${CSS.escape(matchJump.current)}"]`)
    if (row) {
      row.scrollIntoView({ block: 'center' })
      matchJump.current = null
    }
  })

  useEffect(() => {
    setActiveMatchIndex(-1)
    setInspectContext(emptyInspectContext)
    matchJump.current = null
  }, [key, raw, data?.token])

  useEffect(() => {
    if (mode === 'recent' || !data) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (searchOpen && searchInputRef.current) {
          searchInputRef.current.focus()
          searchInputRef.current.select()
        } else {
          focusSearchRef.current = true
          setSearchOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, data, searchOpen])

  useLayoutEffect(() => {
    if (!focusSearchRef.current || !searchOpen) return
    focusSearchRef.current = false
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [searchOpen])

  useLayoutEffect(() => {
    const area = scroller.current
    if (!area || !data || turnJump?.key !== key) return
    const exists = data.turns.some((turn) => turn.id === turnJump.turn)
    if (exists) {
      area.scrollTop = turnJump.offset ?? 0
    } else {
      setProblem('새 스냅샷에서 연결된 턴을 찾을 수 없습니다.')
    }
    setTurnJump(null)
  }, [turnJump, key, data])

  function updateReading(update: (prior: Reading) => Reading) {
    setReading((all) => ({ ...all, [key]: update(all[key] ?? emptyReading) }))
  }

  function switchViewMode(next: TimelineViewMode) {
    if (raw && next !== 'raw' && selectedAction && !selectedAction.reading
      && selectedAction.kind !== 'model' && selectedAction.kind !== 'instruction') {
      closeInspector()
    }
    setViewMode(next)
  }

  function selectTurn(id: string) {
    updateReading((prior) => ({ ...prior, selectedTurnId: id }))
    if (scroller.current) scroller.current.scrollTop = 0
  }

  function toggleGroup(id: string) {
    updateReading((prior) => {
      const updated = new Set(prior.expandedGroups)
      if (updated.has(id)) updated.delete(id)
      else updated.add(id)
      return { ...prior, expandedGroups: updated }
    })
  }

  function toggleTurnGroups(ids: string[], open: boolean) {
    updateReading((prior) => {
      const updated = new Set(prior.expandedGroups)
      for (const id of ids) {
        if (open) updated.add(id)
        else updated.delete(id)
      }
      return { ...prior, expandedGroups: updated }
    })
  }

  function selectAction(
    id: string,
    options: { navigate?: boolean; keepReading?: boolean; preserveContext?: boolean } = {},
  ) {
    const group = index.groups.get(id)
    if (!group) return
    if (options.navigate) {
      jump.current = id
      if (!options.keepReading && !index.actions.get(id)?.reading) setViewMode('raw')
    }
    if (!options.preserveContext) setInspectContext(emptyInspectContext)
    lastFocused.current = id
    const matchIndex = searchResult.matches.findIndex((match) => match.actionId === id)
    if (matchIndex >= 0) setActiveMatchIndex(matchIndex)
    updateReading((prior) => ({
      selected: id,
      selectedTurnId: group.turn,
      expandedGroups: new Set([...prior.expandedGroups, ...group.groupIds]),
    }))
  }

  function inspectDelivery(fromAction: Action, delivery: DeliveryLink) {
    const fromLabel = [fromAction.reading?.title ?? fromAction.label, fromAction.reading?.target?.text]
      .filter(Boolean)
      .join(' · ')
    setInspectContext({
      highlightItemIds: delivery.itemIds,
      returnTo: { id: fromAction.id, label: fromLabel },
    })
    selectAction(delivery.targetId, { keepReading: true, preserveContext: true })
  }

  function returnFromDelivery() {
    const target = inspectContext.returnTo
    setInspectContext(emptyInspectContext)
    if (target) selectAction(target.id, { navigate: true, keepReading: true })
  }

  function handleTimelineQuery(value: string) {
    setTimelineQuery(value)
    setActiveMatchIndex(-1)
    matchJump.current = null
    if (!value.trim()) setMatchesOnly(false)
  }

  function clearTimelineSearch() {
    setTimelineQuery('')
    setMatchesOnly(false)
    setActiveMatchIndex(-1)
    matchJump.current = null
  }

  function stepMatch(delta: 1 | -1) {
    const matches = searchResult.matches
    if (matches.length === 0) return
    const nextIdx = activeMatchIndex < 0
      ? (delta > 0 ? 0 : matches.length - 1)
      : (activeMatchIndex + delta + matches.length) % matches.length
    const target = matches[nextIdx]
    const alreadyVisible = nextIdx === activeMatchIndex
      && activeTurn?.id === target.turnId
      && target.groupIds.every((id) => expandedGroups.has(id))
    if (alreadyVisible) {
      scroller.current?.querySelector<HTMLElement>(`[data-action="${CSS.escape(target.actionId)}"]`)?.scrollIntoView({ block: 'center' })
      return
    }
    setActiveMatchIndex(nextIdx)
    matchJump.current = target.actionId
    updateReading((prior) => ({
      ...prior,
      selectedTurnId: target.turnId,
      expandedGroups: new Set([...prior.expandedGroups, ...target.groupIds]),
    }))
  }

  function toggleMatchesOnly() {
    const next = !matchesOnly
    setMatchesOnly(next)
    if (next && searchResult.matches.length > 0) {
      updateReading((prior) => {
        const firstMatchTurn = searchResult.matches[0].turnId
        const keepCurrent = prior.selectedTurnId && (searchResult.turnMatchCounts.get(prior.selectedTurnId) ?? 0) > 0
        return {
          ...prior,
          selectedTurnId: keepCurrent ? prior.selectedTurnId : firstMatchTurn,
          expandedGroups: new Set([...prior.expandedGroups, ...searchResult.matches.flatMap((match) => match.groupIds)]),
        }
      })
    }
  }

  function closeInspector() {
    setInspectContext(emptyInspectContext)
    updateReading((prior) => ({ ...prior, selected: null }))
    if (lastFocused.current) {
      scroller.current?.querySelector<HTMLElement>(`[data-action="${CSS.escape(lastFocused.current)}"]`)?.focus({ preventScroll: true })
    }
  }

  async function run(label: string, operation: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setProblem('')
    setBusy(label)
    try {
      await operation()
    } catch {
      setProblem('앱에서 요청을 처리할 수 없습니다. 다시 시도하세요.')
    } finally {
      busyRef.current = false
      setBusy('')
    }
  }

  function change(label: string, operation: () => Promise<Workspace>, after?: (result: Workspace) => void) {
    void run(label, async () => {
      const result = await operation()
      setWorkspace(result)
      after?.(result)
    })
  }

  function showOpenedSession(result: Workspace) {
    if (result.session && result.session.timeline.token !== session?.timeline.token) {
      setMode('session')
      setCandidates(null)
      if (session?.id !== result.session.id) {
        setReading({})
        setViewMode('story')
        setSearchOpen(false)
        setInspectContext(emptyInspectContext)
        clearTimelineSearch()
        const recentPosition = positions.current.get(sourceKey('recent')) ?? 0
        positions.current.clear()
        positions.current.set(sourceKey('recent'), recentPosition)
        turnReturn.current = null
        setTurnJump(null)
      }
    }
  }

  function openSession() {
    change('세션 파일 열기', window.reader.chooseSession, showOpenedSession)
  }

  function openRecentChat(id: string) {
    change('채팅 열기', () => window.reader.openRecentChat(id), showOpenedSession)
  }

  function refreshRecent() {
    void run('채팅 목록 갱신', async () => {
      const result = await window.reader.recentChats()
      setRecent((previous) => result.issue && previous?.chats.length ? { ...previous, issue: result.issue } : result)
    })
  }

  function addRollout() {
    change('rollout 파일 추가', window.reader.chooseRollout, (result) => {
      if (result.session?.timeline.token !== session?.timeline.token) setMode('session')
    })
  }

  function selectRollout(id: string) {
    if (id === session?.rolloutId) return
    setTurnJump(null)
    change('rollout 읽기', () => window.reader.selectRollout(id), (result) => {
      if (result.session?.rolloutId === id) setMode('session')
    })
  }

  function visitTurn(nextMode: RecordMode, id: string, turnId: string, offset?: number) {
    const nextKey = sourceKey(nextMode, id)
    const turn = `turn:${turnId}`
    setReading((all) => {
      const prior = all[nextKey] ?? emptyReading
      return {
        ...all,
        [nextKey]: {
          selected: nextMode === 'trace' ? null : prior.selected,
          selectedTurnId: turn,
          expandedGroups: prior.expandedGroups,
        },
      }
    })
    setTurnJump({ key: nextKey, turn, offset })
    setMode(nextMode)
  }

  function openTraceTurn(id: string, turnId: string) {
    if (!session || busyRef.current) return
    const area = scroller.current
    const offset = area ? area.scrollTop : undefined
    const origin = { rollout: session.rolloutId, bundle: id, turn: turnId, offset }
    const visit = () => {
      turnReturn.current = origin
      visitTurn('trace', id, turnId)
    }
    if (workspace?.selectedId === id && workspace.trace) visit()
    else change('연결된 트레이스 읽기', () => window.reader.selectBundle(id), (result) => {
      if (result.selectedId === id) visit()
    })
  }

  function openSessionTurn(id: string, turnId: string) {
    if (busyRef.current) return
    const back = turnReturn.current
    const offset = back?.rollout === id && back.bundle === bundle?.id && back.turn === turnId ? back.offset : undefined
    if (id === session?.rolloutId) visitTurn('session', id, turnId, offset)
    else change('연결된 대화 읽기', () => window.reader.selectRollout(id), (result) => {
      if (result.session?.rolloutId === id) visitTurn('session', id, turnId, offset)
    })
  }

  function openBundle() {
    change('상세 기록 폴더 추가', window.reader.chooseBundle, (result) => {
      if (result.selectedId && (result.selectedId !== workspace?.selectedId
        || result.trace?.token !== workspace?.trace?.token)) setMode('trace')
    })
  }

  function refresh() {
    change('등록된 기록 갱신', async () => {
      const area = scroller.current
      if (area) {
        const y = area.getBoundingClientRect().top
        const item = [...area.querySelectorAll<HTMLElement>('[data-action], [data-turn]')].find((element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.bottom > y
        })
        const attribute = item?.dataset.action ? 'data-action' : 'data-turn'
        const value = item?.getAttribute(attribute)
        const anchor = {
          key, top: area.scrollTop,
          selector: value ? `[${attribute}="${CSS.escape(value)}"]` : undefined,
          offset: item ? item.getBoundingClientRect().top - y : undefined,
        }
        const result = await window.reader.refresh()
        restore.current = anchor
        return result
      }
      return window.reader.refresh()
    })
  }

  function findBundles() {
    change('상세 기록 찾기', window.reader.findTraceMatches)
  }

  function chooseTraceRoot() { change('검색 위치 확인', window.reader.chooseTraceRoot) }

  function findRollouts() {
    void run('같은 채팅의 rollout 찾기', async () => {
      const result = await window.reader.discoverRollouts()
      if (result.issue) setProblem(`${result.issue.message} · ${result.issue.path}`)
      setCandidates(result.candidates)
      setMode('session')
    })
  }

  function addCandidate(id: string) {
    if (!candidates) return
    change('발견한 rollout 추가', () => window.reader.addRolloutCandidate(id), (result) => {
      if (!result.rollouts.some((item) => item.id === id)) return
      const next = candidates.filter((item) => item.id !== id)
      setCandidates(next.length ? next : null)
      setMode('session')
    })
  }

  function turnLink(turnId: string) {
    if (mode === 'session') {
      return <TurnLinks label="이 턴의 실행 보기" choices={traceDestinations.get(turnId) ?? []} empty={raw ? '상세 기록 연결 미확인' : ''}
        busy={Boolean(busy)} onOpen={(id) => openTraceTurn(id, turnId)} />
    }
    const choices = session && visibleSessionTurns.has(turnId)
      ? [{ id: session.rolloutId, label: '선택한 대화', path: session.path }]
      : rolloutDestinations.get(turnId) ?? []
    return <TurnLinks label="대화 턴으로 돌아가기" choices={choices} empty={raw ? '등록된 대화에서 턴 연결 미확인' : ''}
      busy={Boolean(busy)} onOpen={(id) => openSessionTurn(id, turnId)} />
  }

  const chooseExecutable = () => change('변환 실행 파일 선택', window.reader.chooseExecutable)
  const useHint = () => change('데스크톱 실행 파일 확인', window.reader.useExecutableHint)
  const issues = workspace?.issues.filter(({ path }) => mode !== 'recent' || path.toLowerCase().endsWith('.jsonl')) ?? []
  const hasIssues = problem || issues.length
  const back = turnReturn.current
  const showSearchBar = Boolean(data && (searchOpen || timelineQuery.trim().length > 0))

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand"><span className="brand-icon" aria-hidden="true"><i/><i/><i/></span>Codex 트레이스 리더</div>
        <div className="header-actions">
          <span className="busy" role="status">{busy && `${busy} 중…`}</span>
          {mode !== 'recent' && data && (
            <>
              <button
                type="button"
                className="button secondary header-search-btn"
                aria-pressed={showSearchBar}
                onClick={() => {
                  if (showSearchBar) {
                    clearTimelineSearch()
                    setSearchOpen(false)
                  } else {
                    focusSearchRef.current = true
                    setSearchOpen(true)
                  }
                }}
              >
                검색
              </button>
              <div className="header-view-switch" role="group" aria-label="보기 방식">
                {viewLabels.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="header-view-option"
                    aria-pressed={viewMode === item.id}
                    onClick={() => switchViewMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <button type="button" className="button secondary" disabled={Boolean(busy) || (mode === 'recent' ? !recent : !session)}
            onClick={mode === 'recent' ? refreshRecent : refresh}>
            <span aria-hidden="true">↻</span> {mode === 'recent' ? '목록 갱신' : '갱신'}
          </button>
        </div>
      </header>
      {workspace && (
        <div className={data && selectedAction ? 'workspace has-timeline' : 'workspace'}>
          <Sources
            workspace={workspace}
            mode={mode}
            busy={Boolean(busy)}
            turns={displayedTurns}
            selectedTurnId={activeTurn?.id ?? null}
            turnMatchCounts={searchResult.turnMatchCounts}
            onRecent={() => { setProblem(''); setMode('recent') }}
            onSession={() => setMode('session')}
            onOpenSession={openSession}
            onOpenRollout={addRollout}
            onFindRollouts={findRollouts}
            onRollout={selectRollout}
            onBundle={(id) => {
              setTurnJump(null)
              if (workspace.selectedId === id && workspace.trace) setMode('trace')
              else change('상세 트레이스 읽기', () => window.reader.selectBundle(id), () => setMode('trace'))
            }}
            onOpenBundle={openBundle}
            onFind={findBundles}
            onTraceRoot={chooseTraceRoot}
            onSelectTurn={selectTurn}
            onExecutable={chooseExecutable}
          />
          <main className="content" aria-label={mode === 'recent' ? '채팅 목록' : '요청 읽기'} ref={scroller} tabIndex={-1}
            onScroll={(event) => positions.current.set(key, event.currentTarget.scrollTop)}>
            {hasIssues ? (
              <div className="issues" role="status">
                {problem && <div>{problem}</div>}
                {issues.map((issue) => (
                  <div key={`${issue.path}:${issue.message}`}>
                    <strong>{issue.message}</strong>
                    <details><summary>관련 경로</summary><small>{issue.path}</small></details>
                    {issue.previousCheckedAt !== undefined && <small>이전 확인 결과 표시 중 · {stamp(issue.previousCheckedAt)}</small>}
                  </div>
                ))}
              </div>
            ) : null}
            {mode !== 'recent' && candidates && <CandidateList candidates={candidates} busy={Boolean(busy)}
              onClose={() => setCandidates(null)} onAdd={addCandidate}/>}
            {mode === 'recent' && <RecentChats list={recent} query={recentQuery} busy={Boolean(busy)} selectedId={session?.id}
              onQuery={setRecentQuery} onOpen={openRecentChat} onOpenFile={openSession}/>}
            {mode !== 'recent' && session && (
              <>
                {mode === 'session' && data?.note && <p className="timeline-note session-note">{data.note}</p>}
                {mode === 'session' && workspace.bundles.length === 0 && (
                  <TraceSearch result={workspace.traceSearch} busy={Boolean(busy)}
                    onFind={findBundles} onRoot={chooseTraceRoot} onOpen={openBundle}/>
                )}
                {mode === 'trace' && !data && (
                  <TraceSetup workspace={workspace} busy={Boolean(busy)} onHint={useHint} onExecutable={chooseExecutable}
                    onReturn={back && back.bundle === bundle?.id ? () => openSessionTurn(back.rollout, back.turn) : undefined}/>
                )}
                {showSearchBar && (
                  <TimelineToolbar
                    inputRef={searchInputRef}
                    query={timelineQuery}
                    matchesOnly={matchesOnly}
                    matchCount={searchResult.matches.length}
                    activeMatchIndex={activeMatchIndex}
                    turnCount={baseTurns.length}
                    visibleTurnCount={displayedTurns.length}
                    onQuery={handleTimelineQuery}
                    onPrev={() => stepMatch(-1)}
                    onNext={() => stepMatch(1)}
                    onMatchesOnly={toggleMatchesOnly}
                    onClear={clearTimelineSearch}
                    onClose={() => {
                      clearTimelineSearch()
                      setSearchOpen(false)
                    }}
                  />
                )}
                {data && (
                  <Timeline
                    turn={activeTurn}
                    mode={mode}
                    viewMode={viewMode}
                    actionsById={index.actions}
                    hasTurns={baseTurns.length > 0}
                    selected={selectedAction?.id ?? null}
                    expandedGroups={expandedGroups}
                    search={searchResult}
                    activeMatchId={activeMatch?.actionId ?? null}
                    matchesOnly={matchesOnly}
                    onToggleGroup={toggleGroup}
                    onToggleTurnGroups={toggleTurnGroups}
                    onSelect={(id, options) => selectAction(id, options)}
                    onInspectDelivery={inspectDelivery}
                    onViewMode={switchViewMode}
                    turnLink={turnLink}
                  />
                )}
              </>
            )}
          </main>
          {data && selectedAction && (
            <Inspector
              token={data.token}
              action={selectedAction}
              previous={adjacent?.previous}
              next={adjacent?.next}
              actions={index.actions}
              raw={raw}
              highlightItemIds={inspectContext.highlightItemIds}
              returnTo={inspectContext.returnTo}
              onReturn={returnFromDelivery}
              onSelect={(id, options) => selectAction(id, { navigate: true, ...options })}
              onInspectDelivery={inspectDelivery}
              onClose={closeInspector}
            />
          )}
        </div>
      )}
      {!workspace && problem && <p className="startup-error" role="status">{problem}</p>}
    </div>
  )
}
