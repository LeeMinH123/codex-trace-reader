import type { Turn } from '../../../shared/reader'
import { buildStoryChapters } from './story-chapters'

export interface OverviewStage {
  id: string
  heading: string
  summary: string
  actionCount: number
  actionId: string
  basis: 'recorded-message' | 'rule-group'
}

export interface OverviewTurn {
  id: string
  title: string
  actor: string
  threadTurnId?: string
  rawActionId?: string
  status?: string
  actionCount: number
  stages: OverviewStage[]
}

export interface WorkOverviewModel {
  turnCount: number
  actionCount: number
  actorCount: number
  turns: OverviewTurn[]
}

export function buildWorkOverview(turns: Turn[]): WorkOverviewModel {
  const actors = new Set<string>()
  let actionCount = 0
  let turnCount = 0

  const entries = turns.map((turn): OverviewTurn => {
    const request = turn.actions.find((action) => action.reading?.stage === 'request')
    if (request || turn.threadTurnId) turnCount += 1
    for (const action of turn.actions) actors.add(action.actor)
    actionCount += turn.actions.length

    return {
      id: turn.id,
      title: turn.title,
      actor: turn.actor,
      threadTurnId: turn.threadTurnId,
      rawActionId: request?.id ?? turn.actions[0]?.id,
      status: turn.status,
      actionCount: turn.actions.length,
      stages: buildStoryChapters(turn).flatMap((chapter): OverviewStage[] => {
        const action = chapter.headingAction ?? chapter.actions[0]
        if (!action) return []
        return [{
          id: chapter.id,
          heading: chapter.heading,
          summary: chapter.summary,
          actionCount: chapter.totalActionCount + Number(Boolean(chapter.headingAction)),
          actionId: action.id,
          basis: chapter.headingAction ? 'recorded-message' : 'rule-group',
        }]
      }),
    }
  })

  return {
    turnCount,
    actionCount,
    actorCount: actors.size,
    turns: entries,
  }
}
