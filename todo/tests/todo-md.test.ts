import { expect, test } from 'claude-code/testing'

import { addItem, addTask, completeItem, flatten, parse, removeNode, reopenItem, serialize, summarize, toggleTask } from '../hooks/todo-md'

const SAMPLE = `# TODO

> 규칙 한 줄
> 최종 갱신: 2026-10-13

## 진행 중

### 1. 통마데 전달 자료
- 대상/기한: (미정)
- [ ] API 명세 정리
- [x] ERD 초안
- 참고: 48건 매핑

### 2. MOB-4986
- [ ] 발송 지점 찾기

## 완료
`

test('parse → serialize round-trips the file byte for byte', async () => {
  expect(serialize(parse(SAMPLE))).toBe(SAMPLE)
})

test('flatten follows heading structure and counts open tasks', async () => {
  const nodes = flatten(parse(SAMPLE), false)
  expect(nodes.map(n => n.kind)).toEqual(['section', 'item', 'note', 'task', 'task', 'note', 'item', 'task', 'section'])
  const first = nodes[1]
  expect(first?.kind === 'item' && first.open === 1 && first.total === 2).toBe(true)
  const top = nodes[0]
  expect(top?.kind === 'section' && top.open === 2 && top.total === 3).toBe(true)
})

test('toggleTask flips one checkbox and leaves every other line alone', async () => {
  const r = toggleTask(parse(SAMPLE), 0, 0, 1)
  expect(r.error).toBeUndefined()
  const out = serialize(r.doc!)
  expect(out).toBe(SAMPLE.replace('- [ ] API 명세 정리', '- [x] API 명세 정리'))
})

test('completeItem moves the item under ## 완료 with a date suffix, and reopenItem brings it back', async () => {
  const done = completeItem(parse(SAMPLE), 0, 1, '2026-10-13')
  expect(done.error).toBeUndefined()
  const text = serialize(done.doc!)
  expect(text).toBe(`# TODO

> 규칙 한 줄
> 최종 갱신: 2026-10-13

## 진행 중

### 1. 통마데 전달 자료
- 대상/기한: (미정)
- [ ] API 명세 정리
- [x] ERD 초안
- 참고: 48건 매핑

## 완료

### 2. MOB-4986 (완료 2026-10-13)
- [ ] 발송 지점 찾기
`)
  const back = reopenItem(parse(text), 1, 0)
  expect(back.error).toBeUndefined()
  const again = serialize(back.doc!)
  expect(again).toContain('### 2. MOB-4986\n- [ ] 발송 지점 찾기')
  expect(again).not.toContain('(완료')
})

test('completeItem creates ## 완료 when the file has none', async () => {
  const noDone = SAMPLE.replace('\n## 완료\n', '')
  const r = completeItem(parse(noDone), 0, 1, '2026-10-13')
  expect(r.error).toBeUndefined()
  expect(serialize(r.doc!)).toContain('\n## 완료\n\n### 2. MOB-4986 (완료 2026-10-13)\n')
})

test('addTask inserts under the cursor line, addItem after the cursor item', async () => {
  const t = addTask(parse(SAMPLE), 0, 0, 1, '새 작업')
  expect(serialize(t.doc!)).toContain('- [ ] API 명세 정리\n- [ ] 새 작업\n- [x] ERD 초안')
  const head = addTask(parse(SAMPLE), 0, 0, null, '맨 위')
  expect(serialize(head.doc!)).toContain('### 1. 통마데 전달 자료\n- [ ] 맨 위\n- 대상/기한')
  const i = addItem(parse(SAMPLE), 0, 0, '1.5 새 항목')
  expect(serialize(i.doc!)).toContain('- 참고: 48건 매핑\n\n### 1.5 새 항목\n\n### 2. MOB-4986')
})

test('removeNode drops a line or a whole item; sections are refused', async () => {
  const doc = parse(SAMPLE)
  const nodes = flatten(doc, true)
  const task = nodes.find(n => n.kind === 'task')!
  expect(serialize(removeNode(doc, task).doc!)).not.toContain('API 명세 정리')
  const item = nodes.find(n => n.kind === 'item')!
  expect(serialize(removeNode(doc, item).doc!)).not.toContain('통마데')
  const section = nodes[0]!
  expect(removeNode(doc, section).error).toBeDefined()
})

test('summarize lists only open work from non-done sections', async () => {
  const s = summarize(parse(SAMPLE), '/x/TODO.md')
  expect(s).toContain('- 1. 통마데 전달 자료 (1/2 남음)')
  expect(s).toContain('  - [ ] API 명세 정리')
  expect(s).not.toContain('ERD 초안')
})
