import type { Turn, Workspace } from '../../../shared/reader'
import { rolloutLabel } from '../app/turn-destinations'
import { stamp } from './time'

interface Props {
  workspace: Workspace
  mode: 'recent' | 'session' | 'trace'
  busy: boolean
  turns: Turn[]
  selectedTurnId: string | null
  turnMatchCounts: Map<string, number>
  onRecent(): void
  onSession(): void
  onOpenSession(): void
  onOpenRollout(): void
  onFindRollouts(): void
  onRollout(id: string): void
  onBundle(id: string): void
  onOpenBundle(): void
  onFind(): void
  onTraceRoot(): void
  onSelectTurn(id: string): void
  onExecutable(): void
}

export function Sources({
  workspace, mode, busy, turns, selectedTurnId, turnMatchCounts,
  onRecent, onSession, onOpenSession, onOpenRollout, onFindRollouts, onRollout,
  onBundle, onOpenBundle, onFind, onTraceRoot, onSelectTurn, onExecutable,
}: Props) {
  const { session, bundles, rollouts, selectedId } = workspace
  const activeBundleId = selectedId ?? bundles[0]?.id ?? ''

  return (
    <aside className="sources" aria-label={mode === 'recent' ? '채팅 탐색' : '요청 목차'}>
      {mode === 'recent' ? (
        <div className="source-group">
          <h2>채팅</h2>
          <button type="button" className="source-row" aria-current="page" onClick={onRecent} disabled={busy}>
            <span className="source-symbol session-symbol" aria-hidden="true" />
            <span><strong>최근 채팅</strong></span>
          </button>
          {session && (
            <button type="button" className="source-row" onClick={onSession} disabled={busy}>
              <span className="source-symbol session-symbol" aria-hidden="true" />
              <span><strong>{session.title}</strong><small>열려 있는 채팅</small></span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="source-nav">
            <button type="button" className="quiet source-back" onClick={onRecent} disabled={busy}>
              ← 최근 채팅
            </button>
            {session && <div className="source-chat-title" title={session.title}>{session.title}</div>}
            {session && bundles.length > 0 && (
              <div className="source-switcher" role="group" aria-label="기록 소스 전환">
                <button type="button" className="source-tab"
                  aria-current={mode === 'session' ? 'page' : undefined}
                  onClick={onSession} disabled={busy}>
                  대화
                </button>
                <button type="button" className="source-tab"
                  aria-current={mode === 'trace' ? 'page' : undefined}
                  onClick={() => onBundle(activeBundleId)} disabled={busy}>
                  상세{bundles.length > 1 ? ` ${bundles.length}` : ''}
                </button>
              </div>
            )}
            {mode === 'trace' && bundles.length > 1 && (
              <label className="bundle-select">
                <span>상세 번들</span>
                <select value={activeBundleId} disabled={busy} onChange={(event) => onBundle(event.target.value)}>
                  {bundles.map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>{stamp(bundle.startedAt)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="toc-group">
            <div className="source-heading">
              <h2>요청 목록</h2>
              <span>{turns.length.toLocaleString('ko-KR')}</span>
            </div>
            {turns.length === 0 ? (
              <p className="toc-empty">표시할 요청이 없습니다.</p>
            ) : (
              <ul className="toc-list">
                {turns.map((turn) => {
                  const matchCount = turnMatchCounts.get(turn.id) ?? 0
                  return (
                    <li key={turn.id}>
                      <button
                        type="button"
                        className="toc-row"
                        aria-current={turn.id === selectedTurnId ? 'true' : undefined}
                        onClick={() => onSelectTurn(turn.id)}
                      >
                        <span className="toc-title">{turn.title}</span>
                        {matchCount > 0 && <span className="match-badge">일치 {matchCount}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {session && (
            <div className="source-foot">
              {mode === 'session' && rollouts.length > 1 && (
                <label className="rollout-select">
                  <span>대화 버전</span>
                  <select value={session.rolloutId} disabled={busy} onChange={(event) => onRollout(event.target.value)}>
                    {rollouts.map((item) => <option key={item.id} value={item.id}>{rolloutLabel(item)}</option>)}
                  </select>
                </label>
              )}
              <details className="source-settings">
                <summary>파일 · 기록 관리</summary>
                <button className="quiet" type="button" disabled={busy} onClick={onFindRollouts}>같은 채팅의 rollout 찾기</button>
                <button className="quiet" type="button" disabled={busy} onClick={onOpenRollout}>rollout 파일 직접 추가</button>
                <button className="quiet" type="button" disabled={busy} onClick={onOpenSession}>다른 세션 파일 열기</button>
                <button className="quiet" type="button" disabled={busy} onClick={onFind}>상세 기록 다시 찾기</button>
                <button className="quiet" type="button" disabled={busy} onClick={onTraceRoot}>검색 위치 선택</button>
                <button className="quiet" type="button" disabled={busy} onClick={onOpenBundle}>상세 폴더 직접 추가</button>
                {mode === 'trace' && (
                  <button className="quiet" type="button" disabled={busy} onClick={onExecutable}>변환 실행 파일 변경</button>
                )}
              </details>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

export function CandidateList({ candidates, busy, onAdd, onClose }: {
  candidates: { id: string; path: string; startedAt: number | null }[]
  busy: boolean
  onAdd(id: string): void
  onClose(): void
}) {
  const title = '같은 채팅의 이전 기록'
  return (
    <section className="candidate-list" aria-label={`${title} 후보`}>
      <div className="section-title">
        <h2>{title}</h2>
        <button className="quiet" type="button" onClick={onClose}>닫기</button>
      </div>
      {candidates.length === 0 && <p>등록된 기록의 폴더에서 추가할 수 있는 rollout을 찾지 못했습니다.</p>}
      {candidates.map((candidate) => (
        <div className="candidate" key={candidate.id}>
          <div><strong>{stamp(candidate.startedAt)}</strong><small className="source-path">{candidate.path}</small></div>
          <button type="button" className="button secondary" onClick={() => onAdd(candidate.id)} disabled={busy}>추가</button>
        </div>
      ))}
    </section>
  )
}
