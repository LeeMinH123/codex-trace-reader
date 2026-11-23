import { useState } from 'react'
import { formatDuration, type TurnTimelineData } from '../app/turn-timeline'
import type { TimelineSearchResult } from '../app/timeline-search'
import { stamp } from './time'

export function TimeStrip({
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  if (timeline.bars.length === 0) return null

  const hoveredBar = hoveredId ? timeline.bars.find((bar) => bar.action.id === hoveredId) : undefined
  const hasModel = timeline.bars.some((bar) => bar.kind === 'model')
  const hasTool = timeline.bars.some((bar) => bar.kind === 'tool')
  const hasMessage = timeline.bars.some((bar) => bar.kind === 'message')
  const hasSpan = timeline.startMs !== null && timeline.endMs !== null && timeline.endMs > timeline.startMs

  const summaryText = hoveredBar
    ? [
        stamp(hoveredBar.action.time, true),
        hoveredBar.label,
        formatDuration(hoveredBar.durationMs),
      ].filter(Boolean).join(' · ')
    : hasSpan
      ? `시간 분포 · 총 ${formatDuration(timeline.totalMs)}`
      : `시간 분포 · ${timeline.bars.length}개 항목`

  return (
    <div className="time-strip" aria-label="시간 분포 미니맵">
      <div className="time-strip-head">
        <span className="time-strip-summary">{summaryText}</span>
        <span className="time-strip-legend">
          {hasModel && <span className="legend-item"><i className="legend-swatch model" aria-hidden="true" />모델</span>}
          {hasTool && <span className="legend-item"><i className="legend-swatch tool" aria-hidden="true" />실행</span>}
          {hasMessage && <span className="legend-item"><i className="legend-swatch message" aria-hidden="true" />메시지</span>}
        </span>
      </div>
      <svg className="time-strip-svg" viewBox="0 0 1000 32" preserveAspectRatio="none" role="img" aria-label="실행 시간 분포">
        <line x1="0" y1="16" x2="1000" y2="16" stroke="#e3e6ec" strokeWidth="1" />
        {timeline.bars.map((bar) => {
          const isSelected = selected === bar.action.id
          const isActiveMatch = activeMatchId === bar.action.id
          const isMatch = search.matchedActions.has(bar.action.id)
          const x = Math.min(994, Math.max(0, bar.startPct * 10))
          const w = bar.isPoint ? 6 : Math.max(6, bar.widthPct * 10)
          if (bar.kind === 'message') {
            const cx = Math.min(995, Math.max(5, x))
            const fill = isSelected ? '#294fd1' : isActiveMatch || isMatch ? '#b88412' : '#171a21'
            return (
              <polygon
                key={bar.action.id}
                points={`${cx},10 ${cx + 5},16 ${cx},22 ${cx - 5},16`}
                fill={fill}
                className="time-strip-mark"
                tabIndex={0}
                role="button"
                aria-label={`${stamp(bar.action.time, true)} · ${bar.label}`}
                onMouseEnter={() => setHoveredId(bar.action.id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === bar.action.id ? null : prev))}
                onFocus={() => setHoveredId(bar.action.id)}
                onBlur={() => setHoveredId((prev) => (prev === bar.action.id ? null : prev))}
                onClick={() => onSelect(bar.action.id, { keepReading: true })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(bar.action.id, { keepReading: true })
                  }
                }}
              />
            )
          }
          const y = bar.kind === 'model' ? 3 : 16
          const height = bar.kind === 'model' ? 9 : 11
          const fill = isSelected
            ? '#294fd1'
            : isActiveMatch
              ? '#b88412'
              : isMatch
                ? '#e3b341'
                : bar.kind === 'model'
                  ? '#b8c8f2'
                  : '#596273'
          return (
            <rect
              key={bar.action.id}
              x={x}
              y={y}
              width={Math.min(1000 - x, w)}
              height={height}
              rx="2"
              fill={fill}
              className="time-strip-mark"
              tabIndex={0}
              role="button"
              aria-label={`${stamp(bar.action.time, true)} · ${bar.label}`}
              onMouseEnter={() => setHoveredId(bar.action.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === bar.action.id ? null : prev))}
              onFocus={() => setHoveredId(bar.action.id)}
              onBlur={() => setHoveredId((prev) => (prev === bar.action.id ? null : prev))}
              onClick={() => onSelect(bar.action.id, { keepReading: true })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(bar.action.id, { keepReading: true })
                }
              }}
            />
          )
        })}
      </svg>
    </div>
  )
}
