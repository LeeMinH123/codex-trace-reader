import type { WorkOverviewModel } from '../../model/work-overview'

export function WorkOverview({
  overview,
  selectedTurnId,
  source,
  recordStatus,
  note,
  onFocusTurn,
  onOpenStage,
  onClose,
}: {
  overview: WorkOverviewModel
  selectedTurnId?: string
  source: 'session' | 'trace'
  recordStatus: string
  note?: string
  onFocusTurn(id: string): void
  onOpenStage(id: string, view: 'story' | 'raw'): void
  onClose(): void
}) {
  return (
    <section id="work-overview" className="work-overview" aria-labelledby="overview-heading">
      <div className="work-overview-header">
        <div>
          <p className="work-overview-eyebrow">전체에서 세부 근거로</p>
          <h2 id="overview-heading">작업 개요</h2>
          <p className="work-overview-description">
            {source === 'session' ? '선택한 대화 기록' : '선택한 상세 트레이스 번들'}에서 확인된 요청과 작업 구간입니다.
            구간은 기록된 진행 메시지 또는 행동 유형에 따라 규칙으로 묶었습니다.
          </p>
        </div>
        <button type="button" className="button secondary" onClick={onClose}>개요 접기</button>
      </div>

      <div className="work-overview-stats" aria-label="현재 기록 범위">
        <span>요청 <strong>{overview.turnCount.toLocaleString('ko-KR')}</strong>개</span>
        <span>기록된 행동 <strong>{overview.actionCount.toLocaleString('ko-KR')}</strong>개</span>
        <span>표시된 실행 주체 <strong>{overview.actorCount.toLocaleString('ko-KR')}</strong>종</span>
      </div>
      <p className="work-overview-coverage">
        <strong>기록 상태:</strong> {recordStatus}
        {note && <span> · {note}</span>}
      </p>

      {overview.turns.length === 0 ? (
        <p className="work-overview-empty">현재 기록 범위에서 표시할 요청이 없습니다. 원본 보기에서 확인할 수 있습니다.</p>
      ) : (
        <ol className="work-overview-turns">
          {overview.turns.map((turn, index) => {
            const active = turn.id === selectedTurnId
            return (
              <li key={turn.id} className={active ? 'work-overview-turn active' : 'work-overview-turn'}>
                <button type="button" className="work-overview-turn-button" aria-current={active ? 'true' : undefined}
                  onClick={() => onFocusTurn(turn.id)}>
                  <span className="work-overview-turn-index">요청 {index + 1}</span>
                  <span className="work-overview-turn-title">{turn.title}</span>
                  <span className="work-overview-turn-count">{turn.stages.length}개 구간 · {turn.actionCount}개 행동</span>
                </button>
                {active && (
                  <div className="work-overview-stages">
                    <p className="work-overview-stage-intro">
                      {turn.actor}{turn.status ? ` · ${turn.status}` : ''} · 구간을 선택해 행동과 원본 근거로 내려갈 수 있습니다.
                    </p>
                    {turn.stages.length === 0 ? (
                      <p className="work-overview-empty">이 요청에서 진행 구간을 구성할 기록이 없습니다.</p>
                    ) : (
                      <ol>
                        {turn.stages.map((stage) => (
                          <li key={stage.id} className="work-overview-stage">
                            <div className="work-overview-stage-text">
                              <strong>{stage.heading}</strong>
                              <small>{stage.basis === 'recorded-message' ? '기록된 진행 메시지 기준' : '행동 유형별 규칙 묶음'} · {stage.actionCount}개 행동</small>
                              {stage.summary && <span>{stage.summary}</span>}
                            </div>
                            {stage.actionId && (
                              <div className="work-overview-stage-actions">
                                <button type="button" className="button secondary" onClick={() => onOpenStage(stage.actionId!, 'story')}>구간 읽기</button>
                                <button type="button" className="quiet" onClick={() => onOpenStage(stage.actionId!, 'raw')}>원본에서 보기</button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <p className="work-overview-footnote">
        이 화면은 원시 기록을 기반으로 한 탐색 목차입니다. 구간 명칭과 묶음은 규칙 기반 표현이며,
        실제 의도·인과관계·방법론의 수행 여부를 증명하지 않습니다. 보이지 않는 기록은 추정해 채우지 않습니다.
      </p>
    </section>
  )
}
