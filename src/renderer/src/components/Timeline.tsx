import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import type { Action, DeliveryLink, Turn } from '../../../shared/reader'
import { highlightSegments, type TimelineSearchResult } from '../app/timeline-search'
import { buildTurnGraph } from '../app/turn-graph'
import { buildTurnTimeline } from '../app/turn-timeline'
import { FlowGraph } from './FlowGraph'
import { StoryView } from './StoryView'
import { TimeStrip } from './TimeStrip'
import { WaterfallView } from './WaterfallView'
import { stamp } from './time'
import '../styles/reading-flow.css'

export type TimelineViewMode = 'story' | 'graph' | 'waterfall' | 'raw'

function HighlightedText({ text, words }: { text: string; words: string[] }) {
  if (!text || words.length === 0) return <>{text}</>
  const segments = highlightSegments(text, words)
  return (
    <>
      {segments.map((segment, index) => (
        segment.match ? <mark className="search-hit" key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>
      ))}
    </>
  )
}

export function Timeline({
  turn,
  mode,
  viewMode,
  actionsById,
  hasTurns,
  selected,
  expandedGroups,
  search,
  activeMatchId,
  matchesOnly,
  onToggleGroup,
  onToggleTurnGroups,
  onSelect,
  onInspectDelivery,
  onViewMode,
  turnLink,
}: {
  turn?: Turn
  mode: 'session' | 'trace'
  viewMode: TimelineViewMode
  actionsById: Map<string, Action>
  hasTurns: boolean
  selected: string | null
  expandedGroups: Set<string>
  search: TimelineSearchResult
  activeMatchId: string | null
  matchesOnly: boolean
  onToggleGroup(id: string): void
  onToggleTurnGroups(ids: string[], open: boolean): void
  onSelect(id: string, options?: { keepReading?: boolean }): void
  onInspectDelivery(fromAction: Action, delivery: DeliveryLink): void
  onViewMode(viewMode: TimelineViewMode): void
  turnLink(turnId: string): ReactNode
}) {
  const raw = viewMode === 'raw'

  const graphForSync = useMemo(
    () => (turn && viewMode === 'graph' ? buildTurnGraph(turn, expandedGroups) : null),
    [turn, viewMode, expandedGroups],
  )
  const timelineData = useMemo(
    () => (turn && (viewMode === 'graph' || viewMode === 'waterfall') ? buildTurnTimeline(turn) : null),
    [turn, viewMode],
  )

  useLayoutEffect(() => {
    if (!turn || viewMode !== 'graph' || !graphForSync) return
    const targetIds = [activeMatchId, selected].filter((id): id is string => Boolean(id))
    if (targetIds.length === 0) return
    const toOpen: string[] = []
    for (const stage of graphForSync.stages) {
      for (const node of stage.nodes) {
        if (node.groupId && !node.expanded) {
          const insideRun = node.actions?.some((action) => targetIds.includes(action.id))
          const insideNested = node.nestedChildren?.some((action) => targetIds.includes(action.id))
          if (insideRun || insideNested) toOpen.push(node.groupId)
        }
      }
    }
    if (toOpen.length > 0) onToggleTurnGroups(toOpen, true)
  }, [activeMatchId, selected, turn, viewMode, graphForSync, onToggleTurnGroups])

  if (!hasTurns) {
    return <p className="timeline-note">이 보기에서 표시할 내용이 없습니다. 원본 기록을 열어 확인할 수 있습니다.</p>
  }
  if (!turn) {
    return <p className="timeline-note">검색어와 일치하는 요청이 없습니다. 일치만 보기를 끄면 전체 흐름을 볼 수 있습니다.</p>
  }

  const filtering = matchesOnly && search.words.length > 0

  if (viewMode === 'story') {
    return (
      <StoryView
        turn={turn}
        mode={mode}
        actionsById={actionsById}
        selected={selected}
        expandedGroups={expandedGroups}
        search={search}
        activeMatchId={activeMatchId}
        matchesOnly={matchesOnly}
        onToggleGroup={onToggleGroup}
        onToggleTurnGroups={onToggleTurnGroups}
        onSelect={onSelect}
        onInspectDelivery={onInspectDelivery}
        turnLink={turnLink}
      />
    )
  }

  if (raw) {
    const rawActions = filtering ? turn.actions.filter((action) => search.matchedActions.has(action.id)) : turn.actions
    return (
      <div className="turn-focus" data-turn={turn.id}>
        <div className="turn-focus-head">
          <h2><HighlightedText text={turn.title} words={search.words} /></h2>
          <small>
            {stamp(turn.time, true)} · {turn.actor} · {turn.actions.length.toLocaleString('ko-KR')}개 기록
            {turn.status && ` · ${turn.status}`}
          </small>
          {turn.threadTurnId && turnLink(turn.threadTurnId)}
        </div>
        {rawActions.length > 0 ? (
          <ol className="action-list">
            {rawActions.map((action) => {
              const match = search.matchedActions.get(action.id)
              const active = activeMatchId === action.id
              const classes = ['action-row', match && 'is-match', active && 'is-active-match'].filter(Boolean).join(' ')
              return (
                <li key={action.id}>
                  <button type="button" className={classes} data-action={action.id}
                    aria-pressed={selected === action.id} onClick={() => onSelect(action.id)}>
                    <span className={`action-mark ${action.kind}`} aria-hidden="true" />
                    <span className="action-copy">
                      <span className="action-label"><HighlightedText text={action.label} words={search.words} /></span>
                      {action.summary && <span className="action-summary"><HighlightedText text={action.summary} words={search.words} /></span>}
                      <ActionMeta action={action} words={search.words} />
                      {match?.hiddenHint && (
                        <small className="match-hint">
                          일치 단서: <HighlightedText text={match.hiddenHint} words={search.words} />
                        </small>
                      )}
                    </span>
                    <span className="row-time">{stamp(action.time, true)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="timeline-note">이 요청에서 일치하는 기록이 없습니다.</p>
        )}
      </div>
    )
  }

  const graphGroupIds = (graphForSync?.stages ?? []).flatMap((stage) =>
    stage.nodes.flatMap((node) => (node.groupId ? [node.groupId] : [])),
  )
  const allGroupsOpen = graphGroupIds.length > 0 && graphGroupIds.every((id) => expandedGroups.has(id))

  return (
    <div className="turn-focus" data-turn={turn.id}>
      <div className="turn-focus-head">
        <div className="turn-focus-head-row">
          <h2><HighlightedText text={turn.title} words={search.words} /></h2>
          {viewMode === 'graph' && graphGroupIds.length > 0 && (
            <button type="button" className="quiet" onClick={() => onToggleTurnGroups(graphGroupIds, !allGroupsOpen)}>
              {allGroupsOpen ? '묶음 접기' : '묶음 펼치기'}
            </button>
          )}
        </div>
        <small>
          {stamp(turn.time, true)}
          {turn.status && ` · ${turn.status}`}
        </small>
        {turn.threadTurnId && turnLink(turn.threadTurnId)}
      </div>

      {timelineData && timelineData.bars.length > 0 && (
        <TimeStrip
          timeline={timelineData}
          selected={selected}
          search={search}
          activeMatchId={activeMatchId}
          onSelect={onSelect}
        />
      )}

      {viewMode === 'graph' && (
        <FlowGraph
          turn={turn}
          selected={selected}
          expandedGroups={expandedGroups}
          search={search}
          activeMatchId={activeMatchId}
          onToggleGroup={onToggleGroup}
          onSelect={onSelect}
          onJumpTab={() => onViewMode('story')}
        />
      )}

      {viewMode === 'waterfall' && timelineData && (
        <WaterfallView
          timeline={timelineData}
          selected={selected}
          search={search}
          activeMatchId={activeMatchId}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

export function ActionMeta({ action, words = [] }: { action: Action; words?: string[] }) {
  return (
    <small className="action-meta">
      <HighlightedText text={action.actor} words={words} />
      {action.status && (
        <>
          {' · '}
          <HighlightedText text={action.status} words={words} />
        </>
      )}
    </small>
  )
}
