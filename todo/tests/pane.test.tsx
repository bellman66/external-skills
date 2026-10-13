import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PATH = '/Users/youn/workspace/memos/TODO.md'
const SAMPLE = `# TODO

## 진행 중

### 1. 첫 항목
- [ ] 할 일 A
- [ ] 할 일 B

## 완료
`

const PANE_PROPS = {
  title: 'TODO',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

test('the pane lists the tree, a row press toggles its checkbox in the file, and the done section stays folded', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  let writes = 0
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.write', ($, e) => {
    writes += 1
    files.set(e.path, { text: e.text, mtimeMs: 100 + writes })
    return { value: undefined }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })

  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'todo', surface, component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

    expect(await ui.find({ type: 'Button', text: /첫 항목/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /할 일 A/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /완료/ })).toBeDefined()

    await ui.press({ key: 'row:0/0/0' })
    expect(files.get(PATH)?.text).toContain('- [x] 할 일 A')
    expect(files.get(PATH)?.text).toContain('- [ ] 할 일 B')
    expect(await ui.find({ type: 'Button', text: /\[x\] 할 일 A/ })).toBeDefined()

    await ui.press({ key: 'row:0/0/0' })
    expect(files.get(PATH)?.text).toBe(SAMPLE)

    await ui.unmount()
  }
})

test('completing an item moves it under ## 완료 with the date, and delete needs two presses', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  let writes = 0
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.write', ($, e) => {
    writes += 1
    files.set(e.path, { text: e.text, mtimeMs: 100 + writes })
    return { value: undefined }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })

  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  // Enter 는 항목을 접고 커서를 둔다; x(완료/토글)가 완료 처리한다
  await ui.press({ key: 'row:0/0' })
  expect(await ui.find({ type: 'Button', text: /할 일 A/ })).toBeUndefined()
  expect(files.get(PATH)?.text).toBe(SAMPLE)
  await ui.press({ key: 'act:complete:0/0' })
  const text = files.get(PATH)?.text ?? ''
  expect(text).toContain('## 완료\n\n### 1. 첫 항목 (완료 2026-10-13)\n')
  expect(text).not.toContain('## 진행 중\n\n### 1.')

  // 완료 섹션은 접혀 있어 항목이 보이지 않는다; c 로 펼친다
  expect(await ui.find({ type: 'Button', text: /첫 항목/ })).toBeUndefined()
  await ui.press({ key: 'act:done' })
  expect(await ui.find({ type: 'Button', text: /첫 항목 \(완료 2026-10-13\)/ })).toBeDefined()

  // 접힌 항목을 펼친 뒤, 첫 작업을 Enter(토글)해 커서를 두고 d 두 번
  await ui.press({ key: 'row:1/0' })
  await ui.press({ key: 'row:1/0/0' })
  const before = files.get(PATH)?.text ?? ''
  expect(before).toContain('- [x] 할 일 A')
  await ui.press({ key: 'act:delete:1/0/0' })
  expect(files.get(PATH)?.text).toBe(before)
  await ui.press({ key: 'act:delete:1/0/0' })
  expect(files.get(PATH)?.text).not.toContain('할 일 A')
  expect(files.get(PATH)?.text).toContain('할 일 B')

  await ui.unmount()
})

test('an edit from outside wins: the pane reloads and refuses the stale press', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, { text: e.text, mtimeMs: 999 })
    return { value: undefined }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })

  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  const edited = SAMPLE.replace('- [ ] 할 일 A', '- [ ] 할 일 A (밖에서 수정)')
  files.set(PATH, { text: edited, mtimeMs: 2 })

  await ui.press({ key: 'row:0/0/0' })
  expect(files.get(PATH)?.text).toBe(edited)
  expect(await ui.find({ type: 'Button', text: /밖에서 수정/ })).toBeDefined()

  await ui.unmount()
})

test('keyboard path: Tab (ui.focus) sets the cursor, x completes the item, per-row buttons work by click, edit rewrites a line', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  let writes = 0
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.write', ($, e) => {
    writes += 1
    files.set(e.path, { text: e.text, mtimeMs: 100 + writes })
    return { value: undefined }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })

  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  // Tab 이 항목 행에 닿으면 ui.focus 가 커서를 둔다
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0', origin: { kind: 'person' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'act:complete:0/0' })).toBeDefined()

  // 행 옆의 ✓ 버튼(클릭용)으로 완료
  await ui.press({ key: 'act:complete:0/0' })
  expect(files.get(PATH)?.text).toContain('## 완료\n\n### 1. 첫 항목 (완료 2026-10-13)\n')

  // 되돌리기: 완료 섹션을 펼치고, 행 Enter 로 커서를 둔 뒤 x
  await ui.press({ key: 'act:done' })
  await ui.press({ key: 'row:1/0' })
  await ui.press({ key: 'act:complete:1/0' })
  expect(files.get(PATH)?.text).toBe(SAMPLE)

  // 되돌린 항목은 접힌 채다(제목 기준) → 펼친 뒤, 작업 줄을 고르고(Enter 는 토글도 한다) 수정 버튼 → 입력 → 저장
  await ui.press({ key: 'row:0/0' })
  await ui.press({ key: 'row:0/0/1' })
  expect(files.get(PATH)?.text).toContain('- [x] 할 일 B')
  await ui.press({ key: 'act:edit:0/0/1' })
  expect(await ui.find({ type: 'Input', key: 'entry' })).toBeDefined()
  await ui.input({ key: 'entry', text: '할 일 B 고침' })
  expect(files.get(PATH)?.text).toContain('- [x] 할 일 B 고침')
  expect(files.get(PATH)?.text).toContain('- [ ] 할 일 A')

  await ui.unmount()
})

test('narrow pane: the cursor row moves its buttons to a line of their own, edit shows the original whole with cancel first, delete lights only its button', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, { text: e.text, mtimeMs: 50 })
    return { value: undefined }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: { ...PANE_PROPS, bodyColumns: 40 }, requestId: 'todo' })

  // 커서 행은 단축키가 붙은 이름 있는 버튼으로, 다른 행은 한 글자로
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/0', origin: { kind: 'person' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0/0' })).toMatchObject({ props: { label: '×삭제', hotkey: 'd' } })
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0/1' })).toMatchObject({ props: { label: '×' } })

  // 삭제 한 번: 파일은 그대로, 그 버튼만 '진짜 삭제'가 되고 행 글은 바뀌지 않는다
  await ui.press({ key: 'act:delete:0/0/0' })
  expect(files.get(PATH)?.text).toBe(SAMPLE)
  expect(await ui.find({ type: 'Text', text: ' ×진짜 삭제 ' })).toMatchObject({ props: { inverse: true, color: 'error' } })
  expect(await ui.find({ type: 'Button', text: /한 번 더/ })).toBeUndefined()

  // 수정: 취소·저장은 필드 위 줄에 있다
  await ui.press({ key: 'act:edit:0/0/0' })
  expect(await ui.find({ type: 'Text', text: ' ×진짜 삭제 ' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'cancel' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0/0' })).toBeUndefined()

  // 취소하면 파일은 그대로, 입력창도 사라진다
  await ui.press({ key: 'cancel' })
  expect(files.get(PATH)?.text).toBe(SAMPLE)
  expect(await ui.find({ type: 'Input', key: 'entry' })).toBeUndefined()

  await ui.unmount()
})

test('the pane wears a title band, and docked, a heavy frame of its own', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })

  // 도킹: 뿌리 상자가 강조색의 굵은 테두리이고, 첫 자식이 제목 띠다
  const docked = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })
  const frame = (await docked.find({ type: 'Box' })) as { props?: { borderStyle?: string; borderColor?: string } }
  expect(frame.props?.borderStyle).toBe('bold')
  expect(frame.props?.borderColor).toBe('claude')
  expect(await docked.find({ type: 'Text', text: ' TODO ' })).toMatchObject({ props: { inverse: true, color: 'claude' } })
  expect(await docked.find({ type: 'Button', key: 'act:close' })).toBeDefined()
  await docked.unmount()

  // 인라인: 호스트가 테두리를 그리므로 띠만 남는다
  const inline = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: { ...PANE_PROPS, placement: 'inline' }, requestId: 'todo' })
  const root = (await inline.find({ type: 'Box' })) as { props?: { borderStyle?: string } }
  expect(root.props?.borderStyle).toBeUndefined()
  expect(await inline.find({ type: 'Text', text: ' TODO ' })).toBeDefined()
  await inline.unmount()
})

test('/todo toggles the pane and a close by hand keeps it shut at the next session start', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text: SAMPLE, mtimeMs: 1 }]])
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })

  // 엔진 대신 열린 pane 을 기억한다
  const open = new Set<string>()
  on('ui.open', ($, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))

  // 첫 세션: 자동으로 뜬다
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: 'terminal', isInteractive: true })
  expect(open.has('todo')).toBe(true)

  // /todo 는 닫고, 다시 /todo 는 연다
  await $.command.run({ command: 'todo', args: '' })
  expect(open.has('todo')).toBe(false)
  await $.command.run({ command: 'todo', args: '' })
  expect(open.has('todo')).toBe(true)

  // /todo off 로 닫아 두면 다음 세션에는 뜨지 않는다
  await $.command.run({ command: 'todo', args: 'off' })
  expect(open.has('todo')).toBe(false)
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: 'terminal', isInteractive: true })
  expect(open.has('todo')).toBe(false)

  // /todo on 으로 열면 또 자동으로 뜨고, 닫혀 있던 동안 바뀐 파일을 바로 다시 읽는다
  files.set(PATH, { text: SAMPLE.replace('할 일 A', '할 일 A (닫힌 동안 수정)'), mtimeMs: 7 })
  await $.command.run({ command: 'todo', args: 'on' })
  expect(open.has('todo')).toBe(true)
  const reopened = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })
  expect(await reopened.find({ type: 'Button', text: /닫힌 동안 수정/ })).toBeDefined()
  await reopened.unmount()
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: 'terminal', isInteractive: true })
  expect(open.has('todo')).toBe(true)

  // 헤더의 ×닫기 버튼도 /todo off 와 같다
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })
  await ui.press({ key: 'act:close' })
  expect(open.has('todo')).toBe(false)
  await ui.unmount()
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: 'terminal', isInteractive: true })
  expect(open.has('todo')).toBe(false)
})

function fakeFiles(on: On, text: string) {
  const files = new Map<string, { text: string; mtimeMs: number }>([[PATH, { text, mtimeMs: 1 }]])
  let writes = 0
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: f.text } : { deny: 'ENOENT' }
  })
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    return f ? { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.write', ($, e) => {
    writes += 1
    files.set(e.path, { text: e.text, mtimeMs: 100 + writes })
    return { value: undefined }
  })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.focus', () => ({}))
  return Object.assign(files, { toasts })
}

test('the done section has a clear-all button that empties it on the second press', async ($, on) => {
  const DONE = `${SAMPLE}\n### 옛 항목 (완료 2026-10-01)\n- [x] 끝\n\n### 또 옛 항목 (완료 2026-10-02)\n`
  const files = fakeFiles(on, DONE)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  // 접혀 있어도 비우기 버튼은 보인다
  expect(await ui.find({ type: 'Button', key: 'act:clear:1' })).toMatchObject({ props: { label: '×비우기' } })
  await ui.press({ key: 'act:clear:1' })
  expect(files.get(PATH)?.text).toBe(DONE)
  expect(await ui.find({ type: 'Text', text: ' ×진짜 비우기(2) ' })).toBeDefined()
  await ui.press({ key: 'act:clear:1' })
  expect(files.get(PATH)?.text).toBe(SAMPLE)
  expect(await ui.find({ type: 'Button', key: 'act:clear:1' })).toBeUndefined()

  await ui.unmount()
})

test('edit puts cancel and save on a line above the field; save works without Enter', async ($, on) => {
  const files = fakeFiles(on, SAMPLE)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/0', origin: { kind: 'person' } })
  await ui.press({ key: 'act:edit:0/0/0' })
  expect(await ui.find({ type: 'Button', key: 'cancel' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'save' })).toMatchObject({ props: { label: '✓저장' } })
  // 필드 폭을 넘는 글은 필드 밑에 접어서 전부 보인다; 짧아지면 사라진다
  const long = '아주 긴 할 일 설명이 이어집니다 '.repeat(4).trim()
  await ui.input({ key: 'entry', text: long, kind: 'change' })
  expect(await ui.find({ type: 'Text', text: long })).toMatchObject({ props: { wrap: 'wrap' } })
  await ui.input({ key: 'entry', text: '할 일 A 고침', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: long })).toBeUndefined()
  await ui.press({ key: 'save' })
  expect(files.get(PATH)?.text).toContain('- [ ] 할 일 A 고침')
  expect(await ui.find({ type: 'Input', key: 'entry' })).toBeUndefined()

  await ui.unmount()
})

test('Esc (the pane giving the keys back) drops the open field and an armed delete', async ($, on) => {
  const files = fakeFiles(on, SAMPLE)
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })

  let ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/0', origin: { kind: 'person' } })
  await ui.press({ key: 'act:edit:0/0/0' })
  expect(await ui.find({ type: 'Input', key: 'entry' })).toBeDefined()
  await ui.unmount()

  // Esc: 같은 패널이 키보드 없이 다시 그려진다
  ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: { ...PANE_PROPS, isFocused: false }, requestId: 'todo' })
  await clock.advance(10)
  await ui.redraw()
  expect(await ui.find({ type: 'Input', key: 'entry' })).toBeUndefined()
  await ui.unmount()

  // 삭제를 한 번 누른 채 Esc 해도 원래대로
  ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })
  await ui.press({ key: 'act:delete:0/0/0' })
  expect(await ui.find({ type: 'Text', text: ' ×진짜 삭제 ' })).toBeDefined()
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: { ...PANE_PROPS, isFocused: false }, requestId: 'todo' })
  await clock.advance(10)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: ' ×진짜 삭제 ' })).toBeUndefined()
  expect(files.get(PATH)?.text).toBe(SAMPLE)
  await ui.unmount()
})

test('no errors reach the person: an outside edit elsewhere still lets the press land, a gone line just reloads, no toast', async ($, on) => {
  const files = fakeFiles(on, SAMPLE)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  // 밖에서 다른 줄이 바뀌고 줄이 하나 밀려도, 누른 줄은 원문으로 찾아 체크된다
  files.set(PATH, { text: SAMPLE.replace('### 1. 첫 항목\n', '### 1. 첫 항목\n- [ ] 밖에서 끼운 줄\n'), mtimeMs: 2 })
  await ui.press({ key: 'row:0/0/0' })
  expect(files.get(PATH)?.text).toContain('- [x] 할 일 A')
  expect(files.get(PATH)?.text).toContain('- [ ] 밖에서 끼운 줄')

  // 누른 줄이 밖에서 사라졌으면 조용히 다시 읽기만 한다
  const gone = files.get(PATH)!.text.replace('- [ ] 할 일 B\n', '')
  files.set(PATH, { text: gone, mtimeMs: 3 })
  await ui.press({ key: 'row:0/0/2' })
  expect(files.get(PATH)?.text).toBe(gone)
  expect(await ui.find({ type: 'Button', text: /할 일 B/ })).toBeUndefined()
  expect(files.toasts).toEqual([])

  await ui.unmount()
})

test('a missing file shows a starter, not an error; the first add creates the file and lands the cursor there', async ($, on) => {
  const files = fakeFiles(on, SAMPLE)
  files.delete(PATH)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  expect(await ui.find({ type: 'Text', text: /읽을 수 없/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /아직 할 일 파일이 없어요/ })).toBeDefined()
  await ui.press({ key: 'act:first' })
  await ui.input({ key: 'entry', text: '첫 일' })
  expect(files.get(PATH)?.text).toBe('# TODO\n\n## 진행 중\n\n### 첫 일\n\n## 완료\n')
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0' })).toMatchObject({ props: { label: '×삭제' } })
  expect(files.toasts).toEqual([])

  await ui.unmount()
})

test('Tab lands on rows, not on the small buttons at their ends; delete leaves the cursor on the row above', async ($, on) => {
  const files = fakeFiles(on, SAMPLE)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 3) })
  await $.session.start({ cwd: '/Users/youn/workspace/memos', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'todo', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'todo' })

  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/0', origin: { kind: 'person' } })
  // 다음 Tab 이 옆 행 끝의 ✎ 에 닿으면 그 행이 골라진다
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'act:edit:0/0/1', origin: { kind: 'person' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0/1' })).toMatchObject({ props: { label: '×삭제' } })

  // 고른 행에서 Tab 하면 그 밑의 이름 있는 버튼을 건너 다음 행으로 간다
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/1', origin: { kind: 'person' } })
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'act:complete:0/0/1', origin: { kind: 'person' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0/1' })).toMatchObject({ props: { label: '×' } })
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/1', origin: { kind: 'person' } })

  // 한 번 누른 삭제는 커서가 떠나면 거둔다
  await ui.press({ key: 'act:delete:0/0/1' })
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/0', origin: { kind: 'person' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: ' ×진짜 삭제 ' })).toBeUndefined()

  // 지우면 커서는 바로 위 행에 남는다
  await $.ui.focus({ component: 'Pane', requestId: 'todo', plugin: 'todo', element: 'row:0/0/1', origin: { kind: 'person' } })
  await ui.press({ key: 'act:delete:0/0/1' })
  await ui.press({ key: 'act:delete:0/0/1' })
  expect(files.get(PATH)?.text).not.toContain('할 일 B')
  expect(await ui.find({ type: 'Button', key: 'act:delete:0/0/0' })).toMatchObject({ props: { label: '×삭제' } })

  await ui.unmount()
})
