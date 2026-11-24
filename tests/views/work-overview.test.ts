import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Action, Turn } from '../../src/shared/reader'
import { visibleTimelineTurns } from '../../src/renderer/src/model/timeline-search'
import { buildWorkOverview } from '../../src/renderer/src/model/work-overview'

function action(id: string, title: string, kind: Action['kind'] = 'tool', stage: 'request' | 'progress' | 'answer' = 'progress'): Action {
  return {
    id, kind, label: title, summary: title, actor: '루트 에이전트',
    time: null, sequence: null,
    reading: { stage, title, text: title },
  }
}

function turn(id: string, actions: Action[], actor = '루트 에이전트'): Turn {
  return {
    id, title: `요청 ${id}`, actor, time: null, sequence: null,
    status: '기록된 진행 상태', actions,
  }
}

test('전체 개요는 기존 Story 챕터와 원본 행동 ID를 연결하며 기록 상태를 보존한다', () => {
  const steps = [
    action('r', '수정해줘', 'message', 'request'),
    action('p1', '자료를 확인합니다.', 'message'),
    action('read', '파일 읽기'),
    action('p2', '테스트를 진행합니다.', 'message'),
    action('test', '테스트 실행'),
    action('answer', '완료', 'message', 'answer'),
  ]
  const turns = [turn('turn:1', steps)]
  const overview = buildWorkOverview(turns)

  assert.equal(overview.turnCount, 1)
  assert.equal(overview.actionCount, steps.length)
  assert.equal(overview.actorCount, 1)
  assert.equal(overview.turns[0].status, '기록된 진행 상태')
  assert.deepEqual(overview.turns[0].stages.map((s) => [s.heading, s.actionId, s.basis]), [
    ['자료를 확인합니다.', 'p1', 'recorded-message'],
    ['테스트를 진행합니다.', 'p2', 'recorded-message'],
  ])
  assert.equal(overview.turns[0].stages[0].actionCount, 2)
  assert.equal(overview.turns[0].rawActionId, 'r')
})

test('진행 메시지가 없을 때 분류는 사실 확정이 아닌 규칙 기반 작업 묶음이다', () => {
  const read = action('read', '파일 읽기')
  const nested = {
    ...action('nested', '파일 읽기'),
    actor: '하위 에이전트',
    parent: { id: 'read', rule: '도구 안의 실행' },
  }
  const testAction = action('test', '테스트 실행')
  const turns = [{ ...turn('turn:1', [read, nested, testAction]), threadTurnId: '1' }, turn('turn:2', [], '기록 없음')]
  const overview = buildWorkOverview(turns)

  assert.equal(overview.turnCount, 1)
  assert.equal(overview.actorCount, 2)
  assert.equal(overview.actionCount, 3)
  assert.deepEqual(overview.turns[0].stages.map((s) => [s.heading, s.actionId, s.basis, s.actionCount]), [
    ['자료와 코드 확인', 'read', 'rule-group', 2],
    ['테스트 확인', 'test', 'rule-group', 1],
  ])
  assert.deepEqual(overview.turns[1].stages, [])
})

test('확인 가능한 진행 기록이 없으면 단계나 성공 여부를 만들어내지 않는다', () => {
  const turns = [turn('turn:empty', [action('r', '내용', 'message', 'request')])]
  const overview = buildWorkOverview(turns)

  assert.equal(overview.actionCount, 1)
  assert.deepEqual(overview.turns[0].stages, [])
  assert.equal(buildWorkOverview([]).actorCount, 0)
})

test('진행 메시지만 남은 구간도 기록 수와 원본 연결을 보존한다', () => {
  const overview = buildWorkOverview([turn('turn:1', [action('p', '확인 중', 'message')])])

  assert.equal(overview.turnCount, 0)
  assert.equal(overview.turns[0].stages[0].actionCount, 1)
  assert.equal(overview.turns[0].rawActionId, 'p')
})

test('원본 전용 기록을 선택하면 보기 전환 시 해당 구간을 유지한다', () => {
  const record: Action = { id: 'raw', kind: 'record', label: '기타 기록', summary: '', actor: '런타임', time: null, sequence: null }
  const rawTurn = turn('turn:raw', [record])
  const turns = [turn('turn:1', [action('r', '요청', 'message', 'request')]), rawTurn]

  assert.equal(buildWorkOverview(turns).turns[1].rawActionId, 'raw')
  assert.deepEqual(visibleTimelineTurns(turns, false), [turns[0]])
  assert.deepEqual(visibleTimelineTurns(turns, false, rawTurn.id), turns)
})
