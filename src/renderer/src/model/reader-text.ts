export type ReaderBlock =
  | { kind: 'heading'; text: string; depth: number }
  | { kind: 'list-item'; text: string; marker: string; indent: number }
  | { kind: 'paragraph' | 'code'; text: string }

export interface ReaderMatch {
  block: number
  start: number
  end: number
}

const paragraphWidth = 240
const sentenceBoundaries = new Intl.Segmenter(undefined, { granularity: 'sentence' })

function readableParagraphs(text: string): string[] {
  if (text.length <= paragraphWidth) return [text]
  const paragraphs: string[] = []
  let paragraph = ''
  let sentenceCount = 0
  for (const { segment } of sentenceBoundaries.segment(text)) {
    if (sentenceCount === 3 || (paragraph.length >= 95 && paragraph.length + segment.length > paragraphWidth)) {
      paragraphs.push(paragraph.trimEnd())
      paragraph = ''
      sentenceCount = 0
    }
    paragraph += sentenceCount === 0 ? segment.trimStart() : segment
    sentenceCount += 1
  }
  if (paragraph) paragraphs.push(paragraph.trimEnd())
  return paragraphs
}

export function documentBlocks(source: string): ReaderBlock[] {
  const blocks: ReaderBlock[] = []
  let lines: string[] = []
  let fence: string | undefined
  let listItem: Extract<ReaderBlock, { kind: 'list-item' }> | undefined

  function flush(kind: 'paragraph' | 'code') {
    if (lines.length > 0) {
      const text = lines.join('\n')
      const chunks = kind === 'paragraph' ? readableParagraphs(text) : [text]
      for (const chunk of chunks) blocks.push({ kind, text: chunk })
    }
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
      listItem = undefined
      fence = marker[1]
      continue
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(line)
    const bullet = /^([ \t]{0,8})([-+*]|\d{1,4}[.)])[ \t]+(\S.*)$/.exec(line)
    if (bullet) {
      flush('paragraph')
      const [, indent, marker, text] = bullet
      const task = /^\[([ xX])\][ \t]+(.+)$/.exec(text)
      listItem = {
        kind: 'list-item', indent: Math.min(8, indent.replace(/\t/g, '    ').length),
        marker: task ? (task[1] === ' ' ? '☐' : '☑') : marker.length === 1 ? '•' : marker,
        text: task ? task[2] : text,
      }
      blocks.push(listItem)
      continue
    }
    if (listItem && !heading && /^[ \t]{2,}\S/.test(line)) {
      listItem.text += `\n${line.trimStart()}`
      continue
    }
    listItem = undefined
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

export function readerMatches(blocks: ReaderBlock[], query: string): ReaderMatch[] {
  const needle = query.trim()
  if (!needle) return []
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  return blocks.flatMap(({ text }, block) => Array.from(text.matchAll(pattern), ({ index, 0: match }) => ({
    block, start: index, end: index + match.length,
  })))
}
