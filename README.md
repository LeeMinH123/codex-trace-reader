# Codex 트레이스 리더

**Codex가 수행한 작업을 개요에서 훑고, 관심 있는 행동의 입력·결과·원본 기록까지 따라가는 Windows용 로컬 뷰어입니다.** 기록의 순서와 확인된 연결을 표시하고, 길게 기록된 지침이나 도구 결과는 별도 읽기 화면에서 탐색할 수 있습니다. 브라우저에서는 샘플 기록을 체험할 수 있습니다. [웹 데모](https://leeminh123.github.io/codex-trace-reader/)

- 왜 이 제품을 만드는지, 기록으로 어디까지 판단할 수 있는지 살펴봅니다. [제품 철학](docs/product-philosophy.md)
- 지원 범위, 데이터 계약, 화면 요구사항과 수용 기준을 확인합니다. [제품 요구사항](docs/prd.md)

## 시작하기

로컬 데스크톱 앱은 Windows와 Node.js 22.12.0 이상이 필요합니다. 세션 기록은 바로 열 수 있고, 상세 번들을 변환할 때는 해당 기록을 생성한 버전의 `codex.exe`가 필요합니다.

```powershell
git clone https://github.com/LeeMinH123/codex-trace-reader.git
cd codex-trace-reader
npm ci
npm run dev
```

프로덕션 빌드로 실행하려면 다음 명령을 사용합니다.

```powershell
npm run build
npm start
```

## 기록 읽기

1. **채팅을 엽니다.** 시작 화면의 **최근 채팅**에서 제목·첫 요청·날짜로 찾습니다. 다른 위치에 저장한 기록은 **파일 직접 열기**에서 `rollout-*.jsonl`을 선택합니다.
2. **작업 개요에서 구간을 고릅니다.** 요청을 선택하고 **구간 읽기** 또는 **첫 행동의 원본**을 누릅니다. 상단 **작업 개요**로 돌아오면 출발 위치가 복원됩니다.
3. **관심 있는 행동을 따라갑니다.** 이야기·흐름도·타임라인·원본을 전환해 같은 행동을 살펴봅니다. `Ctrl/Cmd+F`로 기록을 검색합니다.
4. **기록 근거를 확인합니다.** 상세의 **원본 근거 보기**에서 JSONL 줄과 위치를 엽니다. 확보한 본문, 파생 상태, 참조 위치는 각 유형으로 표시됩니다. 표시된 경우 **반환이 포함된 모델 입력**으로 이동할 수 있습니다.
5. **긴 본문은 넓게 읽습니다.** 오른쪽 상세에서 **넓게 읽기**를 누르면 긴 문단을 몇 문장씩 나눠 보여주고 번호 목록과 체크리스트를 항목별로 표시합니다. **목차**로 제목을 따라가거나 `Ctrl/Cmd+F`로 본문을 검색합니다. `Enter`와 `Shift+Enter`로 검색 결과를 오갑니다. 서식이 있는 본문은 **원문으로 읽기**에서 기록된 줄바꿈과 들여쓰기를 확인할 수 있습니다. `Esc`로 상세로 돌아갑니다.

| 보기 | 주로 확인하는 것 |
| --- | --- |
| **이야기** | 요청, 지침, 진행 단계, 반복 도구 호출, 답변 |
| **흐름도** | 모델·도구·하위 호출과 기록으로 확인된 반환 포함 관계 |
| **타임라인** | 행동의 시각, 지속 시간, 기록의 순서 |
| **원본** | 선택한 턴의 기록, 확보한 원시 JSONL, 파생 상태, 원시 참조 |

### 상세 트레이스 연결

대화 기록부터 열 수 있으며, 모델 요청에 포함된 항목이나 상세 도구 결과를 조사하려면 동일 채팅의 상세 트레이스를 연결합니다.

1. 관찰할 작업을 시작하거나 재개하기 전에 Codex 실행 환경에 `CODEX_ROLLOUT_TRACE_ROOT`를 설정합니다. 아래 값은 PowerShell에서 사용할 경로 예시입니다.
   ```powershell
   $env:CODEX_ROLLOUT_TRACE_ROOT = 'C:\codex-traces'
   ```
2. 트레이스 리더에서 채팅을 엽니다. 앱은 설정된 기록 위치와 Windows 로컬 `codex-rollout-traces`에서 같은 채팅의 번들을 찾습니다. 다른 위치의 번들은 검색 위치를 지정하거나 폴더를 직접 추가합니다.
3. **상세**나 **이 턴의 실행 보기**로 이동합니다. 처음 변환할 때 기록을 생성한 `codex.exe`를 확인합니다. 앱은 데스크톱 스키마 3 상세 번들을 지원합니다. [Codex Rollout Trace](https://github.com/openai/codex/blob/main/codex-rs/rollout-trace/README.md)

### 자주 만나는 상태

| 화면에 보이는 상태 | 확인할 것 |
| --- | --- |
| **상세 트레이스가 미확인** | 해당 작업을 시작하거나 재개할 때 상세 기록이 켜져 있었는지, 번들 폴더가 어느 위치에 있는지 확인합니다. 확보한 채팅 기록은 대화 보기에서 읽을 수 있습니다. |
| **변환 실패** | 선택한 번들의 기록에 사용한 `codex.exe`와 상세 스키마를 확인합니다. 갱신에 실패했을 때는 확보한 이전 스냅샷과 확인 시점이 표시될 수 있습니다. |
| **이전 기록 일부 미확인** | 선택한 rollout의 `history_base`가 가리키는 이전 파일 또는 경계가 확인되지 않은 상태입니다. 같은 채팅의 rollout을 찾거나 파일을 추가합니다. |
| **여기까지 기록됨 / 원시 본문 미확인** | 캡처된 범위까지만 표시된 상태입니다. 확인 가능한 JSONL 줄 또는 파생 상태·참조 위치는 상세에서 살펴볼 수 있습니다. |

데스크톱 앱은 등록한 기록을 로컬에서 읽기 전용으로 처리합니다. 웹 데모는 샘플 기록을 사용합니다. [구현 경계와 권한 모델](docs/prd.md)

## 웹 데모와 개발

정적 웹 데모를 로컬에서 미리 보거나 빌드합니다.

```powershell
npm run dev:portfolio
npm run build:portfolio
```

생성된 `dist-portfolio/`를 정적 호스팅에 올릴 수 있습니다. GitHub Pages에서 **Source → GitHub Actions**를 선택하면 `main`·`master` 푸시 또는 수동 실행으로 테스트와 정적 빌드, 배포를 수행합니다. [Pages 배포 워크플로](.github/workflows/deploy-pages.yml) · [GitHub Pages 게시 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

변경을 검증하는 명령은 다음과 같습니다. [PR 검사 워크플로](.github/workflows/pr-checks.yml)

```powershell
npm test
npm run typecheck
npm run build
npm run build:portfolio
```

| 경로 | 역할 |
| --- | --- |
| [`src/main/`](src/main/) | 로컬 소스 탐색, 파서·reducer, 읽기 전용 IPC |
| [`src/preload/`](src/preload/) · [`src/shared/`](src/shared/) | Renderer에 노출되는 인터페이스와 데이터 계약 |
| [`src/renderer/`](src/renderer/) | 개요와 네 가지 보기, 검색과 상세 읽기 화면 |
| [`portfolio/`](portfolio/) · [`tests/`](tests/) | 정적 데모와 파서·보기 회귀 테스트 |

## 라이선스

[MIT License](LICENSE) · Maintainer [LeeMinH123](https://github.com/LeeMinH123) · [GitHub Issues](https://github.com/LeeMinH123/codex-trace-reader/issues)
