import { useState } from 'react'
import type { TimelineSearchResult } from '../app/timeline-search'
import { formatDuration, type TurnTimelineData } from '../app/turn-timeline'
import { stamp } from './time'

export function WaterfallView({
  timeline,
  selected,
  search,
  activeMatchId,
  onSelect,
}: {
  timeline: TurnTimelineData
  selected: string | null
  search: TimelineSearchResult
  activeMatchId: string | null
  onSelect(id: string, options?: { keepReading?: boolean }): void
}) {
  const [absoluteTime, setAbsoluteTime] = useState(false)

  if (timeline.bars.length === 0) {
    return <p className="reading-empty">시간축에 표시할 실행 항목이 없습니다.</p>
  }

  return (
    <div className="waterfall">
      <div className="wf-header">
        <div className="wf-header-label">
          <span>실행</span>
          <button
            type="button"
            className="quiet wf-time-toggle"
            onClick={() => setAbsoluteTime(!absoluteTime)}
          >
            {absoluteTime ? '절대 시각' : '상대 시간'}
          </button>
        </div>
        <div className="wf-axis">
          {timeline.ticks.map((tick) => {
            const label = absoluteTime
              ? stamp(tick.timeMs, true)
              : tick.pct === 0
                ? '+0s'
                : `+${formatDuration(tick.offsetMs)}`
            const alignClass = tick.pct === 0 ? 'is-start' : tick.pct === 100 ? 'is-end' : ''
            return (
              <span key={tick.pct} className={`wf-tick ${alignClass}`} style={{ left: `${tick.pct}%` }}>
                {label}
              </span>
            )
          })}
        </div>
        <div className="wf-header-dur">소요</div>
      </div>

      <ul className="wf-list">
        {timeline.bars.map((bar) => {
          const isSelected = selected === bar.action.id
          const isMatch = search.matchedActions.has(bar.action.id)
          const isActiveMatch = activeMatchId === bar.action.id
          if (bar.kind === 'message') {
            const text = bar.action.reading?.text ?? bar.label
            const offsetMs = timeline.startMs !== null && bar.action.time !== null
              ? Math.max(0, bar.action.time - timeline.startMs)
              : null
            const timeLabel = absoluteTime
              ? (bar.action.time !== null ? stamp(bar.action.time, true) : '')
              : offsetMs === null
                ? ''
                : offsetMs === 0
                  ? '+0s'
                  : `+${formatDuration(offsetMs)}`
            const milestoneClasses = [
              'wf-milestone-row',
              isSelected && 'is-selected',
              isMatch && 'is-match',
              isActiveMatch && 'is-active-match',
            ].filter(Boolean).join(' ')
            return (
              <li key={bar.action.id} className="wf-milestone-li">
                <button
                  type="button"
                  className={milestoneClasses}
                  data-action={bar.action.id}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(bar.action.id, { keepReading: true })}
                >
                  <i className="wf-dot message" aria-hidden="true" />
                  <span className="wf-milestone-text">{text}</span>
                  {timeLabel && <span className="wf-milestone-time">{timeLabel}</span>}
                </button>
              </li>
            )
          }

          const classes = [
            'wf-row',
            isSelected && 'is-selected',
            isMatch && 'is-match',
            isActiveMatch && 'is-active-match',
          ].filter(Boolean).join(' ')
          const durationLabel = formatDuration(bar.durationMs)
          return (
            <li key={bar.action.id}>
              <button
                type="button"
                className={classes}
                data-action={bar.action.id}
                aria-pressed={isSelected}
                onClick={() => onSelect(bar.action.id, { keepReading: true })}
              >
                <span className="wf-label" style={{ paddingLeft: `${8 + bar.depth * 14}px` }} title={bar.label}>
                  <i className={`wf-dot ${bar.kind}`} aria-hidden="true" />
                  <span className="wf-label-text">{bar.label}</span>
                </span>
                <span className="wf-track" aria-hidden="true">
                  {timeline.ticks.map((tick) => (
                    <span key={tick.pct} className="wf-grid" style={{ left: `${tick.pct}%` }} />
                  ))}
                  {bar.isPoint ? (
                    <span className={`wf-point ${bar.kind}`} style={{ left: `${bar.startPct}%` }} />
                  ) : (
                    <span
                      className={`wf-bar ${bar.kind}`}
                      style={{ left: `${bar.startPct}%`, width: `${bar.widthPct}%` }}
                    />
                  )}
                </span>
                <span className="wf-dur">
                  {bar.hasDelivery && <span className="wf-delivery-mark" title="다음 모델 입력에 포함">→</span>}
                  <span>{durationLabel || '·'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
