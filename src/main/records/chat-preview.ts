import { fields, messageText, string } from './json'
import { plainPreview, userRequest } from './reading'
import { rolloutHeader } from './rollout'

export function chatPreview(path: string, text: string) {
  const { info, metadata } = rolloutHeader(path, text)
  if (Object.hasOwn(fields(metadata.source), 'subagent') || metadata.source === 'subagent'
    || metadata.thread_source === 'subagent' || string(metadata.parent_thread_id)) return null

  let firstRequest = ''
  const lines = text.split(/\r?\n/)
  for (let index = 1; index < lines.length; index += 1) {
    // Only a bounded prefix is available, so damaged or incomplete rows are skipped here.
    let record
    try { record = fields(JSON.parse(lines[index])) } catch { continue }
    const item = fields(record.payload)
    if (record.type === 'event_msg' && item.type === 'user_message') {
      firstRequest = string(item.message) ?? ''
    } else if (record.type === 'response_item' && item.type === 'message' && item.role === 'user') {
      firstRequest = messageText(item.content)
    }
    firstRequest = userRequest(firstRequest)
    if (firstRequest) break
  }
  const title = plainPreview(string(metadata.thread_name ?? metadata.title) ?? '', 120)
  return { info, title, firstRequest: plainPreview(firstRequest, 280) }
}
