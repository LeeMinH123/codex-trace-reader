export type Fields = Record<string, unknown>

export function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function fields(value: unknown): Fields {
  return isFields(value) ? value : {}
}

export function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

export function entries(value: unknown): [string, Fields][] {
  return Object.entries(fields(value)).filter((entry): entry is [string, Fields] => isFields(entry[1]))
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function display(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
}

export function preview(value: unknown, limit = 200): string {
  const text = string(value)?.replace(/\s+/g, ' ').trim() ?? ''
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

export function messageText(value: unknown): string {
  if (!Array.isArray(value)) return string(value) ?? ''
  return value.map((item) => {
    const part = fields(item)
    return string(part.text) ?? string(part.source) ?? string(part.summary) ?? ''
  }).filter(Boolean).join('\n')
}

export function jsonLines(text: string): { lines: { value: Fields; raw: string; line: number }[]; partial: boolean } {
  const source = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const lines = []
  let partial = false
  for (const [index, raw] of source.entries()) {
    if (!raw.trim()) continue
    try {
      const value: unknown = JSON.parse(raw)
      if (!isFields(value)) throw new Error()
      lines.push({ value, raw, line: index + 1 })
    } catch {
      if (index === source.length - 1 && !text.endsWith('\n')) {
        partial = true
        break
      }
      throw new Error(`${index + 1}번째 줄의 JSON을 읽을 수 없습니다.`)
    }
  }
  return { lines, partial }
}

export function pointer(...segments: string[]): string {
  return '#/' + segments.map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')
}

export function compareId(a: string, b: string): number {
  return a < b ? -1 : a === b ? 0 : 1
}
