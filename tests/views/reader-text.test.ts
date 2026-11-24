import assert from 'node:assert/strict'
import { test } from 'node:test'
import { documentBlocks, readerMatches } from '../../src/renderer/src/model/reader-text'

test('본문 목차는 코드 블록 밖 제목만 읽고 HTML과 URL을 텍스트로 보존한다', () => {
  const input = '# 제목 #\r\n\r\n<aside>동작 지시</aside> https://example.test\r\n```ts\r\n# 코드 안의 제목\r\n  example()\r\n```\r\n## 다음 절\r\n~~~\r\n잘린 블록'
  assert.deepEqual(documentBlocks(input), [
    { kind: 'heading', depth: 1, text: '제목' },
    { kind: 'paragraph', text: '<aside>동작 지시</aside> https://example.test' },
    { kind: 'code', text: '# 코드 안의 제목\n  example()' },
    { kind: 'heading', depth: 2, text: '다음 절' },
    { kind: 'code', text: '잘린 블록' },
  ])
})

test('본문 검색은 대소문자와 관계없이 기호를 글자 그대로 찾아 표시할 범위를 반환한다', () => {
  const blocks = documentBlocks('# [START]\n\n[Start] 그리고 [start]\n\nSTART')
  assert.deepEqual(readerMatches(blocks, ' [start] '), [
    { block: 0, start: 0, end: 7 }, { block: 1, start: 0, end: 7 }, { block: 1, start: 12, end: 19 },
  ])
  assert.deepEqual(readerMatches(blocks, '  '), [])
})

test('긴 줄글은 문장 경계에서 나누고 코드 블록은 원래 덩어리를 유지한다', () => {
  const sentence = '새 기록을 화면에서 읽기 전에 대상 파일과 작업 범위를 확인했습니다.'
  const source = Array.from({ length: 9 }, () => sentence).join(' ')
  const blocks = documentBlocks(source)

  assert.equal(blocks.length, 3)
  assert.ok(blocks.every((block) => block.kind === 'paragraph' && block.text.endsWith('.')))
  assert.equal(blocks.map((block) => block.text).join(' '), source)
  assert.deepEqual(documentBlocks(`\`\`\`\n${source}\n\`\`\``), [{ kind: 'code', text: source }])
})

test('목록, 완료 표시, 항목의 이어지는 줄을 보존하고 검색할 수 있다', () => {
  const blocks = documentBlocks('1) 기록 확인\n  기록의 이어지는 설명\n  - [x] 범위 확인\n2) 결과 비교\n- [ ] 원문 열기')

  assert.deepEqual(blocks, [
    { kind: 'list-item', marker: '1)', indent: 0, text: '기록 확인\n기록의 이어지는 설명' },
    { kind: 'list-item', marker: '☑', indent: 2, text: '범위 확인' },
    { kind: 'list-item', marker: '2)', indent: 0, text: '결과 비교' },
    { kind: 'list-item', marker: '☐', indent: 0, text: '원문 열기' },
  ])
  assert.deepEqual(readerMatches(blocks, '범위'), [{ block: 1, start: 0, end: 2 }])
})
