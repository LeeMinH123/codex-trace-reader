import { useEffect, useRef, useState } from 'react'
import type { Action, ActionDetail, DeliveryLink, DetailSection, Evidence, ModelInputItem } from '../../../shared/reader'
import { documentBlocks } from '../model/reader-text'
import { InspectorTextReader, type InspectorDocument } from './InspectorTextReader'
import { ActionMeta } from './views/Timeline'
import { stamp } from './common/time'

const excludedTitles = new Set(['묶음 규칙', '표시 근거'])
const evidenceLabels: Record<Evidence['type'], string> = {
  raw: '원시 JSONL',
  derived: '트레이스에서 생성한 상태',
  reference: '기록된 참조 위치',
}

const roleLabels: Record<ModelInputItem['role'], string> = {
  instruction: '지침',
  user: '사용자',
  assistant: '어시스턴트',
  tool: '도구 반환',
  other: '기록',
}

function shortActionLabel(item: Action, raw: boolean): string {
  if (raw) return item.label
  if (item.reading) {
    return [item.reading.title, item.reading.target?.text].filter(Boolean).join(' · ')
  }
  return item.label
}

function previewSnippet(sections: DetailSection[], limit = 240): { text: string; truncated: boolean } {
  const joined = sections.map((section) => section.text).filter(Boolean).join('\n\n').trim()
  if (joined.length <= limit) return { text: joined, truncated: false }
  return { text: joined.slice(0, limit).trimEnd() + '…', truncated: true }
}

type OpenReader = (button: HTMLButtonElement, document: InspectorDocument) => void

function SectionCodeList({ sections, onRead }: { sections: DetailSection[]; onRead: OpenReader }) {
  return (
    <div className="iwo-code-box">
      {sections.map((section) => (
        <div key={section.title} className="iwo-code-entry">
          {sections.length > 1 && <h4>{section.title}</h4>}
          <button type="button" className="quiet iwo-expand-btn" onClick={(event) => onRead(event.currentTarget, {
            title: section.title, text: section.text, format: 'literal',
          })}>넓게 읽기</button>
          <pre>{section.text}</pre>
        </div>
      ))}
    </div>
  )
}

export function Inspector({
  token,
  action,
  previous,
  next,
  actions,
  raw,
  highlightItemIds = [],
  returnTo,
  inspectAction,
  onReturn,
  onShowRaw,
  onReturnFromRaw,
  onSelect,
  onInspectDelivery,
  onClose,
}: {
  token?: string
  action?: Action
  previous?: Action
  next?: Action
  actions: Map<string, Action>
  raw: boolean
  highlightItemIds?: string[]
  returnTo?: { id: string; label: string } | null
  inspectAction?(token: string, actionId: string): Promise<ActionDetail | null>
  onReturn?(): void
  onShowRaw?(): void
  onReturnFromRaw?(): void
  onSelect(id: string, options?: { keepReading?: boolean }): void
  onInspectDelivery(fromAction: Action, delivery: DeliveryLink): void
  onClose(): void
}) {
  const [loaded, setLoaded] = useState<{ token: string; id: string; detail: ActionDetail | null }>()
  const [inputExpanded, setInputExpanded] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [reader, setReader] = useState<{ id: string; token?: string; raw: boolean; document: InspectorDocument }>()
  const readerOpener = useRef<HTMLButtonElement>(null)
  const id = action?.id

  useEffect(() => {
    setInputExpanded(false)
    setOutputExpanded(false)
    setReader(undefined)
  }, [id])

  useEffect(() => {
    if (!token || !id) return
    let current = true
    const load = inspectAction ?? ((t: string, actionId: string) => window.reader.inspect(t, actionId))
    void load(token, id).then(
      (detail) => { if (current) setLoaded({ token, id, detail }) },
      () => { if (current) setLoaded({ token, id, detail: null }) },
    )
    return () => { current = false }
  }, [token, id, inspectAction])

  if (!action) return null
  const current = loaded && loaded.token === token && loaded.id === id ? loaded : undefined
  const detail = current?.detail
  const parentAction = action.parent ? actions.get(action.parent.id) : undefined
  const highlightSet = new Set(highlightItemIds)

  const eyebrow = !raw && action.reading?.target
    ? action.reading.title
    : action.kind === 'model'
      ? action.label
      : undefined
  const heading = !raw && action.reading?.target
    ? action.reading.target.text
    : action.kind === 'model'
      ? (detail?.modelRequest?.model || action.summary || action.label)
      : (raw ? action.label : action.reading?.title ?? action.label)

  const visibleSections = (detail?.sections ?? []).filter((section) => raw || !excludedTitles.has(section.title))
  const messageSections = visibleSections.filter((section) => section.kind === 'message')
  const inputSections = visibleSections.filter((section) => section.kind === 'input')
  const resultSections = visibleSections.filter((section) => section.kind === 'result')
  const extraSections = visibleSections.filter((section) => section.kind === undefined)

  const messagePreview = previewSnippet(messageSections, 480)
  const inputPreview = previewSnippet(inputSections, 180)
  const resultPreview = previewSnippet(resultSections, 240)
  const hasLongResult = resultPreview.truncated
    || resultSections.length > 1
    || (resultSections[0]?.text.split('\n').length ?? 0) > 4

  const deliveryTargets = new Set((action.deliveries ?? []).map((delivery) => delivery.targetId))
  const flowRelations = (detail?.relations ?? []).filter((relation) => {
    if (deliveryTargets.has(relation.target)) return false
    const target = actions.get(relation.target)
    return target && (target.kind === 'tool' || target.kind === 'agent' || target.kind === 'model')
  })

  const showActor = action.actor !== '채팅' && action.actor !== '루트 에이전트' && action.actor !== '사용자'
  const statusText = !raw && action.reading?.outcome ? action.reading.outcome : action.status
  const evidence = detail?.evidence ?? []
  const firstRaw = evidence.find((item) => item.type === 'raw' && item.text)
  const activeDocument = reader && reader.id === id && reader.token === token && reader.raw === raw ? reader.document : undefined
  const messageDocument: InspectorDocument | undefined = messageSections.length ? {
    title: heading, format: 'document', text: messageSections.map((section) => section.text).join('\n\n'),
  } : undefined
  const firstCodeSection = inputSections[0] ?? resultSections[0]
  const firstEvidence = firstRaw ?? evidence.find((item) => item.text)
  const primaryDocument = raw && firstEvidence?.text
    ? { title: firstEvidence.location, text: firstEvidence.text, format: 'literal' as const }
    : messageDocument ?? (firstCodeSection && { title: firstCodeSection.title, text: firstCodeSection.text, format: 'literal' as const })

  const openReader: OpenReader = (button, document) => {
    readerOpener.current = button
    setReader({ id: action.id, token, raw, document })
  }

  function closeReader() {
    setReader(undefined)
    requestAnimationFrame(() => readerOpener.current?.focus({ preventScroll: true }))
  }

  return (
    <aside className={activeDocument ? 'inspector is-reading' : 'inspector'} aria-label="실행 상세" key={id}>
      <div className="inspector-head" hidden={Boolean(activeDocument)}>
        <div className="inspector-head-copy">
          {returnTo && onReturn && (
            <button type="button" className="quiet inspector-return" onClick={onReturn}>
              ← {returnTo.label}로 돌아가기
            </button>
          )}
          {onReturnFromRaw && <button type="button" className="quiet inspector-return" onClick={onReturnFromRaw}>← 이전 보기로 돌아가기</button>}
          {onShowRaw && <button type="button" className="quiet inspector-return" onClick={onShowRaw}>원본 근거 보기 →</button>}
          {eyebrow && <span className="inspector-eyebrow">{eyebrow}</span>}
          <h2>{heading}</h2>
          {raw && <ActionMeta action={action} />}
          <p className="inspector-time">
            {stamp(action.time)}
            {raw && action.sequence !== null && ` · 순번 ${action.sequence}`}
          </p>
        </div>
        <div className="inspector-head-actions">
          {primaryDocument && (
            <button type="button" className="button secondary" onClick={(event) => openReader(event.currentTarget, primaryDocument)}>넓게 읽기</button>
          )}
          <button type="button" className="quiet" onClick={onClose} aria-label="실행 상세 닫기">닫기</button>
        </div>
      </div>

      {activeDocument && <InspectorTextReader document={activeDocument} onBack={closeReader} />}
      <div className="inspector-body" hidden={Boolean(activeDocument)}>
        {(previous || next) && (
          <nav className="adjacent" aria-label="앞뒤 실행 이동">
            {previous && (
              <button type="button" className="quiet" onClick={() => onSelect(previous.id)}>
                ← 이전 · {shortActionLabel(previous, raw)}
              </button>
            )}
            {next && (
              <button type="button" className="quiet" onClick={() => onSelect(next.id)}>
                다음 · {shortActionLabel(next, raw)} →
              </button>
            )}
          </nav>
        )}

        {!current && <p className="inspector-state" role="status">상세 내용을 읽는 중입니다.</p>}
        {current && !detail && <p className="inspector-state">이 스냅샷에서 상세 내용을 읽을 수 없습니다.</p>}

        {raw && current && (
          <section className="iwo-panel-section raw-evidence" aria-label="원본 근거">
            <h3>원본 근거</h3>
            {!firstRaw && <p className="inspector-muted">이 스냅샷에서 원시 JSONL 본문 미확인</p>}
            {evidence.map((item, index) => (
              <details className="iwo-code-box" open={item === firstRaw} key={`${item.location}:${index}`}>
                <summary>{evidenceLabels[item.type]} · {item.location}</summary>
                {item.text ? <div className="iwo-code-entry">
                  <button type="button" className="quiet iwo-expand-btn" onClick={(event) => openReader(event.currentTarget, {
                    title: item.location, text: item.text!, format: 'literal',
                  })}>넓게 읽기</button>
                  <pre>{item.text}</pre>
                </div>
                  : <p className="inspector-muted">본문 미확인</p>}
              </details>
            ))}
          </section>
        )}

        {detail?.modelRequest && (
          <div className="iwo-panel">
            <section className="iwo-panel-section">
              <h3>입력</h3>
              {(() => {
                const { hasPrevious, inputs } = detail.modelRequest
                const freshItems = inputs.filter((item) => item.fresh)
                const priorItems = inputs.filter((item) => !item.fresh)
                const renderInputItem = (item: ModelInputItem) => {
                  const highlighted = highlightSet.has(item.id)
                  const clickable = actions.has(item.id)
                  const classes = ['model-input-item', highlighted && 'is-highlighted-input'].filter(Boolean).join(' ')
                  const inner = (
                    <>
                      <span className="model-item-head">
                        <span className="model-role-tag">{roleLabels[item.role]}</span>
                        <strong>{item.label}</strong>
                        {highlighted && <span className="highlight-pill">방금 본 반환</span>}
                      </span>
                      {item.preview && <span className="model-item-preview">{item.preview}</span>}
                    </>
                  )
                  return clickable ? (
                    <button
                      type="button"
                      key={item.id}
                      className={classes}
                      onClick={() => onSelect(item.id, { keepReading: true })}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={item.id} className={classes}>{inner}</div>
                  )
                }
                return (
                  <>
                    <div className="model-group-label">
                      {hasPrevious ? '이번에 새로 들어온 항목' : '이번 턴 항목'} ({freshItems.length})
                    </div>
                    {freshItems.length > 0 ? (
                      <div className="model-input-list">{freshItems.map(renderInputItem)}</div>
                    ) : (
                      <p className="inspector-muted">새로 추가된 항목이 없습니다.</p>
                    )}
                    {priorItems.length > 0 && (
                      <details className="iwo-prior-details">
                        <summary>
                          {hasPrevious
                            ? `이전부터 포함된 지침·대화 ${priorItems.length}개`
                            : `지침·이전 문맥 ${priorItems.length}개`}
                        </summary>
                        <div className="model-input-list is-subtle">{priorItems.map(renderInputItem)}</div>
                      </details>
                    )}
                  </>
                )
              })()}
            </section>

            <section className="iwo-panel-section">
              <h3>실행 상태</h3>
              <dl className="iwo-kv">
                {detail.modelRequest.model && <div><dt>모델</dt><dd>{detail.modelRequest.model}</dd></div>}
                <div><dt>상태</dt><dd>{statusText ?? '기록 있음'}</dd></div>
                <div><dt>시각</dt><dd>{stamp(action.time)}</dd></div>
              </dl>
            </section>

            <section className="iwo-panel-section">
              <h3>반환</h3>
              {detail.modelRequest.outputs.length === 0 ? (
                <p className="inspector-muted">기록된 응답 또는 도구 요청이 없습니다.</p>
              ) : (
                <div className="model-input-list">
                  {detail.modelRequest.outputs.map((output) => {
                    const clickable = actions.has(output.id)
                    const content = (
                      <>
                        <span className="model-item-head">
                          <span className="model-role-tag">
                            {output.kind === 'tool' ? '도구 요청' : output.kind === 'message' ? '응답' : '항목'}
                          </span>
                          <strong>{output.label}</strong>
                        </span>
                        {output.preview && <span className="model-item-preview">{output.preview}</span>}
                      </>
                    )
                    return clickable ? (
                      <button
                        type="button"
                        key={output.id}
                        className="model-input-item"
                        onClick={() => onSelect(output.id, { keepReading: true })}
                      >
                        {content}
                      </button>
                    ) : (
                      <div key={output.id} className="model-input-item">{content}</div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {detail && !detail.modelRequest && (
          <div className="iwo-panel">
            {(action.reading?.target || messageSections.length > 0 || inputSections.length > 0) && (
              <section className="iwo-panel-section">
                <h3>입력</h3>
                {action.reading?.target && (
                  <dl className="iwo-kv">
                    <div><dt>받은 값</dt><dd>{action.reading.target.text}</dd></div>
                  </dl>
                )}
                {messageDocument && (
                  <div className="iwo-message-body">
                    {messagePreview.truncated && (
                      <button type="button" className="quiet iwo-expand-btn" onClick={(event) => openReader(event.currentTarget, messageDocument)}>전체 본문 읽기</button>
                    )}
                    <div className="inspector-message-preview">
                      {documentBlocks(messagePreview.text).map((block, index) => block.kind === 'heading'
                        ? <h4 key={index}>{block.text}</h4> : block.kind === 'code'
                          ? <pre key={index}>{block.text}</pre> : <p key={index} className="iwo-plain-text">{block.text}</p>)}
                    </div>
                  </div>
                )}
                {inputSections.length > 0 && (
                  <div className="iwo-expand-block">
                    {!action.reading?.target && !inputExpanded && inputPreview.text && (
                      <p className="iwo-preview-text">{inputPreview.text}</p>
                    )}
                    <button type="button" className="quiet iwo-expand-btn" onClick={() => setInputExpanded(!inputExpanded)}>
                      {inputExpanded ? '실제 입력 접기' : '실제 입력 펼치기'}
                    </button>
                    {inputExpanded && <SectionCodeList sections={inputSections} onRead={openReader} />}
                  </div>
                )}
              </section>
            )}

            <section className="iwo-panel-section">
              <h3>실행 상태</h3>
              <dl className="iwo-kv">
                <div><dt>상태</dt><dd>{statusText ?? '기록 있음'}</dd></div>
                <div><dt>시각</dt><dd>{stamp(action.time)}</dd></div>
                {showActor && <div><dt>실행 주체</dt><dd>{action.actor}</dd></div>}
                {parentAction && (
                  <div>
                    <dt>상위 실행</dt>
                    <dd>
                      <button
                        type="button"
                        className="quiet inspector-link"
                        onClick={() => onSelect(parentAction.id, { keepReading: true })}
                      >
                        {shortActionLabel(parentAction, raw)} ↑
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {(resultSections.length > 0 || (action.kind === 'tool' && messageSections.length === 0)) && (
              <section className="iwo-panel-section">
                <h3>반환</h3>
                {resultSections.length === 0 ? (
                  <p className="inspector-muted">기록된 반환이 없습니다.</p>
                ) : (
                  <div className="iwo-expand-block">
                    {!outputExpanded && <p className="iwo-preview-text">{resultPreview.text}</p>}
                    {hasLongResult && (
                      <button type="button" className="quiet iwo-expand-btn" onClick={() => setOutputExpanded(!outputExpanded)}>
                        {outputExpanded ? '전체 반환 접기' : '전체 반환 펼치기'}
                      </button>
                    )}
                    {outputExpanded && <SectionCodeList sections={resultSections} onRead={openReader} />}
                  </div>
                )}
              </section>
            )}

            {raw && extraSections.length > 0 && (
              <section className="iwo-panel-section">
                <h3>추가 필드</h3>
                <SectionCodeList sections={extraSections} onRead={openReader} />
              </section>
            )}

            {((action.deliveries && action.deliveries.length > 0) || flowRelations.length > 0) && (
              <section className="iwo-panel-section">
                <h3>연결</h3>
                <div className="inspector-links">
                  {(action.deliveries ?? []).map((delivery, idx) => (
                    <button
                      type="button"
                      key={`${delivery.targetId}:${idx}`}
                      className="inspector-flow-link"
                      onClick={() => onInspectDelivery(action, delivery)}
                    >
                      반환이 포함된 모델 입력 ({stamp(delivery.targetTime, true)}) →
                    </button>
                  ))}
                  {flowRelations.map((relation, index) => {
                    const target = actions.get(relation.target)!
                    return (
                      <button
                        type="button"
                        key={`${relation.target}:${index}`}
                        className="quiet inspector-link"
                        onClick={() => onSelect(relation.target, { keepReading: true })}
                      >
                        {relation.label} · {shortActionLabel(target, raw)} →
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
