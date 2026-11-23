import { DemoWorkbench } from './DemoWorkbench'
import { PORTFOLIO_PROFILE } from './profile'

export function PortfolioApp() {
  const { nickname, tagline, intro, githubUrl, repoUrl, interests, project, principles } = PORTFOLIO_PROFILE

  return (
    <div className="pf-page">
      <header className="pf-nav-wrap">
        <div className="pf-container pf-nav">
          <a href="#top" className="pf-brand">
            <span className="brand-icon" aria-hidden="true"><i /><i /><i /></span>
            <span>{nickname}</span>
          </a>
          <nav className="pf-links" aria-label="페이지 탐색">
            <a href="#about">소개 · 관심 분야</a>
            <a href="#project">대표 프로젝트</a>
            <a href="#demo">라이브 데모</a>
            <a href="#principles">설계 철학</a>
            <a href={githubUrl} target="_blank" rel="noreferrer" className="pf-nav-ext">
              GitHub ↗
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section id="about" className="pf-hero">
          <div className="pf-container pf-hero-inner">
            <p className="pf-eyebrow">공학작문과 발표 · 포트폴리오</p>
            <h1>{tagline}</h1>
            <p className="pf-lead">{intro}</p>

            <div className="pf-hero-actions">
              <a href="#demo" className="button primary pf-cta-link">
                라이브 웹 데모 바로 체험하기
              </a>
              <a href={repoUrl} target="_blank" rel="noreferrer" className="button secondary pf-cta-link">
                소스 코드 저장소 ({nickname}/codex-trace-reader) ↗
              </a>
              <a href={githubUrl} target="_blank" rel="noreferrer" className="quiet pf-cta-link">
                GitHub 프로필 ↗
              </a>
            </div>

            <div className="pf-interests" aria-label="현재 관심 분야">
              {interests.map((item) => (
                <article key={item.title} className="pf-interest-card">
                  <small>{item.basis}</small>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="project" className="pf-section">
          <div className="pf-container pf-section-grid">
            <div className="pf-section-head">
              <p className="pf-eyebrow">대표 프로젝트 · {project.period}</p>
              <h2>{project.name}</h2>
              <p className="pf-sublead">{project.subtitle}</p>
            </div>

            <div className="pf-case-cards">
              <article className="pf-case-block">
                <h3>문제 정의</h3>
                <p>{project.problem}</p>
              </article>
              <article className="pf-case-block">
                <h3>역할</h3>
                <p>{project.role}</p>
              </article>
              <article className="pf-case-block">
                <h3>사용 기술</h3>
                <ul className="pf-tech-list">
                  {project.tech.map((tech) => (
                    <li key={tech}>{tech}</li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="pf-compare-panel">
              <h3>구조 개선 및 결과</h3>
              <div className="pf-metrics-table">
                {project.metrics.map((metric) => (
                  <div key={metric.label} className="pf-metric-row">
                    <div className="pf-metric-name">{metric.label}</div>
                    <div className="pf-metric-before">
                      <span>Before</span>
                      <p>{metric.before}</p>
                    </div>
                    <div className="pf-metric-after">
                      <span>After</span>
                      <p>{metric.after}</p>
                    </div>
                  </div>
                ))}
              </div>
              <ul className="pf-outcomes">
                {project.outcomes.map((outcome) => (
                  <li key={outcome}>{outcome}</li>
                ))}
              </ul>
              <div className="pf-project-links">
                <a href="#demo" className="pf-inline-link">라이브 데모에서 직접 확인 ↓</a>
                <a href={repoUrl} target="_blank" rel="noreferrer" className="pf-inline-link">
                  전체 소스 코드 · PRD · 제품 철학 문서 보기 ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="pf-section pf-section-demo">
          <div className="pf-container">
            <div className="pf-demo-intro">
              <div>
                <p className="pf-eyebrow">Interactive Web Demo</p>
                <h2>실제 트레이스 뷰어 UI 체험하기</h2>
              </div>
              <p className="pf-sublead">
                Electron 앱에서 동작하는 <strong>이야기 · 흐름도 · 타임라인 · 원본 · 상세 패널</strong> 컴포넌트를
                정적 웹으로 그대로 구성했습니다. 추천 탐색 칩이나 타임라인 항목을 눌러 Input · Work · Output 흐름을 확인해 보세요.
              </p>
            </div>

            <DemoWorkbench />
          </div>
        </section>

        <section id="principles" className="pf-section">
          <div className="pf-container">
            <div className="pf-section-head">
              <p className="pf-eyebrow">Product Philosophy</p>
              <h2>제품을 관통하는 6대 설계 원칙</h2>
              <p className="pf-sublead">
                AI 분석을 덧씌워 원인을 단정하지 않고, 기록에서 확인된 사실과 규칙 기반 표현을 구별해 사용자의 위임 판단을 돕습니다.
              </p>
            </div>

            <div className="pf-principles-grid">
              {principles.map((item, idx) => (
                <article key={item.principle} className="pf-principle-item">
                  <span className="pf-principle-num">0{idx + 1}</span>
                  <h3>{item.principle}</h3>
                  <p>{item.application}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="pf-footer">
        <div className="pf-container pf-footer-inner">
          <div>
            <strong>{nickname}</strong> · Codex Trace Reader Portfolio
          </div>
          <div className="pf-footer-links">
            <a href={githubUrl} target="_blank" rel="noreferrer">GitHub ({nickname})</a>
            <a href={repoUrl} target="_blank" rel="noreferrer">Repository</a>
            <a href="#top">맨 위로 ↑</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
