import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEMO_SCENARIOS } from '../../portfolio/src/data/demo-data'
import { PORTFOLIO_PROFILE } from '../../portfolio/src/data/profile'
import { visibleReadingOrder } from '../../src/renderer/src/model/reading-groups'
import { buildTurnStory } from '../../src/renderer/src/model/story-chapters'
import { searchTimeline } from '../../src/renderer/src/model/timeline-search'
import { buildTurnGraph } from '../../src/renderer/src/model/turn-graph'
import { buildTurnTimeline } from '../../src/renderer/src/model/turn-timeline'

test('포트폴리오 프로필과 데모 시나리오 데이터는 모든 참조가 무결하고 4종 뷰어로 변환된다', () => {
  assert.equal(PORTFOLIO_PROFILE.nickname, 'LeeMinH123')
  assert.ok(PORTFOLIO_PROFILE.interests.length >= 3)
  assert.ok(PORTFOLIO_PROFILE.principles.length === 6)
  assert.ok(DEMO_SCENARIOS.length >= 2)

  for (const scenario of DEMO_SCENARIOS) {
    assert.ok(scenario.timeline.turns.length > 0)
    const actionsById = new Map(
      scenario.timeline.turns.flatMap((turn) => turn.actions.map((action) => [action.id, action])),
    )

    for (const turn of scenario.timeline.turns) {
      for (const instId of turn.instructionIds ?? []) {
        assert.ok(actionsById.has(instId), `Missing instruction action ${instId}`)
      }
      for (const action of turn.actions) {
        assert.ok(scenario.details[action.id], `Missing detail record for ${action.id}`)
        for (const delivery of action.deliveries ?? []) {
          assert.ok(actionsById.has(delivery.targetId), `Missing delivery target ${delivery.targetId}`)
        }
      }

      const story = buildTurnStory(turn, actionsById)
      assert.ok(story.requests.length > 0)
      assert.ok(story.chapters.length > 0)

      const graph = buildTurnGraph(turn, new Set())
      assert.ok(graph.stages.length > 0)

      const timeline = buildTurnTimeline(turn)
      assert.ok(timeline.bars.length > 0)

      const visible = visibleReadingOrder(turn)
      assert.ok(visible.length > 0)
    }

    for (const detail of Object.values(scenario.details)) {
      if (!detail.modelRequest) continue
      for (const item of detail.modelRequest.inputs) {
        if (actionsById.has(item.id)) {
          assert.ok(actionsById.get(item.id), `Expected action for ${item.id}`)
        }
      }
      for (const output of detail.modelRequest.outputs) {
        assert.ok(output.id && output.label)
      }
    }
  }

  const prd = DEMO_SCENARIOS.find((s) => s.id === 'prd-review')!
  const prdSearch = searchTimeline(prd.timeline.turns, 'prd.md', false)
  assert.ok(prdSearch.matches.length >= 1)

  const cu = DEMO_SCENARIOS.find((s) => s.id === 'computer-use')!
  const cuActions = new Map(cu.timeline.turns[0].actions.map((a) => [a.id, a]))
  const cuStory = buildTurnStory(cu.timeline.turns[0], cuActions)
  assert.ok(cuStory.chapters[0].visualTags.some((tag) => tag.phase === 'ui' && tag.count >= 8))
})
