import { Fragment } from 'react'
import { DemoWorkbench } from './DemoWorkbench'
import { PORTFOLIO_PROFILE } from '../data/profile'

export function PortfolioApp() {
  const {
    nickname,
    tagline,
    intro,
    githubUrl,
    repoUrl,
    philosophyDocUrl,
    prdDocUrl,
    interests,
    philosophyPillars,
    flowSteps,
    principles,
    project,
    roadmap,
  } = PORTFOLIO_PROFILE

  return (
    <div className="pf-page">
      <header className="pf-nav-wrap">
        <div className="pf-container pf-nav">
          <a href="#top" className="pf-brand">
            <span className="brand-icon" aria-hidden="true"><i /><i /><i /></span>
            <span>{nickname}</span>
          </a>
          <nav className="pf-links" aria-label="페이지 탐색">
            <a href="#philosophy">제품 철학</a>
            <a href="#project">v0.1.0</a>
            <a href="#demo">라이브 데모</a>
            <a href="#roadmap">앞으로의 방향</a>
            <a href={githubUrl} target="_blank" rel="noreferrer" className="pf-nav-ext">
              GitHub ↗
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="pf-hero">
          <div className="pf-container-narrow pf-hero-inner">
            <p className="pf-eyebrow">공학작문과 발표 · 포트폴리오</p>
            <h1>{tagline}</h1>
            <p className="pf-lead">{intro}</p>

            <div className="pf-interest-pills" aria-label="현재 관심 분야">
              {interests.map((item) => (
                <span key={item.title} className="pf-interest-pill" title={item.description}>
                  <small>{item.basis}</small>
                  <strong>{item.title}</strong>
                </span>
              ))}
            </div>

            <div className="pf-hero-actions">
              <a href="#philosophy" className="button primary pf-cta-link">
                제품 철학 먼저 읽기
              </a>
              <a href="#demo" className="button secondary pf-cta-link">
                v0.1.0 라이브 데모 체험
              </a>
              <a href={repoUrl} target="_blank" rel="noreferrer" className="quiet pf-cta-link">
                GitHub ({nickname}) ↗
              </a>
            </div>
          </div>
        </section>

        <section id="philosophy" className="pf-section pf-section-tinted">
          <div className="pf-container-narrow pf-stack-lg">
            <div className="pf-section-head">
              <p className="pf-eyebrow">Product Philosophy · 왜 만드는가</p>
              <h2>관찰이 곧 더 나은 위임으로 이어진다</h2>
              <p className="pf-sublead">
                제품이 아직 초기 프로토타입인 만큼, 어떤 기능을 넣었는지보다 왜 이 문제가 중요하다고 보는지 먼저 적었습니다.
              </p>
            </div>

            <div className="pf-pillars-row">
              {philosophyPillars.map((pillar, idx) => (
                <article key={pillar.title} className="pf-pillar-item">
                  <span className="pf-num">0{idx + 1}</span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.description}</p>
                </article>
              ))}
            </div>

            <div className="pf-flow-diagram" aria-label="구조화 흐름 개념도">
              {flowSteps.map((step, idx) => (
                <Fragment key={step.step}>
                  {idx > 0 && <span className="pf-flow-arrow" aria-hidden="true">→</span>}
                  <div className="pf-flow-box">
                    <span className="pf-flow-tag">{step.step}</span>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </div>
                </Fragment>
              ))}
            </div>

            <div className="pf-subsection">
              <div className="pf-subhead-row">
                <h3>6가지 설계 원칙</h3>
                <a href={philosophyDocUrl} target="_blank" rel="noreferrer" className="pf-inline-link">
                  철학 전문 보기 (docs/product-philosophy.md) ↗
                </a>
              </div>
              <dl className="pf-principles-list">
                {principles.map((item) => (
                  <div key={item.principle} className="pf-principle-row">
                    <dt>{item.principle}</dt>
                    <dd>{item.application}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="project" className="pf-section">
          <div className="pf-container-narrow pf-stack-lg">
            <div className="pf-section-head">
              <div className="pf-head-badges">
                <span className="pf-version-badge">{project.period}</span>
              </div>
              <h2>{project.name}</h2>
              <p className="pf-sublead">{project.subtitle}</p>
            </div>

            <dl className="pf-spec-sheet">
              <div className="pf-spec-row">
                <dt>문제 정의</dt>
                <dd>{project.problem}</dd>
              </div>
              <div className="pf-spec-row">
                <dt>역할</dt>
                <dd>{project.role}</dd>
              </div>
              <div className="pf-spec-row">
                <dt>사용 기술</dt>
                <dd>
                  <ul className="pf-tech-list">
                    {project.tech.map((tech) => (
                      <li key={tech}>{tech}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div className="pf-spec-row">
                <dt>현재 결과</dt>
                <dd>
                  <ul className="pf-outcomes">
                    {project.outcomes.map((outcome) => (
                      <li key={outcome}>{outcome}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>

            <div className="pf-subsection">
              <h3>v0.1.0에서 먼저 바꾼 것</h3>
              <div className="pf-diff-list">
                {project.metrics.map((metric) => (
                  <div key={metric.label} className="pf-diff-row">
                    <strong>{metric.label}</strong>
                    <span className="pf-diff-before">{metric.before}</span>
                    <span className="pf-diff-arrow" aria-hidden="true">→</span>
                    <span className="pf-diff-after">{metric.after}</span>
                  </div>
                ))}
              </div>
              <div className="pf-project-links">
                <a href="#demo" className="pf-inline-link">아래 라이브 데모로 확인 ↓</a>
                <a href={repoUrl} target="_blank" rel="noreferrer" className="pf-inline-link">
                  소스 코드 (GitHub) ↗
                </a>
                <a href={prdDocUrl} target="_blank" rel="noreferrer" className="pf-inline-link">
                  요구사항 문서 (PRD) ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="pf-section pf-section-tinted">
          <div className="pf-container">
            <div className="pf-container-narrow pf-demo-intro">
              <p className="pf-eyebrow">Interactive Prototype · v0.1.0</p>
              <h2>현재 버전 직접 둘러보기</h2>
              <p className="pf-sublead">
                샘플 기록으로 <strong>이야기 · 흐름도 · 타임라인 · 원본</strong> 전환과 <code>→ 모델</code> 입력 추적을 체험할 수 있습니다.
              </p>
            </div>

            <DemoWorkbench />
          </div>
        </section>

        <section id="roadmap" className="pf-section">
          <div className="pf-container-narrow pf-stack-lg">
            <div className="pf-section-head">
              <p className="pf-eyebrow">Direction & Roadmap · 앞으로의 방향</p>
              <h2>초기 버전을 넘어 다음 단계로</h2>
              <p className="pf-sublead">
                v0.1.0은 기록을 읽기 전용으로 구조화하는 뼈대입니다. 다음 과제는 더 깊이 숨기고, 모듈화하고, 시각적으로 직관화하는 일입니다.
              </p>
            </div>

            <ol className="pf-roadmap-list">
              {roadmap.map((item) => (
                <li key={item.step} className="pf-roadmap-item">
                  <span className="pf-roadmap-step">{item.step}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="pf-footer">
        <div className="pf-container-narrow pf-footer-inner">
          <div>
            <strong>{nickname}</strong> · Codex Trace Reader Portfolio
          </div>
          <div className="pf-footer-links">
            <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
            <a href={repoUrl} target="_blank" rel="noreferrer">Repository</a>
            <a href={philosophyDocUrl} target="_blank" rel="noreferrer">Philosophy</a>
            <a href={prdDocUrl} target="_blank" rel="noreferrer">PRD</a>
            <a href="#top">맨 위로 ↑</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
