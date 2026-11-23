export interface InterestItem {
  title: string
  description: string
  basis: string
}

export interface ProjectMetric {
  label: string
  before: string
  after: string
}

export interface PrincipleRow {
  principle: string
  application: string
}

export const PORTFOLIO_PROFILE = {
  nickname: 'LeeMinH123',
  tagline: '에이전트 실행 기록에서 사실과 흐름을 읽어, 사람의 위임 판단을 돕는 도구를 만듭니다.',
  intro:
    'AI 에이전트가 코드와 문서 작성의 많은 부분을 수행하는 환경에서, 사람은 무엇을 보고 언제 개입해야 하는지 고민합니다. '
    + 'AI 요약을 덧씌우기보다 원시 로그의 구조·시간·정보 전달 관계를 충실히 드러내 사용자의 정신모형을 형성하는 로컬 퍼스트 개발자 도구를 설계·구현하고 있습니다.',
  githubUrl: 'https://github.com/LeeMinH123',
  repoUrl: 'https://github.com/LeeMinH123/codex-trace-reader',
  pagesUrl: 'https://leeminh123.github.io/codex-trace-reader/',
  interests: [
    {
      title: 'AI 에이전트 관측성과 위임의 정신모형',
      description:
        '에이전트가 실행한 명령의 범위·조건·반환 전달을 직접 관찰함으로써, 사용자가 목표·제약·검증 기준을 더 정확히 위임하고 개입 시점을 판단하는 과정을 탐구합니다.',
      basis: '제품 철학 · 정신모형과 위임',
    },
    {
      title: '인지부채·의도부채를 줄이는 정보 구조화',
      description:
        '수백 줄의 평면 JSONL 이벤트와 원시 XML 지침을 Input · Work · Output 계층으로 압축하되, 개별 사실과 원본 근거로 즉시 내려갈 수 있는 점진적 공개 UX를 설계합니다.',
      basis: '정보이론 · 점진적 공개 원칙',
    },
    {
      title: '관찰과 해석을 구별하는 로컬 퍼스트 도구',
      description:
        '기록에 확인된 사실, 규칙 기반 요약, 추정할 수 없는 영역을 UI에서 엄격히 구별하며, 외부 전송 없이 로컬 스냅샷을 읽기 전용으로 검증하는 Electron/TypeScript 도구를 만듭니다.',
      basis: 'PRD · 데이터 계약 및 근거 규칙',
    },
  ] satisfies InterestItem[],
  project: {
    name: 'Codex 트레이스 리더 (codex-trace-reader)',
    subtitle: 'AI 요약 없이 원시 실행 기록의 구조와 근거를 읽어내는 로컬 데스크톱 뷰어 & 라이브 웹 데모',
    period: '2026 · 개인 프로젝트',
    problem:
      'Codex 세션의 `rollout-*.jsonl`과 상세 트레이스 번들(`state.json`, `trace.jsonl`)에는 한 턴에도 100개 이상의 원시 레코드, XML 지침, 반복 도구 호출이 섞여 있습니다. '
      + '평면 로그로는 "어떤 지침이 처음부터 들어갔는가", "어떤 코드 실행이 하위 도구를 불렀는가", "그 반환이 다음 모델 입력에 실제로 포함됐는가"를 파악하기 어려웠습니다.',
    role:
      '제품 철학(`docs/product-philosophy.md`)과 요구사항(`docs/prd.md`) 정의부터 파싱 엔진, 규칙 기반 의미 해석기, 4가지 타임라인 뷰(`이야기 · 흐름도 · 타임라인 · 원본`), 회귀 테스트 스위트, GitHub Pages 정적 웹 데모까지 전 과정을 단독 설계·구현했습니다.',
    tech: ['Electron 45', 'React 19', 'TypeScript 5.9', 'Vite 7', 'Node Test Runner'],
    metrics: [
      {
        label: '반복 호출과 코드 실행',
        before: '동일한 "코드 실행 · 결과 있음"이 14줄씩 나열됨',
        after: '실제 코드·인자 규칙으로 화면 조작/파일 읽기/명령 구분 + 연속 반복 자동 접기',
      },
      {
        label: '사전 지침과 설정',
        before: '빈 "설정 기록" 반복 + <app-context> 원시 XML 태그 노출',
        after: '지침 분류·태그 제거 요약, 턴별 최신 설정 1건으로 중복 정리 (원본은 상세에 보존)',
      },
      {
        label: '연결 관계 시각화',
        before: '시간 순 나열만으로 호출 계층과 입력 전달 여부 불분명',
        after: '확인된 ID 일치 기반 Input · Work · Output 탐색, DAG 흐름도 및 → 모델 입력 추적',
      },
    ] satisfies ProjectMetric[],
    outcomes: [
      '대화 기록(rollout)과 상세 트레이스(bundle)를 턴 ID·파일 라인 근거로 연결하고, 원본 파일은 읽기 전용 스냅샷으로만 다뤄 안전성을 확보했습니다.',
      '프랙탈 `받은 내용 · 작업 과정 · 돌려준 결과` 탐색 구조와 `이야기 · 흐름도 · 타임라인 · 원본` 4개 뷰어를 구축해 목적에 따라 읽는 방식을 전환할 수 있습니다.',
      '파서·지침 중복 제거·코드 실행 의미 해석·그래프/타임라인·데모 무결성을 검증하는 자동 테스트 스위트를 갖췄습니다.',
    ],
  },
  principles: [
    {
      principle: '구조화',
      application: '확보한 기록에서 순서, 실행 주체, 입력·결과, ID가 일치하는 호출·전달 관계만 재구성합니다.',
    },
    {
      principle: '시각화',
      application: '이야기 챕터 막대, SVG 기반 흐름도, 상대·절대 시간 타임라인으로 작업 비중과 맥락을 한눈에 보여줍니다.',
    },
    {
      principle: '점진적 공개',
      application: '요청 개요와 반복 묶음에서 개별 행동 상세로, 다시 원시 JSON 레코드까지 단계적으로 내려갑니다.',
    },
    {
      principle: '접근의 개방성',
      application: '접어 둔 지침·반복 실행도 클릭해 펼칠 수 있으며, 잘림·누락과 확인 한계를 그대로 알립니다.',
    },
    {
      principle: '관찰과 해석의 구분',
      application: '기록된 원시 값과 뷰어 규칙 요약을 섞지 않으며, 상세 패널에서 원문을 언제든 대조할 수 있습니다.',
    },
    {
      principle: '탐색 자율성',
      application: '오류나 완료 여부와 무관하게 질문·성공 사례·탐색적 관찰 어느 지점에서나 읽기를 시작할 수 있습니다.',
    },
  ] satisfies PrincipleRow[],
}
