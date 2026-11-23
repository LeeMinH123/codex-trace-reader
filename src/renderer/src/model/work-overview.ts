import type { Action, Turn } from '../../../shared/reader'
import { buildTurnStory } from './story-chapters'

export interface OverviewStage {
  id: string
  heading: string
  summary: string
  actionCount: number
  actionId?: string
  basis: 'recorded-message' | 'rule-group'
}

export interface OverviewTurn {
  id: string
  title: string
  actor: string
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

/**
 * A navigation projection, not a diagnosis or a claim that a development
 * methodology was followed. Chapters come from the same deterministic
 * grouping rules as StoryView; each navigable row retains an original action.
 */
export function buildWorkOverview(turns: Turn[], actionsById: Map<string, Action>): WorkOverviewModel {
  const actors = new Set<string>()
  let actionCount = 0

  const entries = turns.map((turn): OverviewTurn => {
    actors.add(turn.actor)
    actionCount += turn.actions.length
    const chapters = buildTurnStory(turn, actionsById).chapters

    return {
      id: turn.id,
      title: turn.title,
      actor: turn.actor,
      ...(turn.status ? { status: turn.status } : {}),
      actionCount: turn.actions.length,
      stages: chapters.map((chapter): OverviewStage => ({
        id: chapter.id,
        heading: chapter.heading,
        summary: chapter.summary,
        actionCount: chapter.totalActionCount,
        ...(chapter.headingAction || chapter.actions[0]
          ? { actionId: (chapter.headingAction ?? chapter.actions[0]).id }
          : {}),
        basis: chapter.headingAction ? 'recorded-message' : 'rule-group',
      })),
    }
  })

  return {
    turnCount: entries.length,
    actionCount,
    actorCount: actors.size,
    turns: entries,
  }
}
