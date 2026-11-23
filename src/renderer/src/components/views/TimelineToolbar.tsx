import type { RefObject } from 'react'

export function TimelineToolbar({
  inputRef,
  query,
  matchesOnly,
  matchCount,
  activeMatchIndex,
  turnCount,
  visibleTurnCount,
  onQuery,
  onPrev,
  onNext,
  onMatchesOnly,
  onClear,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  matchesOnly: boolean
  matchCount: number
  activeMatchIndex: number
  turnCount: number
  visibleTurnCount: number
  onQuery(query: string): void
  onPrev(): void
  onNext(): void
  onMatchesOnly(): void
  onClear(): void
  onClose(): void
}) {
  const hasQuery = query.trim().length > 0
  const countText = matchCount === 0
    ? '일치 없음'
    : activeMatchIndex >= 0
      ? `${activeMatchIndex + 1} / ${matchCount}`
      : `일치 ${matchCount}개`

  return (
    <div className="timeline-toolbar" role="search" aria-label="기록 검색">
      <div className="timeline-search">
        <span className="search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          aria-label="이 기록에서 검색"
          placeholder="명령어, 파일명, 메시지 검색 (Enter로 이동)"
          value={query}
          spellCheck={false}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.shiftKey) onPrev()
              else onNext()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              if (query) onClear()
              else onClose()
            }
          }}
        />
        {query && (
          <button type="button" className="quiet timeline-clear" aria-label="검색어 지우기" onClick={onClear}>
            지우기
          </button>
        )}
      </div>
      {hasQuery && (
        <div className="timeline-search-controls">
          <span className="search-count" aria-live="polite">{countText}</span>
          <button type="button" className="quiet" disabled={matchCount === 0} aria-label="이전 검색 결과" onClick={onPrev}>
            이전
          </button>
          <button type="button" className="quiet" disabled={matchCount === 0} aria-label="다음 검색 결과" onClick={onNext}>
            다음
          </button>
          <button type="button" className="button secondary timeline-filter-toggle" aria-pressed={matchesOnly} onClick={onMatchesOnly}>
            일치만 보기
          </button>
        </div>
      )}
      <div className="timeline-turn-controls">
        {matchesOnly && hasQuery && (
          <span className="turn-count">일치 요청 {visibleTurnCount} / {turnCount}개</span>
        )}
        <button type="button" className="quiet" aria-label="검색 닫기" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
