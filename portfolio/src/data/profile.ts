export interface InterestItem {
  title: string
  description: string
  basis: string
}

export interface PhilosophyPillar {
  title: string
  description: string
}

export interface FlowStep {
  step: string
  title: string
  detail: string
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

export interface RoadmapStep {
  step: string
  title: string
  summary: string
}

export const PORTFOLIO_PROFILE = {
  nickname: 'LeeMinH123',
  tagline: '에이전트가 코드를 쓰는 시대,\n사람은 무엇을 보고 위임해야 하는가',
  intro:
    'AI 요약으로 과정을 덮는 대신 실행 기록의 사실과 흐름을 구조화해, 사용자가 스스로 질문하고 위임의 기준을 세우도록 돕는 로컬 도구를 만듭니다.',
  githubUrl: 'https://github.com/LeeMinH123',
  repoUrl: 'https://github.com/LeeMinH123/codex-trace-reader',
  pagesUrl: 'https://leeminh123.github.io/codex-trace-reader/',
  philosophyDocUrl: 'https://github.com/LeeMinH123/codex-trace-reader/blob/main/docs/product-philosophy.md',
  prdDocUrl: 'https://github.com/LeeMinH123/codex-trace-reader/blob/main/docs/prd.md',
  interests: [
    {
      title: '정신모형과 위임',
      description: '에이전트의 실행 범위와 검증 결과를 직접 보며 개입 시점을 판단하는 구조를 탐구합니다.',
      basis: '제품 철학',
    },
    {
      title: '인지·의도부채 구조화',
      description: '수백 줄의 로그를 Input · Work · Output으로 압축하되 원시 근거까지 내려가게 합니다.',
      basis: '정보이론',
    },
    {
      title: '관찰과 해석의 구분',
      description: '기록에 남은 사실과 규칙 기반 요약, 추정할 수 없는 영역을 UI에서 엄격히 가릅니다.',
      basis: '로컬 퍼스트',
    },
  ] satisfies InterestItem[],
  philosophyPillars: [
    {
      title: '정신모형이 위임을 결정한다',
      description: '목표와 제약을 정하는 사람이 에이전트 작동 원리를 이해할수록 더 적절한 위임과 개입이 가능합니다.',
    },
    {
      title: '압축하되 근거는 지우지 않는다',
      description: '반복 호출을 묶어 전체 흐름을 한눈에 보여주고, 원할 때는 개별 명령과 원본 JSON까지 내려갑니다.',
    },
    {
      title: '관찰과 해석을 섞지 않는다',
      description: 'AI 분석을 또 얹어 원인을 단정하지 않고, 기록에서 실제로 확인된 ID·경로·종료 코드만 연결합니다.',
    },
  ] satisfies PhilosophyPillar[],
  flowSteps: [
    {
      step: 'Input',
      title: '원시 기록',
      detail: 'rollout JSONL · trace 번들',
    },
    {
      step: 'Work',
      title: '규칙 기반 구조화',
      detail: '챕터 · 흐름도 · 확인된 전달선',
    },
    {
      step: 'Output',
      title: '사람의 관찰과 위임',
      detail: '직접 질문 · 근거 검증 · 개입 판단',
    },
  ] satisfies FlowStep[],
  principles: [
    {
      principle: '구조화',
      application: '기록된 순서, 실행 주체, ID가 일치하는 호출·전달 관계만 재구성합니다.',
    },
    {
      principle: '시각화',
      application: '작업 단계 비중 막대, 흐름도, 타임라인으로 앞뒤 맥락을 드러냅니다.',
    },
    {
      principle: '점진적 공개',
      application: '요청 개요에서 개별 행동 상세와 원시 레코드까지 단계적으로 펼칩니다.',
    },
    {
      principle: '접근의 개방성',
      application: '접어 둔 지침·반복 실행과 누락·잘림 한계를 숨기지 않고 공개합니다.',
    },
    {
      principle: '관찰과 해석의 구분',
      application: '원시 값과 뷰어 규칙 요약을 섞지 않으며 상세 패널에서 언제든 대조합니다.',
    },
    {
      principle: '탐색 자율성',
      application: '오류나 질문을 고르지 않아도 성공 사례와 탐색적 관찰로 바로 시작합니다.',
    },
  ] satisfies PrincipleRow[],
  project: {
    name: 'Codex 트레이스 리더 (codex-trace-reader)',
    subtitle: 'Windows 로컬 Codex 단일 채팅 기록 위에서 제품 철학을 1차 검증하는 초기 프로토타입',
    period: 'v0.1.0 · 첫 번째 검증 프로토타입',
    problem:
      'Codex의 `rollout-*.jsonl`과 `trace-*` 번들은 한 턴에도 100개 이상의 이벤트와 원시 XML 지침이 뒤섞여, 어떤 지침이 들어갔고 도구 반환이 모델에 전달됐는지 파악하기 어려웠습니다.',
    role:
      '제품 철학(`docs/product-philosophy.md`)과 요구사항(`docs/prd.md`) 정의, 파싱 엔진, 규칙 기반 요약기, 4종 뷰어 UI, 테스트와 웹 데모까지 단독 설계·구현했습니다.',
    tech: ['Electron 45', 'React 19', 'TypeScript 5.9', 'Vite 7', 'Node Test Runner'],
    metrics: [
      {
        label: '반복 코드 실행',
        before: '"코드 실행 · 결과 있음" 14줄 나열',
        after: '화면 조작·파일·명령 의미 분해 + 연속 접기',
      },
      {
        label: '지침과 설정',
        before: '빈 설정 반복 + <app-context> XML 노출',
        after: '지침 분류·태그 제거, 턴별 최신 설정 1건 정리',
      },
      {
        label: '정보 전달 추적',
        before: '호출 계층과 모델 입력 포함 여부 불분명',
        after: 'ID 일치 기반 Input·Work·Output + → 모델 추적',
      },
    ] satisfies ProjectMetric[],
    outcomes: [
      '원본 로그 파일을 수정하지 않는 읽기 전용 스냅샷 파서 구현',
      '이야기 · 흐름도 · 타임라인 · 원본 4개 목적별 뷰어 및 웹 데모 배포',
      '파서·의미 요약·시각화·데모 무결성 회귀 테스트 31건 통과',
    ],
  },
  roadmap: [
    {
      step: '01',
      title: '추상화와 모듈화',
      summary: '단일 규칙 목록을 UI·파일·셸·스크립트별 플러그인형 해석 어댑터로 분리합니다.',
    },
    {
      step: '02',
      title: '과감한 숨기기와 계층화',
      summary: '기본 화면에는 의도·결정·결과 뼈대만 남기고 반복 세부는 한 단계 더 깊이 접어둡니다.',
    },
    {
      step: '03',
      title: '시각화 고도화',
      summary: '텍스트 나열을 줄이고 작업 비중·병렬 협업·정보 전달 흐름을 직관적인 그래픽으로 강화합니다.',
    },
    {
      step: '04',
      title: '철학 가설 검증과 확장',
      summary: '단일 채팅을 넘어 관찰 경험의 학습 전이를 검증하며 다중 세션과 실행 비교로 넓힙니다.',
    },
  ] satisfies RoadmapStep[],
}
