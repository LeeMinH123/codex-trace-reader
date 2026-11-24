export type ReaderBlock =
  | { kind: 'heading'; text: string; depth: number }
  | { kind: 'paragraph' | 'code'; text: string }

export function documentBlocks(source: string): ReaderBlock[] {
  const blocks: ReaderBlock[] = []
  let lines: string[] = []
  let fence: string | undefined

  function flush(kind: 'paragraph' | 'code') {
    if (lines.length > 0) blocks.push({ kind, text: lines.join('\n') })
    lines = []
  }

  for (const line of source.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        flush('code')
        fence = undefined
      } else {
        lines.push(line)
      }
      continue
    }
    if (marker) {
      flush('paragraph')
      fence = marker[1]
      continue
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(line)
    if (heading) {
      flush('paragraph')
      blocks.push({ kind: 'heading', depth: heading[1].length, text: heading[2].replace(/\s+#+$/, '') })
    } else if (!line.trim()) {
      flush('paragraph')
    } else {
      lines.push(line)
    }
  }
  flush(fence ? 'code' : 'paragraph')
  return blocks
}

export function readerMatches(blocks: ReaderBlock[], query: string) {
  const needle = query.trim()
  if (!needle) return []
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  return blocks.flatMap(({ text }, block) => Array.from(text.matchAll(pattern), ({ index, 0: match }) => ({
    block, start: index, end: index + match.length,
  })))
}
