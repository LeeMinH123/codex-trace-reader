const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
})
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export function stamp(value: number | null | undefined, short = false): string {
  if (value === null || value === undefined || Math.abs(value) > 8.64e15) return '시각 미확인'
  return (short ? timeFormat : dateFormat).format(value)
}
