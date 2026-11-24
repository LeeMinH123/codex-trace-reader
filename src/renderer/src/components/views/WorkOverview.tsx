import type { WorkOverviewModel } from '../../model/work-overview'

export function WorkOverview({
  overview,
  selectedTurnId,
  source,
  recordStatus,
  note,
  traceUnavailable,
  onFocusTurn,
  onOpenEntry,
}: {
  overview: WorkOverviewModel
  selectedTurnId?: string
  source: 'session' | 'trace'
  recordStatus: string
  note?: string
  traceUnavailable: boolean
  onFocusTurn(id: string): void
  onOpenEntry(turnId: string, view: 'story' | 'raw', entryId: string, actionId?: string, chapterId?: string): void
}) {
  return (
    <section id="work-overview" className="work-overview" aria-labelledby="overview-heading">
      <h2 id="overview-heading">작업 개요</h2>
      <p className="work-overview-description">
        {source === 'session' ? '선택한 대화 기록' : '선택한 상세 트레이스 번들'}에서 확인된 작업입니다.
      </p>

      <div className="work-overview-stats" aria-label="현재 기록 범위">
        <span>요청 <strong>{overview.turnCount.toLocaleString('ko-KR')}</strong>개</span>
        <span>기록된 행동 <strong>{overview.actionCount.toLocaleString('ko-KR')}</strong>개</span>
        <span>기록된 주체 <strong>{overview.actorCount.toLocaleString('ko-KR')}</strong>종</span>
      </div>
      <p className="work-overview-coverage">
        <strong>기록 상태</strong> · {recordStatus}
        {note && <span> · {note}</span>}
        {traceUnavailable && <span> · 연결된 상세 트레이스 미확인</span>}
      </p>

      {overview.turns.length === 0 ? (
        <p className="work-overview-empty">현재 기록에서 표시할 작업이 없습니다.</p>
      ) : (
        <ol className="work-overview-turns">
          {overview.turns.map((turn) => {
            const active = turn.id === selectedTurnId
            const rawEntry = `${turn.id}:raw`
            return (
              <li key={turn.id} className={active ? 'work-overview-turn active' : 'work-overview-turn'}>
                <button type="button" className="work-overview-turn-button" aria-current={active ? 'true' : undefined}
                  onClick={() => onFocusTurn(turn.id)}>
                  <span className="work-overview-turn-title">{turn.title}</span>
                  <span className="work-overview-turn-count">{turn.stages.length}개 구간 · {turn.actionCount}개 행동</span>
                </button>
                {active && (
                  <div className="work-overview-stages">
                    <p className="work-overview-stage-intro">
                      {turn.actor}{turn.status ? ` · ${turn.status}` : ''}
                      <button type="button" className="quiet" data-overview-entry={rawEntry}
                        onClick={() => onOpenEntry(turn.id, 'raw', rawEntry, turn.rawActionId)}>
                        이 기록의 원본 열기
                      </button>
                    </p>
                    {turn.stages.length === 0 ? (
                      <p className="work-overview-empty">이 요청에서 진행 구간을 구성할 기록이 없습니다.</p>
                    ) : (
                      <ol>
                        {turn.stages.map((stage) => {
                          const storyEntry = `${stage.id}:story`
                          const rawEntry = `${stage.id}:raw`
                          return (
                            <li key={stage.id} className="work-overview-stage">
                              <div className="work-overview-stage-text">
                                <strong>{stage.heading}</strong>
                                <small>{stage.basis === 'recorded-message' ? '기록된 진행 메시지로 시작' : '작업 구간 분류 규칙 적용'} · {stage.actionCount}개 행동</small>
                                {stage.summary && <span>{stage.summary}</span>}
                              </div>
                              <div className="work-overview-stage-actions">
                                <button type="button" className="button secondary" data-overview-entry={storyEntry}
                                  onClick={() => onOpenEntry(turn.id, 'story', storyEntry, stage.actionId, stage.id)}>구간 읽기</button>
                                <button type="button" className="quiet" data-overview-entry={rawEntry}
                                  onClick={() => onOpenEntry(turn.id, 'raw', rawEntry, stage.actionId)}>첫 행동의 원본</button>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
