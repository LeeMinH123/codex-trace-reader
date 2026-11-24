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
