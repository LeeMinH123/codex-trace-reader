import { useMemo } from 'react'
import type { RecentChatList } from '../../../shared/reader'
import '../styles/recent-chats.css'

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function searchText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR')
}

export function RecentChats({ list, query, busy, selectedId, onQuery, onOpen, onOpenFile }: {
  list?: RecentChatList
  query: string
  busy: boolean
  selectedId?: string
  onQuery(query: string): void
  onOpen(id: string): void
  onOpenFile(): void
}) {
  const entries = useMemo(() => (list?.chats ?? []).map((chat) => {
    const date = new Date(chat.updatedAt)
    const displayed = dateFormat.format(date)
    const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part) => String(part).padStart(2, '0'))
    const search = searchText([chat.title, chat.firstRequest, displayed, parts.join('-'), parts.join('.')].join(' '))
    return { chat, date: displayed, search }
  }), [list?.chats])
  const words = searchText(query.trim()).split(/\s+/).filter(Boolean)
  const matches = entries.filter(({ search }) => words.every((word) => search.includes(word)))

  return (
    <section className="recent-chats" aria-labelledby="recent-title">
      <header className="recent-head">
        <div>
          <h1 id="recent-title">최근 채팅</h1>
          <p>이 PC에 저장된 Codex 채팅을 열어보세요.</p>
        </div>
        <button type="button" className="button secondary" disabled={busy} onClick={onOpenFile}>파일 직접 열기</button>
      </header>
      <div className="recent-search">
        <span className="search-icon" aria-hidden="true" />
        <input type="search" aria-label="제목, 첫 요청, 날짜로 채팅 검색" placeholder="제목, 첫 요청 또는 날짜로 검색"
          value={query} onChange={(event) => onQuery(event.target.value)} spellCheck={false} />
      </div>
      <details className="recent-help">
        <summary>상세 실행 기록 준비</summary>
        <p>도구와 모델 요청의 연결 정보를 기록하려면 Codex를 시작하거나 채팅을 재개하기 전에
          {' '}<code>CODEX_ROLLOUT_TRACE_ROOT</code>를 지정하세요. 기록이 있으면 채팅을 연 뒤 해당 폴더를 추가할 수 있습니다.</p>
      </details>
      {list?.issue && (
        <div className="issues" role="status">
          <strong>최근 채팅을 읽을 수 없습니다. {list.issue.message}</strong>
          {list.issue.path && <small>{list.issue.path}</small>}
        </div>
      )}
      {!list && <p className="recent-empty" role="status">최근 채팅을 불러오는 중입니다.</p>}
      {list && !list.issue && entries.length === 0 && (
        <p className="recent-empty">저장된 채팅을 찾지 못했습니다. 알고 있는 기록은 파일 직접 열기로 열 수 있습니다.</p>
      )}
      {entries.length > 0 && (
        <>
          <div className="recent-count" aria-live="polite">
            <span>{words.length ? `검색 결과 ${matches.length}개` : `채팅 ${entries.length}개`}</span>
            {list?.limited && <span>최근 {entries.length}개 범위</span>}
          </div>
          {matches.length === 0 && <p className="recent-empty">일치하는 채팅이 없습니다. 다른 검색어를 입력해 보세요.</p>}
          {matches.length > 0 && (
            <ul className="recent-list">
              {matches.map(({ chat, date }) => (
                <li key={chat.id}>
                  <button type="button" className="recent-row" disabled={busy}
                    aria-current={chat.id === selectedId ? 'true' : undefined} onClick={() => onOpen(chat.id)}>
                    <span className="recent-row-title">{chat.title}</span>
                    <time className="recent-date" dateTime={new Date(chat.updatedAt).toISOString()}>{date}</time>
                    {chat.firstRequest && chat.firstRequest !== chat.title && <span className="recent-preview">{chat.firstRequest}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
