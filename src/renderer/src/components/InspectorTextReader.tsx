import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { documentBlocks, readerMatches, type ReaderBlock } from '../model/reader-text'

export interface InspectorDocument {
  title: string
  text: string
  format: 'document' | 'literal'
}

export function InspectorTextReader({ document, onBack }: { document: InspectorDocument; onBack(): void }) {
  const [literal, setLiteral] = useState(document.format === 'literal')
  const [outlineOpen, setOutlineOpen] = useState(() => window.innerWidth >= 940)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLElement>(null)
  const blocks = useMemo<ReaderBlock[]>(() => literal
    ? [{ kind: 'code', text: document.text }] : documentBlocks(document.text), [document.text, literal])
  const outline = blocks.flatMap((block, index) => block.kind === 'heading' ? [{ ...block, index }] : [])
  const matches = useMemo(() => readerMatches(blocks, query), [blocks, query])
  const activeMatch = matches[matchIndex]

  useLayoutEffect(() => titleRef.current?.focus(), [])
  useLayoutEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [activeMatch])

  function moveMatch(delta: number) {
    if (matches.length) setMatchIndex((index) => (index + delta + matches.length) % matches.length)
  }

  return (
    <section className="inspector-text-reader" aria-label="본문 읽기" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onBack()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }}>
      <header className="text-reader-header">
        <div className="text-reader-title-row">
          <h3 ref={titleRef} tabIndex={-1} title={document.title}>{document.title}</h3>
          <button type="button" className="quiet" onClick={onBack}>상세로 돌아가기</button>
        </div>
        <div className="text-reader-toolbar">
          {document.format === 'document' && (
            <button type="button" className="button secondary" aria-pressed={literal} onClick={() => {
              setLiteral(!literal)
              setMatchIndex(0)
              if (bodyRef.current) bodyRef.current.scrollTop = 0
            }}>원문으로 읽기</button>
          )}
          {outline.length > 0 && (
            <button type="button" className="button secondary" aria-expanded={outlineOpen}
              onClick={() => setOutlineOpen(!outlineOpen)}>목차</button>
          )}
          <div className="text-reader-search" role="search" aria-label="본문 검색">
            <input ref={searchRef} type="search" value={query} autoComplete="off" aria-label="본문에서 찾기"
              placeholder="본문에서 찾기" onChange={(event) => {
                setQuery(event.target.value)
                setMatchIndex(0)
              }} onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                moveMatch(event.shiftKey ? -1 : 1)
              }} />
            {query.trim() && <span className="text-reader-search-count" aria-live="polite">
              {matches.length ? `${matchIndex + 1} / ${matches.length}` : '일치 없음'}
            </span>}
            <button type="button" className="quiet" disabled={!matches.length} aria-label="이전 본문 검색 결과" onClick={() => moveMatch(-1)}>↑</button>
            <button type="button" className="quiet" disabled={!matches.length} aria-label="다음 본문 검색 결과" onClick={() => moveMatch(1)}>↓</button>
          </div>
        </div>
      </header>
      <div className={`text-reader-main${outlineOpen && outline.length ? ' has-outline' : ''}`}>
        {outlineOpen && outline.length > 0 && (
          <nav className="text-reader-outline" aria-label="본문 목차">
            {outline.map(({ index, depth, text }) => (
              <button key={index} type="button" className="quiet" style={{ paddingInlineStart: `${8 + Math.min(depth - 1, 3) * 8}px` }}
                onClick={() => {
                  const heading = bodyRef.current?.querySelector<HTMLElement>(`[data-reader-heading="${index}"]`)
                  heading?.scrollIntoView({ block: 'start' })
                  heading?.focus({ preventScroll: true })
                }}>{text}</button>
            ))}
          </nav>
        )}
        <div className="text-reader-scroll" ref={bodyRef}>
          <div className="text-reader-content">
            {blocks.map((block, index) => {
              const { text } = block
              const content = activeMatch?.block === index ? (
                <>{text.slice(0, activeMatch.start)}<mark ref={markRef}>{text.slice(activeMatch.start, activeMatch.end)}</mark>{text.slice(activeMatch.end)}</>
              ) : text
              if (block.kind === 'heading') {
                return <div key={index} data-reader-heading={index} className="text-reader-heading"
                  role="heading" aria-level={Math.min(block.depth + 3, 6)} tabIndex={-1}>{content}</div>
              }
              if (block.kind === 'code') return <pre key={index}><code>{content}</code></pre>
              return <p key={index}>{content}</p>
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
