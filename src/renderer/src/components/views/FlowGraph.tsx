import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Turn } from '../../../../shared/reader'
import { formatTitleTally } from '../../model/reading-groups'
import type { TimelineSearchResult } from '../../model/timeline-search'
import { buildTurnGraph, type GraphEdge, type GraphNode } from '../../model/turn-graph'
import { formatDuration } from '../../model/turn-timeline'

interface ComputedEdge {
  id: string
  d: string
  kind: GraphEdge['kind']
  active: boolean
}

export function FlowGraph({
  turn,
  selected,
  expandedGroups,
  search,
  activeMatchId,
  onToggleGroup,
  onSelect,
  onJumpTab,
}: {
  turn: Turn
  selected: string | null
  expandedGroups: Set<string>
  search: TimelineSearchResult
  activeMatchId: string | null
  onToggleGroup(id: string): void
  onSelect(id: string, options?: { keepReading?: boolean }): void
  onJumpTab(tab: 'input' | 'output'): void
}) {
  const graph = useMemo(() => buildTurnGraph(turn, expandedGroups), [turn, expandedGroups])
  const canvasRef = useRef<HTMLDivElement>(null)
  const markerBaseId = useId().replace(/:/g, '')
  const [svgState, setSvgState] = useState<{ width: number; height: number; edges: ComputedEdge[] }>({
    width: 0,
    height: 0,
    edges: [],
  })

  const selectedNodeId = useMemo(() => {
    if (!selected) return null
    for (const stage of graph.stages) {
      for (const node of stage.nodes) {
        if (node.actionId === selected) return node.id
        if (node.actions?.some((action) => action.id === selected)) return node.id
        if (node.nestedChildren?.some((action) => action.id === selected)) return node.id
      }
    }
    return null
  }, [graph, selected])

  useLayoutEffect(() => {
    const container = canvasRef.current
    if (!container) return

    const measure = () => {
      const box = container.getBoundingClientRect()
      const rects = new Map<string, DOMRect>()
      for (const el of container.querySelectorAll<HTMLElement>('[data-node-id]')) {
        const id = el.dataset.nodeId
        if (id) rects.set(id, el.getBoundingClientRect())
      }
      const edges: ComputedEdge[] = []
      for (const edge of graph.edges) {
        const fromRect = rects.get(edge.from)
        const toRect = rects.get(edge.to)
        if (!fromRect || !toRect) continue
        const x1 = fromRect.left - box.left + fromRect.width / 2
        const y1 = fromRect.bottom - box.top
        const x2 = toRect.left - box.left + toRect.width / 2
        const y2 = toRect.top - box.top
        let d: string
        if (y2 >= y1 - 2) {
          const dy = Math.max(16, (y2 - y1) * 0.5)
          d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
        } else {
          const sideX = Math.max(x1, x2) + 40
          d = `M ${x1} ${y1} C ${sideX} ${y1}, ${sideX} ${y2}, ${x2} ${y2}`
        }
        const active = selectedNodeId !== null && (edge.from === selectedNodeId || edge.to === selectedNodeId)
        edges.push({ id: edge.id, d, kind: edge.kind, active })
      }
      setSvgState({ width: box.width, height: box.height, edges })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [graph, selectedNodeId])

  const hasActiveEdges = svgState.edges.some((edge) => edge.active)
  const hasCallEdge = graph.edges.some((edge) => edge.kind === 'confirmed-call')
  const hasDeliveryEdge = graph.edges.some((edge) => edge.kind === 'confirmed-delivery')
  const hasSeqEdge = graph.edges.some((edge) => edge.kind === 'sequence')

  function renderNode(node: GraphNode) {
    const duration = formatDuration(node.durationMs)
    if (node.kind === 'run' && node.groupId) {
      const matchCount = search.groupMatchCounts.get(node.groupId) ?? 0
      const active = !node.expanded && selectedNodeId === node.id
      const classes = ['flow-node', 'flow-node-run', node.expanded && 'is-expanded', active && 'is-selected'].filter(Boolean).join(' ')
      return (
        <div key={node.id} className={classes} data-node-id={node.id}>
          <button type="button" className="flow-node-btn" aria-expanded={Boolean(node.expanded)} onClick={() => onToggleGroup(node.groupId!)}>
            <span className="flow-node-head">
              <strong>{node.expanded ? '▾' : '▸'} {node.title}</strong>
              {duration && <small>{duration}</small>}
            </span>
            {node.tally && node.tally.length > 0 && (
              <span className="flow-node-sub">{formatTitleTally(node.tally, 3)}</span>
            )}
            {matchCount > 0 && <span className="match-badge">일치 {matchCount}개</span>}
          </button>
          {node.expanded && node.actions && node.actions.length > 0 && (
            <div className="flow-run-tiles">
              {node.actions.map((child) => {
                const childDuration = formatDuration(
                  child.time !== null && child.endTime != null ? Math.max(0, child.endTime - child.time) : null,
                )
                const childSelected = selected === child.id
                const childMatch = search.matchedActions.has(child.id)
                const childActive = activeMatchId === child.id
                const childTarget = child.reading?.target?.text
                const tileClasses = [
                  'flow-run-tile',
                  childSelected && 'is-selected',
                  childMatch && 'is-match',
                  childActive && 'is-active-match',
                ].filter(Boolean).join(' ')
                return (
                  <button
                    key={child.id}
                    type="button"
                    className={tileClasses}
                    data-action={child.id}
                    aria-pressed={childSelected}
                    onClick={() => onSelect(child.id, { keepReading: true })}
                  >
                    <span className="flow-node-head">
                      <strong>{child.reading?.title ?? child.label}</strong>
                      {childDuration && <small>{childDuration}</small>}
                    </span>
                    {childTarget && <span className="flow-node-sub">{childTarget}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    const actionId = node.actionId
    const isSelected = Boolean(actionId && selected === actionId)
    const isMatch = Boolean(actionId && search.matchedActions.has(actionId))
    const isActiveMatch = Boolean(actionId && activeMatchId === actionId)
    const classes = [
      'flow-node',
      `flow-node-${node.kind}`,
      isSelected && 'is-selected',
      isMatch && 'is-match',
      isActiveMatch && 'is-active-match',
    ].filter(Boolean).join(' ')

    return (
      <div key={node.id} className={classes} data-node-id={node.id}>
        <button
          type="button"
          className="flow-node-btn"
          data-action={actionId}
          aria-pressed={isSelected}
          onClick={() => actionId && onSelect(actionId, { keepReading: true })}
        >
          <span className="flow-node-head">
            <strong>{node.title}</strong>
            {duration && <small>{duration}</small>}
          </span>
          {node.subtitle && <span className="flow-node-sub">{node.subtitle}</span>}
        </button>
        {node.kind === 'request' && (
          <button type="button" className="flow-node-link" onClick={() => onJumpTab('input')}>
            받은 내용 →
          </button>
        )}
        {node.kind === 'answer' && (
          <button type="button" className="flow-node-link" onClick={() => onJumpTab('output')}>
            답변 보기 →
          </button>
        )}
        {node.nestedCount && node.nestedCount > 0 && node.groupId && (
          <div className="flow-nested">
            <button
              type="button"
              className="flow-nested-toggle"
              aria-expanded={Boolean(node.expanded)}
              onClick={() => onToggleGroup(node.groupId!)}
            >
              {node.expanded ? '▾' : '▸'} 하위 도구 {node.nestedCount}개
            </button>
            {node.expanded && node.nestedChildren && (
              <ul className="flow-nested-list">
                {node.nestedChildren.map((child) => {
                  const childSelected = selected === child.id
                  const childMatch = search.matchedActions.has(child.id)
                  const childActive = activeMatchId === child.id
                  const childClasses = [
                    'flow-nested-item',
                    childSelected && 'is-selected',
                    childMatch && 'is-match',
                    childActive && 'is-active-match',
                  ].filter(Boolean).join(' ')
                  return (
                    <li key={child.id}>
                      <button
                        type="button"
                        className={childClasses}
                        data-action={child.id}
                        aria-pressed={childSelected}
                        onClick={() => onSelect(child.id, { keepReading: true })}
                      >
                        <span>{[child.reading?.title ?? child.label, child.reading?.target?.text].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flow-graph-wrap">
      <div className="flow-graph" ref={canvasRef}>
        <svg
          className="flow-svg"
          width={svgState.width || undefined}
          height={svgState.height || undefined}
          aria-hidden="true"
        >
          <defs>
            <marker id={`${markerBaseId}-blue`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#294fd1" />
            </marker>
            <marker id={`${markerBaseId}-gray`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#9aa4b8" />
            </marker>
          </defs>
          {svgState.edges.map((edge) => {
            const isBlue = edge.kind === 'confirmed-delivery' || edge.active
            const stroke = isBlue ? '#294fd1' : edge.kind === 'confirmed-call' ? '#aeb7c7' : '#cfd5e0'
            const opacity = hasActiveEdges && !edge.active ? 0.35 : 1
            const markerEnd = edge.kind === 'sequence'
              ? undefined
              : `url(#${markerBaseId}-${isBlue ? 'blue' : 'gray'})`
            return (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                stroke={stroke}
                strokeWidth={edge.active ? 2 : edge.kind === 'confirmed-delivery' ? 1.7 : 1.3}
                strokeDasharray={edge.kind === 'sequence' ? '4 3' : undefined}
                opacity={opacity}
                markerEnd={markerEnd}
              />
            )
          })}
        </svg>
        <div className="flow-stages">
          {graph.stages.map((stage) => (
            <div className="flow-stage" key={stage.id}>
              {stage.nodes.map(renderNode)}
            </div>
          ))}
        </div>
      </div>

      {(hasCallEdge || hasDeliveryEdge || hasSeqEdge) && (
        <div className="flow-legend" aria-label="연결선 안내">
          {hasCallEdge && <span className="flow-legend-item"><i className="legend-line call" aria-hidden="true" />모델이 호출한 도구</span>}
          {hasDeliveryEdge && <span className="flow-legend-item"><i className="legend-line delivery" aria-hidden="true" />다음 모델 입력에 포함</span>}
          {hasSeqEdge && <span className="flow-legend-item"><i className="legend-line seq" aria-hidden="true" />기록 순서</span>}
        </div>
      )}
    </div>
  )
}
