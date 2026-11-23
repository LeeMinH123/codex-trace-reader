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
  tagline: '복잡한 실행을 사실 그대로 구조화해,\n사람의 이해와 판단을 돕는 도구를 만듭니다',
  intro:
    '시스템이 더 많은 일을 대신 수행할수록, 결과를 요약해 주는 화면보다 과정과 근거를 직접 살필 수 있는 도구가 중요해집니다. 관찰·구조화·시각화의 원칙을 바탕으로 다양한 영역의 도구를 실험하고 구현합니다.',
  githubUrl: 'https://github.com/LeeMinH123',
  repoUrl: 'https://github.com/LeeMinH123/codex-trace-reader',
  pagesUrl: 'https://leeminh123.github.io/codex-trace-reader/',
  philosophyDocUrl: 'https://github.com/LeeMinH123/codex-trace-reader/blob/main/docs/product-philosophy.md',
  prdDocUrl: 'https://github.com/LeeMinH123/codex-trace-reader/blob/main/docs/prd.md',
  interests: [
    {
      title: '이해와 위임',
      description: '실행 범위와 검증 결과를 직접 확인하며 개입 시점을 결정하는 구조를 탐구합니다.',
      basis: 'Mental Model',
    },
    {
      title: '구조화와 점진적 공개',
      description: '방대한 실행 기록을 계층으로 압축하되 원본 근거까지 내려갈 경로를 유지합니다.',
      basis: 'Abstraction',
    },
    {
      title: '관찰 중심 시각화',
      description: '기록에 남은 사실과 규칙 기반 요약, 확인할 수 없는 영역을 UI에서 엄격히 가릅니다.',
      basis: 'Observability',
    },
  ] satisfies InterestItem[],
  philosophyPillars: [
    {
      title: '이해가 판단과 위임을 결정한다',
      description: '목표와 제약을 정하는 사람이 시스템의 작동 원리를 직접 살필 수 있을 때, 더 정확한 위임과 개입이 가능해집니다.',
    },
    {
      title: '압축하되 근거는 지우지 않는다',
      description: '반복 과정을 의미 단위로 묶어 흐름을 한눈에 보여주고, 원할 때는 개별 실행과 원본 기록까지 즉시 내려갑니다.',
    },
    {
      title: '관찰과 해석을 섞지 않는다',
      description: '추측성 요약을 사실처럼 덮지 않고, 기록에서 실제로 확인된 식별자·경로·상태만 구조화해 연결합니다.',
    },
  ] satisfies PhilosophyPillar[],
  flowSteps: [
    {
      step: 'Observe',
      title: '원시 기록과 사실',
      detail: '로그 · 이벤트 · 상태 스냅샷',
    },
    {
      step: 'Structure',
      title: '규칙 기반 구조화',
      detail: '흐름 · 계층 · 확인된 연결',
    },
    {
      step: 'Decide',
      title: '사람의 탐색과 판단',
      detail: '직접 질문 · 검증 · 개입',
    },
  ] satisfies FlowStep[],
  principles: [
    {
      principle: '구조화',
      application: '확보된 기록의 순서, 실행 주체, 입력과 결과, 확인된 연결만 재구성합니다.',
    },
    {
      principle: '시각화',
      application: '단계 비중 막대, 흐름도, 타임라인으로 전체 맥락과 동시성을 드러냅니다.',
    },
    {
      principle: '점진적 공개',
      application: '요약 개요에서 개별 실행 상세와 원본 데이터까지 단계적으로 펼칩니다.',
    },
    {
      principle: '접근의 개방성',
      application: '접어 둔 맥락·반복 실행과 누락·잘림 같은 확인 한계를 숨기지 않습니다.',
    },
    {
      principle: '관찰과 해석의 구분',
      application: '원시 값과 규칙 기반 표현을 구별하며, 상세 화면에서 원문을 언제든 대조합니다.',
    },
    {
      principle: '탐색 자율성',
      application: '오류나 특정 질문 없이도 성공 사례와 일상 기록의 어느 지점에서나 시작합니다.',
    },
  ] satisfies PrincipleRow[],
  project: {
    name: 'Codex 트레이스 리더 (codex-trace-reader)',
    subtitle: 'AI 에이전트 실행 기록 위에 위의 관찰·구조화 철학을 처음 적용한 데스크톱 뷰어',
    period: 'v0.1.0',
    problem:
      '에이전트의 세션 로그(`rollout-*.jsonl`)와 상세 트레이스 번들(`trace-*`)은 한 요청에도 100개 이상의 이벤트와 원시 XML 지침이 뒤섞여, 어떤 지침이 들어갔고 결과가 다음 입력에 전달됐는지 한눈에 읽기 어려웠습니다.',
    role:
      '철학 정립(`docs/product-philosophy.md`)과 요구사항 정의(`docs/prd.md`), 파싱 엔진, 규칙 기반 요약기, 4종 뷰어 UI, 테스트와 웹 데모까지 전 과정을 단독 설계·구현했습니다.',
    tech: ['Electron 45', 'React 19', 'TypeScript 5.9', 'Vite 7', 'Node Test Runner'],
    metrics: [
      {
        label: '반복 실행 해석',
        before: '"코드 실행 · 결과 있음" 14줄 나열',
        after: 'UI·파일·명령 의미 분해 + 연속 반복 접기',
      },
      {
        label: '지침과 환경 설정',
        before: '빈 설정 반복 + <app-context> 원시 XML 노출',
        after: '지침 분류·태그 정리, 최신 설정 1건으로 통합',
      },
      {
        label: '정보 전달 추적',
        before: '호출 계층과 입력 포함 여부 불분명',
        after: 'ID 일치 기반 Input·Work·Output + → 모델 추적',
      },
    ] satisfies ProjectMetric[],
    outcomes: [
      '원본 로그 파일을 수정하지 않는 읽기 전용 스냅샷 파서 구현',
      '이야기 · 흐름도 · 타임라인 · 원본 4개 목적별 뷰어 및 웹 데모 구축',
      '파서·의미 요약·시각화·데모 무결성 회귀 테스트 31건 통과',
    ],
  },
  roadmap: [
    {
      step: '01',
      title: '추상화와 모듈화',
      summary: '단일 규칙 목록에 결합된 해석 로직을 도메인·도구별 어댑터 구조로 분리해 확장성을 높입니다.',
    },
    {
      step: '02',
      title: '계층적 숨기기와 밀도 제어',
      summary: '기본 화면에는 의도·결정·결과 뼈대만 남기고 세부 문맥은 더 깊이 접어둘 수 있도록 계층을 정제합니다.',
    },
    {
      step: '03',
      title: '직관적인 시각화 언어',
      summary: '텍스트 나열 대신 단계 비중, 병렬 협업, 정보 전달 경로를 적은 텍스트로 읽히는 시각 언어로 다듬습니다.',
    },
    {
      step: '04',
      title: '새로운 도메인으로의 전이',
      summary: '단일 에이전트 뷰어에서 검증한 구조화·근거 표시 원칙을 다중 에이전트, 워크플로우, 일반 개발 도구 관찰 영역으로 확장합니다.',
    },
  ] satisfies RoadmapStep[],
}
