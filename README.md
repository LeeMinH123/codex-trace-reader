# Codex 트레이스 리더 (`codex-trace-reader`)

> **핵심 키워드**: 로컬 트레이스 뷰어 · 근거 중심 관찰 · 규칙 기반 정보 구조화

AI 에이전트가 남긴 방대한 실행 기록(`rollout-*.jsonl`, `trace-*`)을 **AI 요약 없이** 원시 근거와 규칙 기반 구조화로 읽어내는 로컬 Electron 데스크톱 앱이자, GitHub Pages 정적 웹 데모 포트폴리오입니다.

- **라이브 웹 데모 · 포트폴리오**: <https://leeminh123.github.io/codex-trace-reader/> *(또는 루트 사이트 <https://leeminh123.github.io/>)*
- **소스 코드 저장소**: <https://github.com/LeeMinH123/codex-trace-reader>

---

## 1. 문서 개요

| 항목 | 내용 |
| --- | --- |
| **문서 목표** | `codex-trace-reader`의 설계 배경, 설치 방법, 단계별 사용 흐름, 웹 데모 빌드·배포 및 문제 해결 절차를 안내합니다. |
| **예상 독자** | Codex 실행 기록을 점검·관찰하려는 개발자 및 AI 에이전트에게 작업을 위임하는 사용자 |
| **사전 배경 지식** | Codex 데스크톱/CLI의 기본 사용 경험이 있으면 충분하며, 내부 트레이스 스키마를 미리 알 필요는 없습니다. |
| **관련 설계 문서** | [제품 철학 (`docs/product-philosophy.md`)](docs/product-philosophy.md) · [제품 요구사항 (`docs/prd.md`)](docs/prd.md) |
| **문서 변경 이력** | `v0.1.0` (2026-11-23) — 초판 작성, 4종 읽기 뷰어 및 정적 웹 데모 배포 가이드 반영 |
| **문의 및 저작권** | [GitHub Issues](https://github.com/LeeMinH123/codex-trace-reader/issues) · Copyright © 2026 LeeMinH123 |

---

## 2. 서비스 개요

AI 에이전트가 대부분의 구현을 수행하는 환경에서는 사람의 판단과 위임 범위가 더 중요해집니다. 하지만 평면 JSONL 로그는 한 턴에도 100여 개의 내부 이벤트, XML 지침, 반복 호출이 뒤섞여 있어 **"어떤 지침이 처음부터 들어갔는가"**, **"어느 도구의 반환이 다음 모델 입력에 포함됐는가"**를 파악하기 어렵습니다.

`codex-trace-reader`는 다음 문제와 기준을 해결하기 위해 설계되었습니다.

- **관찰과 해석의 구분**: 기록에 실제로 남은 값, 뷰어가 규칙으로 정리한 이름·묶음, 확인할 수 없는 영역을 UI에서 엄격히 분리합니다.
- **인지부채·의도부채 완화**: 턴(요청) 단위로 `받은 내용 · 작업 과정 · 돌려준 결과(Input · Work · Output)`를 요약하되, 클릭 한 번으로 원시 JSON 근거까지 내려갑니다.
- **로컬 퍼스트 읽기 전용 처리**: 원본 기록 파일을 수정하거나 외부로 전송하지 않고, 임시 스냅샷으로만 읽어 안전하게 검증합니다.

### 주요 기능

- **최근 채팅 탐색 및 멀티 소스 연결**: 로컬 Codex `sessions`의 최근 채팅을 검색해 열고, 같은 채팅의 이전 `rollout-*.jsonl` 및 `trace-*` 상세 번들을 함께 연결합니다.
- **4가지 목적별 뷰어 전환**:
  - **이야기(Story)**: 지침/환경 설정 정리, 진행 메시지 챕터별 작업 비중 막대, 연속 동일 단계 접기, `→ 모델` 입력 추적
  - **흐름도(FlowGraph)**: 모델 호출 → 도구 → 하위 도구(`code_cells`) → 다음 모델 입력 전달 관계를 SVG 연결선으로 시각화
  - **타임라인(Waterfall)**: 상대 시간(`+0s`)과 절대 시각 전환, 진행 메시지 마일스톤 행 및 동시·순차 소요 시간 표시
  - **원본(Raw)**: 필터나 요약 규칙을 거치지 않은 전체 원시 이벤트 순서 확인
- **규칙 기반 의미 해석**: 반복되는 `코드 실행` 스크립트에서 Playwright/Computer Use 화면 조작, 파일 읽기/수정, 명령 실행 대상을 추출하고, 지침 XML 태그를 분류·중복 제거합니다.

---

## 3. 변경 로그 요약

### `v0.1.0` (2026-11-23)
- 로컬 `rollout-*.jsonl` 파서(`history_base` 선행 구간 복원 포함) 및 스키마 3 상세 번들(`codex debug trace-reduce`) 파서 구현
- `Input · Work · Output` 탐색 구조, 맥락 유지 검색, `이야기 · 흐름도 · 타임라인 · 원본` 4개 뷰어 구현
- 코드 실행 의미 해석기(`describeCodeExecution`), 지침 XML 분류·설정 중복 제거, 챕터 비율 막대 및 흐름도 내장 타일 UI 적용
- 브라우저에서 체험 가능한 정적 포트폴리오 및 라이브 웹 데모(`portfolio/`, `npm run build:portfolio`) 추가

---

## 4. 사전 준비 사항 및 설치 방법

### 시스템 요구사항
- **운영체제**: Windows *(로컬 Codex 세션/트레이스 탐색은 Windows 로컬 경로 기준이며, 웹 데모 빌드는 OS 무관)*
- **Node.js**: `22.12.0` 이상
- **상세 트레이스 변환 시**(선택): 해당 번들을 기록한 버전의 `codex.exe`

### 설치

```powershell
git clone https://github.com/LeeMinH123/codex-trace-reader.git
cd codex-trace-reader
npm ci
```

---

## 5. 퀵스타트 가이드 (사용법)

### A. 로컬 데스크톱 앱 실행

1. 개발 모드로 앱을 실행합니다. *(Electron을 처음 실행할 때 공식 Windows 실행 파일을 내려받습니다.)*
   ```powershell
   npm run dev
   ```
2. 프로덕션 빌드를 검증하고 실행하려면 아래 순서로 실행합니다.
   ```powershell
   npm run build
   npm start
   ```

#### 앱 화면 사용 순서
1. **채팅 열기**: 첫 화면 **최근 채팅**에서 제목·첫 요청·날짜로 검색해 열거나, 다른 경로의 `rollout-*.jsonl`을 **파일 직접 열기**로 선택합니다.
2. **상세 트레이스 연결**(선택): 채팅을 열면 `CODEX_ROLLOUT_TRACE_ROOT`와 로컬 `codex-rollout-traces`에서 일치하는 번들을 찾습니다. 상세 턴 이동 시 기록에 쓰인 `codex.exe`를 최초 1회 확인한 뒤 `trace-reduce`로 스냅샷을 읽습니다.
3. **흐름 살펴보기**: 왼쪽 **요청 목차**에서 질문을 고르고, 상단 스위치(`이야기` · `흐름도` · `타임라인` · `원본`)와 **검색**(`Ctrl/Cmd + F`)으로 맥락을 훑습니다.
4. **근거 추적하기**: 행동을 클릭하면 오른쪽 상세 패널에 **받은 값 · 실행 상태 · 돌아온 값 · 원시 기록 근거**가 열립니다. **`→ 모델`** 링크를 누르면 해당 반환값이 실제로 포함된 다음 모델 요청으로 이동해 강조 표시됩니다.

---

### B. 웹 포트폴리오 · 라이브 데모 실행 및 GitHub Pages 배포

서버 백엔드 없이 브라우저에서 샘플 트레이스를 체험할 수 있는 **정적 웹 데모**를 별도로 빌드할 수 있습니다.

1. 로컬 브라우저에서 포트폴리오 데모 미리보기:
   ```powershell
   npm run dev:portfolio
   ```
2. 정적 배포 산출물(`dist-portfolio/`) 생성:
   ```powershell
   npm run build:portfolio
   ```
   생성된 `dist-portfolio/` 폴더에는 순수 정적 파일(`index.html`, `assets/`, `.nojekyll`)만 포함됩니다.
3. GitHub Pages 배포 방법:
   - **GitHub Actions 자동 배포(권장)**: 저장소 `Settings → Pages → Source`를 **GitHub Actions**로 설정한 뒤 `main` 또는 `master` 브랜치에 push하면 [deploy-pages.yml](.github/workflows/deploy-pages.yml)이 테스트와 정적 빌드를 거쳐 자동 배포합니다.
   - **수동 정적 업로드**: `npm run build:portfolio`로 만든 `dist-portfolio/` 안의 내용물만 정적 호스팅(또는 `gh-pages` 브랜치 / `<user>.github.io` 저장소)에 올려 바로 서빙할 수 있습니다.

---

## 6. 문제 해결 단계 (Troubleshooting)

| 증상 | 원인 및 해결 방법 |
| --- | --- |
| **상세 트레이스 번들이 자동으로 안 보임** | 상세 트레이스는 Codex 실행 전 `CODEX_ROLLOUT_TRACE_ROOT` 환경 변수가 켜져 있어야 기록됩니다. 번들이 다른 폴더에 있다면 왼쪽 하단 **검색 위치 선택** 또는 **폴더 직접 추가**로 지정하세요. |
| **번들 변환 실패 또는 버전 불일치** | 스키마 3 매니페스트에는 실행 파일 지문이 없어 사용자가 번들 생성 당시의 `codex.exe`를 직접 지정해야 합니다. 다른 버전의 실행 파일을 고른 경우 실행 파일 선택을 다시 지정하세요. |
| **`이전 기록 일부 미확인` / `여기까지 기록됨` 안내** | `history_base`가 참조하는 이전 rollout이 아직 등록되지 않았거나(`같은 채팅의 rollout 찾기` 실행), 세션 닫힘 이벤트 없이 끝난 스냅샷입니다. 누락이 아니라 확인 가능한 기록 범위의 한계를 사실대로 표시한 것입니다. |
| **코드 변경 후 검증** | 아래 4개 명령을 개별 실행해 파서 테스트, 타입 검사, 앱·포트폴리오 빌드를 모두 확인할 수 있습니다. |

```powershell
npm test
npm run typecheck
npm run build
npm run build:portfolio
```

---

## 7. 프로젝트 구조 및 심화 자료

```text
├── .github/workflows/
│   └── deploy-pages.yml         GitHub Pages 정적 빌드·배포 워크플로우
├── docs/
│   ├── product-philosophy.md    제품 철학 문서
│   └── prd.md                   제품 요구사항 문서 (PRD)
├── portfolio/                   정적 웹 포트폴리오 및 브라우저 라이브 데모
│   ├── index.html
│   └── src/
│       ├── main.tsx             포트폴리오 엔트리
│       ├── components/          PortfolioApp, DemoWorkbench
│       ├── data/                프로필(profile) 및 데모 스냅샷(demo-data)
│       └── styles/              포트폴리오 전용 CSS
├── src/
│   ├── main/
│   │   ├── index.ts             Electron 창, 파일 선택 다이얼로그, IPC 검증
│   │   ├── sources/
│   │   │   ├── workspace.ts     작업공간 상태 및 소스 조합
│   │   │   ├── files.ts         읽기 전용 파일 입출력 유틸리티
│   │   │   ├── session/         최근 채팅 및 rollout 파일 탐색
│   │   │   └── trace/           상세 번들 발견, reducer 실행, 턴 매핑
│   │   └── records/
│   │       ├── core/            공통 JSON·타임라인 헬퍼
│   │       ├── parsing/         rollout·세션·트레이스 파서 및 근거 추출
│   │       └── reading/         지침 분류·코드 실행·대화 미리보기 요약
│   ├── preload/                 Renderer에 노출하는 최소 읽기 전용 IPC 브리지
│   ├── renderer/
│   │   └── src/
│   │       ├── App.tsx          루트 화면 상태 및 탐색 조율
│   │       ├── model/           챕터, IWO, 그래프, 타임라인, 검색 모델
│   │       ├── components/
│   │       │   ├── common/      시간 포맷 및 턴 링크
│   │       │   ├── layout/      최근 채팅, 좌측 목차, 트레이스 안내
│   │       │   ├── views/       이야기·흐름도·타임라인 뷰 및 검색 툴바
│   │       │   └── Inspector.tsx  Input·Work·Output 상세 패널
│   │       └── styles/          공통 테마 및 읽기 흐름 CSS
│   └── shared/                  Main · Renderer · Portfolio 공유 타입 계약
├── tests/
│   ├── records/                 세션·트레이스 파서 및 의미 요약 회귀 테스트
│   ├── views/                   IWO·챕터·탐색·시각화 모델 테스트
│   └── portfolio/               웹 데모 데이터 및 뷰어 변환 무결성 테스트
└── vite.portfolio.config.ts     정적 포트폴리오 전용 Vite 설정
```

### 참고 자료
- [제품 철학 (`docs/product-philosophy.md`)](docs/product-philosophy.md)
- [제품 요구사항 (`docs/prd.md`)](docs/prd.md)
- [OpenAI Codex Rollout Trace 구조](https://github.com/openai/codex/blob/main/codex-rs/rollout-trace/README.md)

---

## 8. 유지 관리자 및 라이선스 정보

- **유지 관리자 (Maintainer)**: `LeeMinH123` (<https://github.com/LeeMinH123>)
- **저장소**: <https://github.com/LeeMinH123/codex-trace-reader>
- **라이선스 및 공개 상태**: 현재 [package.json](package.json) 기준 `"private": true`로 관리되는 개인 학습·연구용 프로젝트입니다. 별도 오픈소스 라이선스 파일이 추가되기 전까지 무단 복제·재배포를 제한하며, 코드 참고나 협업 문의는 저장소 Issue를 통해 연락해 주세요.
