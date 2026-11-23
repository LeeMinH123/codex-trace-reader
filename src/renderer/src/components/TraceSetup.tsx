import type { Workspace } from '../../../shared/reader'

export function TraceSearch({ result, busy, onFind, onRoot, onOpen }: {
  result: Workspace['traceSearch']
  busy: boolean
  onFind(): void
  onRoot(): void
  onOpen(): void
}) {
  return (
    <section className="trace-setup">
      <h2>이 채팅의 상세 실행 기록을 찾지 못했어요</h2>
      <p>대화는 아래에서 읽을 수 있어요. 상세 기록을 찾으면 도구와 모델 요청의 연결도 볼 수 있습니다.</p>
      <div className="setup-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={onFind}>상세 기록 다시 찾기</button>
        <button className="quiet" type="button" disabled={busy} onClick={onRoot}>검색 위치 선택</button>
        <button className="quiet" type="button" disabled={busy} onClick={onOpen}>폴더 직접 추가</button>
      </div>
      {result && result.searched.length > 0 && <details className="setup-info">
        <summary>검색한 위치</summary>
        <ul>{result.searched.map((path) => <li className="source-path" key={path}>{path}</li>)}</ul>
        {result.issue && <p>{result.issue.message}</p>}
      </details>}
    </section>
  )
}

export function TraceSetup({ workspace, busy, onHint, onExecutable, onReturn }: {
  workspace: Workspace
  busy: boolean
  onHint(): void
  onExecutable(): void
  onReturn?: () => void
}) {
  const { executable, executableHint } = workspace
  return (
    <section className="trace-setup">
      <h2>{executable ? '선택한 실행 파일로 상세 기록을 열지 못했어요' : '상세 기록을 열 준비가 필요해요'}</h2>
      <p>Codex 상세 기록을 읽으려면 이 기록을 만들 때 사용한 <code>codex.exe</code>가 필요합니다.</p>
      {!executable && executableHint && <p>이 PC에서 실행 파일을 찾았어요. 기록을 만들 때 사용한 파일이면 선택하세요.</p>}
      <div className="setup-actions">
        {!executable && executableHint && <button type="button" className="button primary" disabled={busy} onClick={onHint}>찾은 실행 파일로 열기</button>}
        <button type="button" className="button secondary" disabled={busy} onClick={onExecutable}>
          {executable || executableHint ? '다른 실행 파일 선택' : '실행 파일 선택'}
        </button>
        {onReturn && <button type="button" className="quiet" disabled={busy} onClick={onReturn}>대화 턴으로 돌아가기</button>}
      </div>
      <details className="setup-info" open={!executableHint}>
        <summary>실행 파일 찾는 방법</summary>
        <p>기록을 만들 때 사용한 Codex의 설치 폴더에서 <code>app\resources\codex.exe</code>를 찾아 선택하세요. Microsoft Store에서 설치했다면 <code>WindowsApps</code> 안의 <code>OpenAI.Codex_…</code> 폴더에 있습니다.</p>
        {executableHint && <p className="source-path">{executableHint}</p>}
      </details>
    </section>
  )
}
