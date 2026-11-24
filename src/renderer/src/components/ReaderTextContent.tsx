import type { Ref } from 'react'
import type { ReaderBlock, ReaderMatch } from '../model/reader-text'

export function ReaderTextContent({ blocks, activeMatch, markRef, navigableHeadings = false }: {
  blocks: ReaderBlock[]
  activeMatch?: ReaderMatch
  markRef?: Ref<HTMLElement>
  navigableHeadings?: boolean
}) {
  function textAt(text: string, index: number) {
    if (activeMatch?.block !== index) return text
    const { start, end } = activeMatch
    return <>{text.slice(0, start)}<mark ref={markRef}>{text.slice(start, end)}</mark>{text.slice(end)}</>
  }

  return blocks.map((block, index) => {
    if (block.kind === 'list-item') {
      if (blocks[index - 1]?.kind === 'list-item') return null
      const items = []
      for (let cursor = index; cursor < blocks.length; cursor += 1) {
        const item = blocks[cursor]
        if (item.kind !== 'list-item') break
        items.push(
          <li key={cursor} style={{ paddingInlineStart: `${item.indent * 6}px` }}>
            <span className="reader-list-marker">{item.marker}</span>
            <span>{textAt(item.text, cursor)}</span>
          </li>,
        )
      }
      return <ul key={index} className="reader-list" role="list">{items}</ul>
    }

    const content = textAt(block.text, index)
    if (block.kind === 'heading') {
      return <div key={index} className="text-reader-heading" role="heading" aria-level={Math.min(block.depth + 3, 6)}
        data-reader-heading={navigableHeadings ? index : undefined} tabIndex={navigableHeadings ? -1 : undefined}>{content}</div>
    }
    if (block.kind === 'code') return <pre key={index}><code>{content}</code></pre>
    return <p key={index} className="iwo-plain-text">{content}</p>
  })
}
