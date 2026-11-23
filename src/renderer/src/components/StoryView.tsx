import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Action, DeliveryLink, Turn } from '../../../shared/reader'
import { buildTurnStory, type StoryChapter } from '../app/story-chapters'
import { highlightSegments, type TimelineSearchResult } from '../app/timeline-search'
import { stamp } from './time'

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

type ChapterStepItem =
  | { kind: 'single'; action: Action }
  | { kind: 'run'; key: string; title: string; outcome?: string; actions: Action[] }

function isFoldableSingleStep(action: Action, chapter: StoryChapter) {
  if ((chapter.nestedByParent.get(action.id)?.length ?? 0) > 0) return false
  if (action.reading?.target?.text) return false
  if ((action.deliveries?.length ?? 0) > 0) return false
  return true
}

function groupChapterSteps(actions: Action[], chapter: StoryChapter): ChapterStepItem[] {
  const items: ChapterStepItem[] = []
  let buffer: Action[] = []

  const flush = () => {
    if (buffer.length === 0) return
    if (buffer.length === 1) {
      items.push({ kind: 'single', action: buffer[0] })
    } else {
      const first = buffer[0]
      items.push({
        kind: 'run',
        key: `${chapter.id}:run:${first.id}`,
        title: first.reading?.title ?? first.label,
        outcome: first.reading?.outcome,
        actions: buffer,
      })
    }
    buffer = []
  }

  for (const action of actions) {
    if (!isFoldableSingleStep(action, chapter)) {
      flush()
      items.push({ kind: 'single', action })
      continue
    }
    if (buffer.length === 0) {
      buffer.push(action)
      continue
    }
    const prev = buffer[0]
    const sameTitle = (action.reading?.title ?? action.label) === (prev.reading?.title ?? prev.label)
    const sameOutcome = (action.reading?.outcome ?? '') === (prev.reading?.outcome ?? '')
    if (sameTitle && sameOutcome) {
      buffer.push(action)
    } else {
      flush()
      buffer.push(action)
    }
  }
  flush()
  return items
}

export function StoryView({
  turn,
  mode,
  actionsById,
  selected,
  expandedGroups,
  search,
  activeMatchId,
  matchesOnly,
  onToggleGroup,
  onToggleTurnGroups,
  onSelect,
  onInspectDelivery,
  turnLink,
}: {
  turn: Turn
  mode: 'session' | 'trace'
  actionsById: Map<string, Action>
  selected: string | null
  expandedGroups: Set<string>
  search: TimelineSearchResult
  activeMatchId: string | null
  matchesOnly: boolean
  onToggleGroup(id: string): void
  onToggleTurnGroups(ids: string[], open: boolean): void
  onSelect(id: string, options?: { keepReading?: boolean }): void
  onInspectDelivery(fromAction: Action, delivery: DeliveryLink): void
  turnLink(turnId: string): ReactNode
}) {
  const [requestExpanded, setRequestExpanded] = useState(false)
  const [answerExpanded, setAnswerExpanded] = useState(false)
  const [expandedStepRuns, setExpandedStepRuns] = useState<Set<string>>(() => new Set())
  const lastTargetRef = useRef('')

  useEffect(() => {
    setRequestExpanded(false)
    setAnswerExpanded(false)
    setExpandedStepRuns(new Set())
  }, [turn.id])

  const story = useMemo(() => buildTurnStory(turn, actionsById), [turn, actionsById])

  useLayoutEffect(() => {
    const key = `${turn.id}:${activeMatchId ?? ''}:${selected ?? ''}`
    if (key === lastTargetRef.current) return
    lastTargetRef.current = key

    const targetIds = [activeMatchId, selected].filter((id): id is string => Boolean(id))
    if (targetIds.length === 0) return

    if (activeMatchId && story.requests.some((action) => action.id === activeMatchId)) {
      setRequestExpanded(true)
    }
    if (activeMatchId && story.answers.some((action) => action.id === activeMatchId)) {
      setAnswerExpanded(true)
    }

    const chaptersToOpen: string[] = []
    const runsToOpen: string[] = []
    for (const chapter of story.chapters) {
      const hasTarget = chapter.actions.some((action) => {
        if (targetIds.includes(action.id)) return true
        const nested = chapter.nestedByParent.get(action.id) ?? []
        return nested.some((child) => targetIds.includes(child.id))
      })
      if (hasTarget) {
        chaptersToOpen.push(chapter.id)
        for (const item of groupChapterSteps(chapter.actions, chapter)) {
          if (item.kind === 'run' && item.actions.some((child) => targetIds.includes(child.id))) {
            runsToOpen.push(item.key)
          }
        }
      }
    }
    if (chaptersToOpen.length > 0) {
      onToggleTurnGroups(chaptersToOpen, true)
    }
    if (runsToOpen.length > 0) {
      setExpandedStepRuns((prev) => {
        const next = new Set(prev)
        for (const runKey of runsToOpen) next.add(runKey)
        return next
      })
    }
  }, [turn.id, activeMatchId, selected, story, onToggleTurnGroups])

  const filtering = matchesOnly && search.words.length > 0

  const chapterMatches = (chapter: StoryChapter) => {
    if (chapter.headingAction && search.matchedActions.has(chapter.headingAction.id)) return true
    return chapter.actions.some((action) => {
      if (search.matchedActions.has(action.id)) return true
      return (chapter.nestedByParent.get(action.id) ?? []).some((child) => search.matchedActions.has(child.id))
    })
  }

  const visibleRequests = filtering
    ? story.requests.filter((action) => search.matchedActions.has(action.id))
    : story.requests
  const visibleChapters = filtering
    ? story.chapters.filter(chapterMatches)
    : story.chapters
  const visibleAnswers = filtering
    ? story.answers.filter((action) => search.matchedActions.has(action.id))
    : story.answers

  const renderStepRow = (action: Action) => {
    const title = action.reading?.title ?? action.label
    const target = action.reading?.target?.text
    const outcome = action.reading?.outcome
    const match = search.matchedActions.get(action.id)
    const active = activeMatchId === action.id
    const isSelected = selected === action.id
    const classes = ['story-step-btn', match && 'is-match', active && 'is-active-match'].filter(Boolean).join(' ')
    return (
      <div className="story-step-line">
        <button
          type="button"
          className={classes}
          data-action={action.id}
          aria-pressed={isSelected}
          onClick={() => onSelect(action.id)}
        >
          <span className="story-step-main">
            <strong><HighlightedText text={title} words={search.words} /></strong>
            {target && (
              <span className="story-step-target">
                <HighlightedText text={target} words={search.words} />
              </span>
            )}
          </span>
          {outcome && <small className="story-step-outcome"><HighlightedText text={outcome} words={search.words} /></small>}
          {match?.hiddenHint && (
            <small className="match-hint">
              일치 단서: <HighlightedText text={match.hiddenHint} words={search.words} />
            </small>
          )}
        </button>
        {action.deliveries && action.deliveries.length > 0 && (
          <span className="step-delivery-pills">
            {action.deliveries.map((delivery, idx) => (
              <button
                type="button"
                key={`${delivery.targetId}:${idx}`}
                className="step-delivery-pill"
                title={`${stamp(delivery.targetTime, true)} ${delivery.targetLabel} 입력 보기`}
                onClick={() => onInspectDelivery(action, delivery)}
              >
                → 모델{action.deliveries!.length > 1 ? ` ${idx + 1}` : ''}
              </button>
            ))}
          </span>
        )}
      </div>
    )
  }

  return (
    <article className="story" data-turn={turn.id}>
      <header className="story-header">
        <div className="story-meta-line">
          <span>{mode === 'session' ? '대화 기록' : '상세 실행 기록'}</span>
          <span>·</span>
          <span>{stamp(turn.time, true)}</span>
          {turn.status && (
            <>
              <span>·</span>
              <span>{turn.status}</span>
            </>
          )}
          {turn.threadTurnId && turnLink(turn.threadTurnId)}
        </div>

        <h1>
          <HighlightedText text={turn.title} words={search.words} />
        </h1>

        {visibleRequests.map((action, index) => {
          const fullText = action.reading?.text ?? action.summary
          const redundantSingle = !filtering && story.requests.length === 1 && fullText.trim() === turn.title.trim()
          if (redundantSingle) return null
          const isLong = fullText.length > 320
          const shown = isLong && !requestExpanded ? fullText.slice(0, 280).trimEnd() + '…' : fullText
          const match = search.matchedActions.get(action.id)
          const active = activeMatchId === action.id
          const classes = ['story-request-btn', match && 'is-match', active && 'is-active-match'].filter(Boolean).join(' ')
          return (
            <div className="story-request" key={action.id}>
              <button
                type="button"
                className={classes}
                data-action={action.id}
                aria-pressed={selected === action.id}
                onClick={() => onSelect(action.id)}
              >
                <HighlightedText text={shown} words={search.words} />
              </button>
              {isLong && index === 0 && (
                <button type="button" className="story-text-toggle" onClick={() => setRequestExpanded(!requestExpanded)}>
                  {requestExpanded ? '요청 접기' : '요청 전체 보기'}
                </button>
              )}
            </div>
          )
        })}

        {!filtering && story.instructions.length > 0 && (() => {
          const guides = story.instructions.filter((inst) => inst.label !== '설정 기록')
          const settings = story.instructions.filter((inst) => inst.label === '설정 기록')
          const summaryParts: string[] = []
          if (guides.length > 0) summaryParts.push(`함께 들어간 지침 ${guides.length}개`)
          if (settings.length > 0) summaryParts.push(`환경 설정 ${settings.length}개`)
          const renderInstructionList = (items: Action[], groupTitle?: string) => (
            <div className="story-instruction-group">
              {groupTitle && <div className="story-instruction-group-title">{groupTitle}</div>}
              <ul>
                {items.map((inst) => (
                  <li key={inst.id}>
                    <button
                      type="button"
                      className="story-instruction-btn"
                      data-action={inst.id}
                      aria-pressed={selected === inst.id}
                      onClick={() => onSelect(inst.id, { keepReading: true })}
                    >
                      <strong>{inst.label}</strong>
                      {inst.summary && <span>{inst.summary}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
          return (
            <details className="story-instructions">
              <summary>{summaryParts.join(' · ')}</summary>
              <div className="story-instruction-groups">
                {guides.length > 0 && renderInstructionList(guides, settings.length > 0 ? '지침' : undefined)}
                {settings.length > 0 && renderInstructionList(settings, guides.length > 0 ? '환경 설정' : undefined)}
              </div>
            </details>
          )
        })()}
      </header>

      {(!filtering || visibleChapters.length > 0) && (
        <section className="story-work" aria-label="진행 과정">
          {visibleChapters.length === 0 ? (
            <p className="story-empty">기록된 중간 실행이 없습니다.</p>
          ) : (
            <ol className="story-chapters">
              {visibleChapters.map((chapter) => {
                const open = expandedGroups.has(chapter.id)
                const chapterItems = chapter.actions.flatMap((action) => [
                  action,
                  ...(chapter.nestedByParent.get(action.id) ?? []),
                ])
                const chapterMatchCount = chapterItems.filter((action) => search.matchedActions.has(action.id)).length
                const visibleChapterActions = filtering
                  ? chapter.actions.filter((action) => {
                    if (search.matchedActions.has(action.id)) return true
                    return (chapter.nestedByParent.get(action.id) ?? []).some((child) => search.matchedActions.has(child.id))
                  })
                  : chapter.actions

                const stepItems: ChapterStepItem[] = filtering
                  ? visibleChapterActions.map((action) => ({ kind: 'single', action }))
                  : groupChapterSteps(visibleChapterActions, chapter)

                const headingMatch = chapter.headingAction && search.matchedActions.has(chapter.headingAction.id)
                const headingActive = chapter.headingAction && activeMatchId === chapter.headingAction.id
                const headingClasses = [
                  'story-chapter-heading-btn',
                  headingMatch && 'is-match',
                  headingActive && 'is-active-match',
                ].filter(Boolean).join(' ')

                return (
                  <li key={chapter.id} className="story-chapter">
                    <span className="story-dot" aria-hidden="true">{chapter.index}</span>
                    <div className="story-chapter-body">
                      {chapter.headingAction ? (
                        <button
                          type="button"
                          className={headingClasses}
                          data-action={chapter.headingAction.id}
                          aria-pressed={selected === chapter.headingAction.id}
                          title={chapter.fullMessage ? '클릭해서 전체 안내 메시지 보기' : undefined}
                          onClick={() => onSelect(chapter.headingAction!.id)}
                        >
                          <HighlightedText text={chapter.heading} words={search.words} />
                        </button>
                      ) : (
                        <h2 className="story-chapter-title">{chapter.heading}</h2>
                      )}

                      {chapter.totalActionCount >= 2 && chapter.visualTags.length > 0 && (
                        <div className="story-phase-visual">
                          <div className="story-phase-bar" aria-hidden="true">
                            {chapter.visualTags.map((tag) => (
                              <span
                                key={tag.phase}
                                className={`story-phase-seg is-${tag.phase}`}
                                style={{ flexGrow: tag.count }}
                                title={`${tag.label} ${tag.count}개`}
                              />
                            ))}
                          </div>
                          <div className="story-phase-chips">
                            {chapter.visualTags.map((tag) => (
                              <span key={tag.phase} className={`story-phase-chip is-${tag.phase}`}>
                                {tag.label} {tag.count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {(chapter.summary || chapter.totalActionCount > 0) && (
                        <div className="story-chapter-meta">
                          {chapter.summary && <span className="story-chapter-summary">{chapter.summary}</span>}
                          {chapter.totalActionCount > 0 && (
                            <button
                              type="button"
                              className="story-expand-btn"
                              aria-expanded={open}
                              onClick={() => onToggleGroup(chapter.id)}
                            >
                              <span>세부 {chapter.totalActionCount}개 {open ? '▾' : '▸'}</span>
                              {chapterMatchCount > 0 && <span className="match-badge">일치 {chapterMatchCount}</span>}
                            </button>
                          )}
                        </div>
                      )}

                      {open && stepItems.length > 0 && (
                        <ul className="story-chapter-items">
                          {stepItems.map((item) => {
                            if (item.kind === 'run') {
                              const runOpen = expandedStepRuns.has(item.key)
                              const runMatchCount = item.actions.filter((child) => search.matchedActions.has(child.id)).length
                              const runSelected = item.actions.some((child) => child.id === selected)
                              return (
                                <li key={item.key} className="story-chapter-item story-run-group">
                                  <button
                                    type="button"
                                    className={['story-run-toggle', runSelected && 'is-selected'].filter(Boolean).join(' ')}
                                    aria-expanded={runOpen}
                                    onClick={() => setExpandedStepRuns((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(item.key)) next.delete(item.key)
                                      else next.add(item.key)
                                      return next
                                    })}
                                  >
                                    <span className="story-step-main">
                                      <strong>{runOpen ? '▾' : '▸'} {item.title} ×{item.actions.length}</strong>
                                    </span>
                                    <span className="story-run-meta">
                                      {runMatchCount > 0 && <span className="match-badge">일치 {runMatchCount}</span>}
                                      {item.outcome && <small className="story-step-outcome">{item.outcome}</small>}
                                    </span>
                                  </button>
                                  {runOpen && (
                                    <ul className="story-nested-items">
                                      {item.actions.map((child) => (
                                        <li key={child.id}>{renderStepRow(child)}</li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              )
                            }

                            const { action } = item
                            const nested = chapter.nestedByParent.get(action.id) ?? []
                            const visibleNested = filtering
                              ? nested.filter((child) => search.matchedActions.has(child.id))
                              : nested
                            return (
                              <li key={action.id} className="story-chapter-item">
                                {renderStepRow(action)}
                                {visibleNested.length > 0 && (
                                  <ul className="story-nested-items">
                                    {visibleNested.map((child) => (
                                      <li key={child.id}>{renderStepRow(child)}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}

      {(!filtering || visibleAnswers.length > 0) && (
        <section className="story-answer" aria-label="답변">
          <h2 className="story-section-label">답변</h2>
          {visibleAnswers.length === 0 ? (
            story.modifiedFiles.length === 0 && story.verifications.length === 0 && (
              <p className="story-empty">기록된 최종 답변이 없습니다.</p>
            )
          ) : (
            <div className="story-answer-list">
              {visibleAnswers.map((action, index) => {
                const fullText = action.reading?.text ?? action.summary
                const isLong = fullText.length > 560
                const shown = isLong && !answerExpanded ? fullText.slice(0, 480).trimEnd() + '…' : fullText
                const match = search.matchedActions.get(action.id)
                const active = activeMatchId === action.id
                const classes = ['story-answer-btn', match && 'is-match', active && 'is-active-match'].filter(Boolean).join(' ')
                return (
                  <div key={action.id} className="story-answer-item">
                    <button
                      type="button"
                      className={classes}
                      data-action={action.id}
                      aria-pressed={selected === action.id}
                      onClick={() => onSelect(action.id)}
                    >
                      <HighlightedText text={shown} words={search.words} />
                    </button>
                    {isLong && index === 0 && (
                      <button type="button" className="story-text-toggle" onClick={() => setAnswerExpanded(!answerExpanded)}>
                        {answerExpanded ? '답변 접기' : '답변 전체 보기'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!filtering && (story.modifiedFiles.length > 0 || story.verifications.length > 0) && (
            <dl className="story-facts">
              {story.modifiedFiles.length > 0 && (
                <div>
                  <dt>수정한 파일</dt>
                  <dd>
                    {story.modifiedFiles.map((item) => (
                      <button
                        type="button"
                        key={`${item.file}:${item.actionId}`}
                        className="story-fact-link"
                        onClick={() => onSelect(item.actionId)}
                      >
                        {item.file}
                      </button>
                    ))}
                  </dd>
                </div>
              )}
              {story.verifications.length > 0 && (
                <div>
                  <dt>확인한 테스트</dt>
                  <dd>
                    {story.verifications.map((item) => (
                      <button
                        type="button"
                        key={item.actionId}
                        className="story-fact-link"
                        onClick={() => onSelect(item.actionId)}
                      >
                        {item.outcome ? `${item.label} (${item.outcome})` : item.label}
                      </button>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>
      )}
    </article>
  )
}
