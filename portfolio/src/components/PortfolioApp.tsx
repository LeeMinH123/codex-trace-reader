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
            <a href="#philosophy">철학</a>
            <a href="#project">프로젝트</a>
            <a href="#demo">데모</a>
            <a href="#roadmap">확장 방향</a>
            <a href={githubUrl} target="_blank" rel="noreferrer" className="pf-nav-ext">
              GitHub ↗
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="pf-hero">
          <div className="pf-container-narrow pf-hero-inner">
            <p className="pf-eyebrow">{nickname} · Portfolio</p>
            <h1>{tagline}</h1>
            <p className="pf-lead">{intro}</p>

            <div className="pf-interest-pills" aria-label="핵심 관심 영역">
              {interests.map((item) => (
                <span key={item.title} className="pf-interest-pill" title={item.description}>
                  <small>{item.basis}</small>
                  <strong>{item.title}</strong>
                </span>
              ))}
            </div>

            <div className="pf-hero-actions">
              <a href="#philosophy" className="button primary pf-cta-link">
                설계 철학 보기
              </a>
              <a href="#demo" className="button secondary pf-cta-link">
                라이브 데모 체험
              </a>
              <a href={githubUrl} target="_blank" rel="noreferrer" className="quiet pf-cta-link">
                GitHub ↗
              </a>
            </div>
          </div>
        </section>

        <section id="philosophy" className="pf-section pf-section-tinted">
          <div className="pf-container-narrow pf-stack-lg">
            <div className="pf-section-head">
              <p className="pf-eyebrow">Design Philosophy</p>
              <h2>관찰이 곧 더 나은 판단과 위임으로 이어진다</h2>
              <p className="pf-sublead">
                도구와 분야가 달라져도, 복잡한 실행을 사람이 이해하고 검증할 수 있게 만드는 기준은 같습니다.
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
                  원문 에세이 보기 (docs/product-philosophy.md) ↗
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
              <p className="pf-eyebrow">Featured Work · Case 01</p>
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
                <dt>결과</dt>
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
              <h3>핵심 개선</h3>
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
                <a href="#demo" className="pf-inline-link">라이브 데모 보기 ↓</a>
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
              <p className="pf-eyebrow">Interactive Demo · Case 01</p>
              <h2>트레이스 뷰어 체험하기</h2>
              <p className="pf-sublead">
                샘플 기록으로 <strong>이야기 · 흐름도 · 타임라인 · 원본</strong> 전환과 <code>→ 모델</code> 입력 추적을 확인할 수 있습니다.
              </p>
            </div>

            <DemoWorkbench />
          </div>
        </section>

        <section id="roadmap" className="pf-section">
          <div className="pf-container-narrow pf-stack-lg">
            <div className="pf-section-head">
              <p className="pf-eyebrow">Evolution & Direction</p>
              <h2>다음 단계와 확장 방향</h2>
              <p className="pf-sublead">
                지금의 구조를 다듬어 더 간결한 계층과 범용 어댑터로 발전시키고, 다른 실행 도메인으로 확장할 계획입니다.
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
            <strong>{nickname}</strong>
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
