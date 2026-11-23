import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Action, DeliveryLink } from '../../src/shared/reader'
import { Inspector } from '../../src/renderer/src/components/Inspector'
import { Timeline, type TimelineViewMode } from '../../src/renderer/src/components/Timeline'
import { TimelineToolbar } from '../../src/renderer/src/components/TimelineToolbar'
import { visibleReadingOrder } from '../../src/renderer/src/app/reading-groups'
import {
  searchTimeline,
  visibleTimelineTurns,
  type TimelineSearchResult,
} from '../../src/renderer/src/app/timeline-search'
import { stamp } from '../../src/renderer/src/components/time'
import { DEMO_SCENARIOS, type DemoScenario } from './demo-data'

type InspectContext = { highlightItemIds: string[]; returnTo: { id: string; label: string } | null }

const emptyInspectContext: InspectContext = { highlightItemIds: [], returnTo: null }
const emptySearch: TimelineSearchResult = {
  words: [],
  matches: [],
  matchedActions: new Map(),
  turnMatchCounts: new Map(),
  groupMatchCounts: new Map(),
}

const viewLabels: { id: TimelineViewMode; label: string }[] = [
  { id: 'story', label: '이야기' },
  { id: 'graph', label: '흐름도' },
  { id: 'waterfall', label: '타임라인' },
  { id: 'raw', label: '원본' },
]

export function DemoWorkbench() {
  const [scenarioId, setScenarioId] = useState<DemoScenario['id']>('prd-review')
  const [viewMode, setViewMode] = useState<TimelineViewMode>('story')
  const [selectedTurnByScenario, setSelectedTurnByScenario] = useState<Record<string, string | null>>({
    'prd-review': 'turn:t1',
    'computer-use': 'turn:cu1',
  })
  const [selectedByScenario, setSelectedByScenario] = useState<Record<string, string | null>>({
    'prd-review': 't1',
    'computer-use': 'cu:s3',
  })
  const [expandedByScenario, setExpandedByScenario] = useState<Record<string, Set<string>>>({
    'prd-review': new Set(['chapter:p1']),
    'computer-use': new Set(['chapter:cu:p1']),
  })
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [matchesOnly, setMatchesOnly] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const [inspectContext, setInspectContext] = useState<InspectContext>(emptyInspectContext)

  const scroller = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const matchJump = useRef<string | null>(null)
  const focusSearchRef = useRef(false)

  const scenario = useMemo(
    () => DEMO_SCENARIOS.find((item) => item.id === scenarioId) ?? DEMO_SCENARIOS[0],
    [scenarioId],
  )
  const raw = viewMode === 'raw'
  const data = scenario.timeline
  const selectedTurnId = selectedTurnByScenario[scenario.id] ?? null
  const selected = selectedByScenario[scenario.id] ?? null
  const expandedGroups = expandedByScenario[scenario.id] ?? new Set<string>()

  const index = useMemo(() => {
    const actions = new Map<string, Action>()
    const groups = new Map<string, { turn: string; groupIds: string[]; previous?: Action; next?: Action }>()
    for (const turn of data.turns) {
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
    () => searchTimeline(data.turns, query, raw),
    [data, query, raw],
  )
  const baseTurns = useMemo(() => visibleTimelineTurns(data.turns, raw), [data, raw])
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

  useEffect(() => {
    if (!focusSearchRef.current || !searchOpen) return
    focusSearchRef.current = false
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [searchOpen])

  useLayoutEffect(() => {
    if (!matchJump.current) return
    const row = scroller.current?.querySelector<HTMLElement>(`[data-action="${CSS.escape(matchJump.current)}"]`)
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      matchJump.current = null
    }
  })

  function switchScenario(nextId: DemoScenario['id']) {
    setScenarioId(nextId)
    setQuery('')
    setMatchesOnly(false)
    setSearchOpen(false)
    setActiveMatchIndex(-1)
    setInspectContext(emptyInspectContext)
    setViewMode('story')
    if (scroller.current) scroller.current.scrollTop = 0
  }

  function selectTurn(id: string) {
    setSelectedTurnByScenario((prev) => ({ ...prev, [scenario.id]: id }))
    if (scroller.current) scroller.current.scrollTop = 0
  }

  function toggleGroup(id: string) {
    setExpandedByScenario((prev) => {
      const updated = new Set(prev[scenario.id] ?? [])
      if (updated.has(id)) updated.delete(id)
      else updated.add(id)
      return { ...prev, [scenario.id]: updated }
    })
  }

  function toggleTurnGroups(ids: string[], open: boolean) {
    setExpandedByScenario((prev) => {
      const updated = new Set(prev[scenario.id] ?? [])
      for (const id of ids) {
        if (open) updated.add(id)
        else updated.delete(id)
      }
      return { ...prev, [scenario.id]: updated }
    })
  }

  function selectAction(id: string, options: { preserveContext?: boolean } = {}) {
    const group = index.groups.get(id)
    if (!group) return
    if (!options.preserveContext) setInspectContext(emptyInspectContext)
    const matchIndex = searchResult.matches.findIndex((match) => match.actionId === id)
    if (matchIndex >= 0) setActiveMatchIndex(matchIndex)
    setSelectedByScenario((prev) => ({ ...prev, [scenario.id]: id }))
    setSelectedTurnByScenario((prev) => ({ ...prev, [scenario.id]: group.turn }))
    if (group.groupIds.length > 0) {
      toggleTurnGroups(group.groupIds, true)
    }
  }

  function inspectDelivery(fromAction: Action, delivery: DeliveryLink) {
    const fromLabel = [fromAction.reading?.title ?? fromAction.label, fromAction.reading?.target?.text]
      .filter(Boolean)
      .join(' · ')
    setInspectContext({
      highlightItemIds: delivery.itemIds,
      returnTo: { id: fromAction.id, label: fromLabel },
    })
    selectAction(delivery.targetId, { preserveContext: true })
  }

  function returnFromDelivery() {
    const target = inspectContext.returnTo
    setInspectContext(emptyInspectContext)
    if (target) selectAction(target.id)
  }

  function moveMatch(step: number) {
    if (searchResult.matches.length === 0) return
    const next = activeMatchIndex < 0
      ? (step > 0 ? 0 : searchResult.matches.length - 1)
      : (activeMatchIndex + step + searchResult.matches.length) % searchResult.matches.length
    const target = searchResult.matches[next]
    setActiveMatchIndex(next)
    matchJump.current = target.actionId
    setSelectedTurnByScenario((prev) => ({ ...prev, [scenario.id]: target.turnId }))
    setSelectedByScenario((prev) => ({ ...prev, [scenario.id]: target.actionId }))
    if (target.groupIds.length > 0) toggleTurnGroups(target.groupIds, true)
  }

  function applyHint(hint: DemoScenario['hints'][number]) {
    if (hint.viewMode) setViewMode(hint.viewMode)
    if (hint.query !== undefined) {
      setSearchOpen(true)
      setQuery(hint.query)
      setMatchesOnly(false)
      const result = searchTimeline(data.turns, hint.query, raw)
      if (result.matches.length > 0) {
        const first = result.matches[0]
        setActiveMatchIndex(0)
        matchJump.current = first.actionId
        setSelectedTurnByScenario((prev) => ({ ...prev, [scenario.id]: first.turnId }))
        setSelectedByScenario((prev) => ({ ...prev, [scenario.id]: first.actionId }))
      }
      return
    }
    if (hint.selectActionId === 'm2') {
      const source = index.actions.get('t1')
      const delivery = source?.deliveries?.[0]
      if (source && delivery) {
        inspectDelivery(source, delivery)
        return
      }
    }
    if (hint.selectActionId) {
      selectAction(hint.selectActionId)
    }
  }

  const showSearchBar = searchOpen || query.trim().length > 0

  return (
    <div className="pf-demo-shell">
      <div className="pf-demo-topbar">
        <div className="pf-demo-scenarios" role="tablist" aria-label="데모 시나리오">
          {DEMO_SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === scenario.id}
              className={`pf-demo-tab ${item.id === scenario.id ? 'is-active' : ''}`}
              onClick={() => switchScenario(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.badge}</span>
            </button>
          ))}
        </div>

        <div className="pf-demo-controls">
          <button
            type="button"
            className="button secondary header-search-btn"
            aria-pressed={showSearchBar}
            onClick={() => {
              if (showSearchBar) {
                setQuery('')
                setMatchesOnly(false)
                setActiveMatchIndex(-1)
                setSearchOpen(false)
              } else {
                focusSearchRef.current = true
                setSearchOpen(true)
              }
            }}
          >
            검색
          </button>
          <div className="header-view-switch" role="group" aria-label="데모 보기 방식">
            {viewLabels.map((item) => (
              <button
                key={item.id}
                type="button"
                className="header-view-option"
                aria-pressed={viewMode === item.id}
                onClick={() => setViewMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pf-demo-hintbar">
        <span className="pf-demo-desc">{scenario.description}</span>
        <div className="pf-demo-hints" aria-label="추천 탐색 동선">
          {scenario.hints.map((hint) => (
            <button key={hint.label} type="button" className="pf-demo-hint-chip" onClick={() => applyHint(hint)}>
              {hint.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`workspace pf-demo-workspace ${selectedAction ? 'has-timeline' : ''}`}>
        <aside className="sources" aria-label="데모 요청 목차">
          <div className="source-nav">
            <div className="source-chat-title">샘플 기록 · {scenario.label}</div>
            <div className="source-heading">
              <h2>모드</h2>
              <span>{scenario.mode === 'trace' ? '상세 실행 기록' : '대화 기록'}</span>
            </div>
          </div>

          <section className="toc-group" aria-label="요청 목차">
            <div className="source-heading">
              <h2>요청</h2>
              <span>{displayedTurns.length}개</span>
            </div>
            <ul className="toc-list">
              {displayedTurns.map((turn, idx) => {
                const current = activeTurn?.id === turn.id
                const matchCount = searchResult.turnMatchCounts.get(turn.id) ?? 0
                return (
                  <li key={turn.id}>
                    <button
                      type="button"
                      className="toc-row"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => selectTurn(turn.id)}
                    >
                      <span className="toc-title">{idx + 1}. {turn.title}</span>
                      {matchCount > 0 && <span className="match-badge">{matchCount}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="source-foot">
            <small className="pf-demo-status">
              {data.status} · {stamp(data.lastAt)}
            </small>
          </div>
        </aside>

        <main className="content" ref={scroller} tabIndex={-1} aria-label="데모 실행 흐름">
          {showSearchBar && (
            <TimelineToolbar
              inputRef={searchInputRef}
              query={query}
              matchesOnly={matchesOnly}
              matchCount={searchResult.matches.length}
              activeMatchIndex={activeMatchIndex}
              turnCount={baseTurns.length}
              visibleTurnCount={displayedTurns.length}
              onQuery={(value) => {
                setQuery(value)
                setActiveMatchIndex(-1)
                if (!value.trim()) setMatchesOnly(false)
              }}
              onPrev={() => moveMatch(-1)}
              onNext={() => moveMatch(1)}
              onMatchesOnly={() => setMatchesOnly((prev) => !prev)}
              onClear={() => {
                setQuery('')
                setMatchesOnly(false)
                setActiveMatchIndex(-1)
              }}
              onClose={() => {
                setQuery('')
                setMatchesOnly(false)
                setActiveMatchIndex(-1)
                setSearchOpen(false)
              }}
            />
          )}

          {data.note && <p className="timeline-note session-note">{data.note}</p>}

          <Timeline
            turn={activeTurn}
            mode={scenario.mode}
            viewMode={viewMode}
            actionsById={index.actions}
            hasTurns={baseTurns.length > 0}
            selected={selected}
            expandedGroups={expandedGroups}
            search={query.trim() ? searchResult : emptySearch}
            activeMatchId={activeMatch?.actionId ?? null}
            matchesOnly={matchesOnly}
            onToggleGroup={toggleGroup}
            onToggleTurnGroups={toggleTurnGroups}
            onSelect={(id) => selectAction(id)}
            onInspectDelivery={inspectDelivery}
            onViewMode={setViewMode}
            turnLink={() => null}
          />
        </main>

        {selectedAction && (
          <Inspector
            token={`demo:${scenario.id}`}
            action={selectedAction}
            previous={adjacent?.previous}
            next={adjacent?.next}
            actions={index.actions}
            raw={raw}
            highlightItemIds={inspectContext.highlightItemIds}
            returnTo={inspectContext.returnTo}
            inspectAction={async (_token, actionId) => scenario.details[actionId] ?? null}
            onReturn={returnFromDelivery}
            onSelect={(id) => selectAction(id)}
            onInspectDelivery={inspectDelivery}
            onClose={() => {
              setInspectContext(emptyInspectContext)
              setSelectedByScenario((prev) => ({ ...prev, [scenario.id]: null }))
            }}
          />
        )}
      </div>
    </div>
  )
}
