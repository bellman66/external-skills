import { expect, mock, test } from 'claude-code/testing'

// What Claude Code passes to the ui.render hook for this pane
const PANE = {
  plugin: 'tree',
  component: 'Pane',
  requestId: 'tree',
  surface: 'terminal',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: 'tree',
    isFocused: true,
    bodyColumns: 72,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 22 },
    view: {},
  },
} as const

const SEED = '세션 로그를 어디에 보관할지 정하고 싶다'

// Layer 1: two decisions that don't depend on each other
const LAYER1 = JSON.stringify({
  nodes: [
    {
      id: 'n1',
      title: '저장 방식',
      tag: '저장소.생성 칸 비었음',
      question: '무엇에 보관할 것인가?',
      options: [
        { id: 'o1', label: 'SQLite (추천)', detail: '한 파일로 끝난다' },
        { id: 'o2', label: '평문 파일', detail: '단순하지만 질의가 없다' },
      ],
    },
    {
      id: 'n2',
      title: '보존 기한',
      tag: '저장소.삭제·해지 칸 비었음',
      question: '언제까지 들고 있나?',
      options: [
        { id: 'o1', label: '90일 (추천)', detail: '감사 요건을 덮는다' },
        { id: 'o2', label: '무기한', detail: '비용이 계속 는다' },
      ],
    },
  ],
  revisit: [],
})

// Layer 2: what the layer 1 answers opened up
const LAYER2 = JSON.stringify({
  nodes: [
    {
      id: 'n3',
      title: '스키마 마이그레이션',
      tag: 'SQLite 확정에서 파생',
      question: '스키마가 바뀌면?',
      options: [
        { id: 'o1', label: '기동 시 자동 적용 (추천)', detail: '운영 부담이 없다' },
        { id: 'o2', label: '수동 스크립트', detail: '배포 절차가 하나 는다' },
      ],
    },
  ],
  revisit: [],
})

// Nothing further to ask
const DONE = JSON.stringify({ nodes: [], revisit: [] })

function stubLayers(on: any, replies: string[]) {
  const seen = { calls: 0, prompts: [] as string[] }
  on('model.fork', ($: unknown, e: { prompt: string }) => {
    seen.prompts.push(String(e.prompt))
    const text = replies[Math.min(seen.calls, replies.length - 1)]
    seen.calls += 1
    return { value: { isAnswered: true, text } }
  })
  return seen
}

async function openTree($: any, on: any, replies: string[]) {
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const seen = stubLayers(on, replies)
  await $.command.run({ command: 'tree', args: SEED })
  return seen
}

test('the layer lists every decision but opens only the first', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // Both titles are listed, so the layer's shape is visible at a glance
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  expect(await ui.find({ key: 'node-n2' })).toBeDefined()
  // Only the focused one shows its choices — the rest stay folded
  expect(await ui.find({ key: 'opt-n1-o1' })).toBeDefined()
  expect(await ui.find({ key: 'opt-n2-o1' })).toBeUndefined()
  expect(await ui.find({ key: 'submit', text: /0\/2/ })).toBeDefined()
  await ui.unmount()
})

test('pressing a title opens that decision and folds the other', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'node-n2' })
  expect(await ui.find({ key: 'opt-n2-o1' })).toBeDefined()
  expect(await ui.find({ key: 'opt-n1-o1' })).toBeUndefined()

  // Pressing the open one again folds it, leaving nothing expanded
  await ui.press({ key: 'node-n2' })
  expect(await ui.find({ key: 'opt-n2-o1' })).toBeUndefined()
  await ui.unmount()
})

test('전체 열기 expands every decision at once, and folds back', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'expand' })
  expect(await ui.find({ key: 'opt-n1-o1' })).toBeDefined()
  expect(await ui.find({ key: 'opt-n2-o1' })).toBeDefined()

  // The same button now folds back to one at a time
  await ui.press({ key: 'expand' })
  expect(await ui.find({ key: 'opt-n2-o1' })).toBeUndefined()
  await ui.unmount()
})

test('auto-pilot fills the layer with its recommendations', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  // Every decision of the layer now carries its starred choice — with no call
  expect(seen.calls).toBe(1)
  expect(await ui.find({ key: 'submit', text: /2\/2/ })).toBeDefined()
  // The open decision carries its ✓; the folded one echoes the answer on its row
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '→ 90일' })).toBeDefined()
  await ui.unmount()
})

test('auto-pilot keeps filling each new layer as it opens', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // Layer 2 arrived already answered, so only the submit is left to press
  expect(await ui.find({ key: 'submit', text: /1\/1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  await ui.unmount()
})

test('auto-pilot does not overwrite an answer already picked', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'opt-n1-o2' })
  await ui.press({ key: 'auto' })
  // The hand-picked choice stays; only the untouched decision gets a default
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '→ 90일' })).toBeDefined()
  await ui.unmount()
})

test('picking choices costs nothing — the model is called once per layer', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2, DONE])

  const ui = await $.ui.mount(PANE)
  expect(seen.calls).toBe(1)

  await ui.press({ key: 'expand' })
  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'opt-n2-o1' })
  expect(seen.calls).toBe(1)
  expect(await ui.find({ key: 'submit', text: /2\/2/ })).toBeDefined()

  // Submitting the whole layer is the one call
  await ui.press({ key: 'submit' })
  expect(seen.calls).toBe(2)

  // Settled decisions collapse into a count, and layer 2 is open
  expect(await ui.find({ type: 'Text', text: /정한 것 2/ })).toBeDefined()
  expect(await ui.find({ key: 'node-n3' })).toBeDefined()
  await ui.unmount()
})

test('a decision left unanswered is held, not dropped', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'submit' })

  // The skipped one went to the model as held, and is counted as grey
  expect(seen.prompts[1]).toContain('미룬 것: n2')
  expect(await ui.find({ type: 'Text', text: /정한 것 1 · 미룬 것 1/ })).toBeDefined()
  await ui.unmount()
})

test('a reopened decision comes back into the new layer', async ($, on) => {
  const reopen = JSON.stringify({
    nodes: [{ id: 'n3', title: '스키마 마이그레이션', tag: '파생', question: '?', options: [] }],
    revisit: ['n1'],
  })
  await openTree($, on, [LAYER1, reopen])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  // n1 was settled, then reopened: it is asked again rather than staying closed
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /정한 것 1/ })).toBeDefined()
  await ui.unmount()
})

test('an empty layer ends the interview and hands the tree over', async ($, on) => {
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await openTree($, on, [LAYER1, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  // No further decisions came back, so the round button becomes the handoff
  expect(await ui.find({ key: 'submit' })).toBeUndefined()
  expect(await ui.find({ key: 'handoff' })).toBeDefined()

  await ui.press({ key: 'handoff' })
  expect(submitted.length).toBe(1)
  // The recommendation is a mark on the button, so it is not part of the answer
  expect(submitted[0]).toContain('### 1. 저장 방식 → SQLite')
  expect(submitted[0]).toContain('### 2. 보존 기한 → 90일')
  expect(submitted[0]).not.toContain('(추천)')
  await ui.unmount()
})

test('a layer that never arrives leaves the pane usable', async ($, on) => {
  on('ui.log', () => ({ value: undefined }))
  // The second call refuses, so the layer empties with nothing to replace it
  await openTree($, on, [LAYER1, JSON.stringify({ oops: true })])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  // The wait is over, the reason is on screen, and both ways out are offered
  expect(await ui.find({ type: 'Text', text: /다음 단계를 받지 못했습니다/ })).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  expect(await ui.find({ key: 'handoff', text: '여기까지만 넘기기' })).toBeDefined()
  await ui.unmount()
})

test('다시 시도 asks for the layer again and recovers', async ($, on) => {
  on('ui.log', () => ({ value: undefined }))
  await openTree($, on, [LAYER1, JSON.stringify({ oops: true }), LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  await ui.press({ key: 'retry' })

  // The retry landed layer 2, and the interview carries on as usual
  expect(await ui.find({ key: 'node-n3' })).toBeDefined()
  expect(await ui.find({ key: 'submit' })).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeUndefined()
  await ui.unmount()
})

test('a call that throws still releases the pane', async ($, on) => {
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.model', () => ({ value: 'claude-test' }))
  on('session.messages', () => ({ value: [] }))
  let calls = 0
  on('model.fork', () => {
    calls += 1
    if (calls === 1) return { value: { isAnswered: true, text: LAYER1 } }
    // Both paths fail: the fork is refused and the fallback completion throws
    return { deny: 'fork refused' }
  })
  on('model.complete', () => ({ deny: 'completion refused' }))

  await $.command.run({ command: 'tree', args: SEED })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  // Not left spinning: the pane says what happened and still offers a way on
  expect(await ui.find({ type: 'Text', text: /다음 레이어를 계산하는 중/ })).toBeUndefined()
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})

test('기다리지 않기 releases a pane that is still waiting', async ($, on) => {
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let release: (() => void) | null = null
  let calls = 0
  on('model.fork', async () => {
    calls += 1
    if (calls === 1) return { value: { isAnswered: true, text: LAYER1 } }
    // Hang the second call until the test lets it go
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return { value: { isAnswered: true, text: LAYER2 } }
  })

  await $.command.run({ command: 'tree', args: SEED })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  const pending = ui.press({ key: 'submit' })

  // While the call hangs, the only button is the one that stops waiting
  expect(await ui.find({ key: 'cancel' })).toBeDefined()
  await ui.press({ key: 'cancel' })
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  expect(await ui.find({ key: 'handoff' })).toBeDefined()

  if (release) (release as () => void)()
  await pending
  await ui.unmount()
})

test('the pane is split into a Tree section and a Feeding section', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '▌질문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▌원하는 결과' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1단계/ })).toBeDefined()
  await ui.unmount()
})

test('an opened decision shows its reason left and a numbered pick right', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // Left column: the question and why this decision is in the tree at all
  expect(await ui.find({ type: 'Text', text: /무엇에 보관할 것인가\?/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /왜 묻나 · 저장소\.생성 칸 비었음/ })).toBeDefined()
  // Right column: numbered choices, the recommendation starred, detail under it
  expect(await ui.find({ key: 'opt-n1-o1', text: 'SQLite' })).toBeDefined()
  expect(await ui.find({ key: 'opt-n1-o2', text: '평문 파일' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /한 파일로 끝난다/ })).toBeDefined()

  // Picking swaps the number for a check, and the choice echoes on the title row
  await ui.press({ key: 'opt-n1-o1' })
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  // Folding it lifts the answer to the title row, in full
  await ui.press({ key: 'node-n1' })
  expect(await ui.find({ type: 'Text', text: '→ SQLite' })).toBeDefined()
  await ui.unmount()
})

test('the picked choice is marked in colour, not by a tick alone', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // Before picking, the marks are dim numbers and the recommendation is yellow
  expect(await ui.find({ type: 'Text', text: '1' })).toMatchObject({ props: { dimColor: true } })
  expect(await ui.find({ type: 'Text', text: '★추천' })).toMatchObject({ props: { color: 'yellow' } })

  await ui.press({ key: 'opt-n1-o1' })
  // The pick carries colour, since a Button cannot take one itself
  expect(await ui.find({ type: 'Text', text: '✓' })).toMatchObject({ props: { color: 'green', bold: true } })
  // And the choices not taken go dim, so the picked one stands out
  expect(await ui.find({ key: 'opt-n1-o2' })).toMatchObject({ props: { dimColor: true } })
  expect(await ui.find({ key: 'opt-n1-o1' })).toMatchObject({ props: { dimColor: false } })
  await ui.unmount()
})

test('the numbers beside the choices are real keys, one decision at a time', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // With one decision open, its numbers can be pressed
  expect(await ui.find({ key: 'opt-n1-o1' })).toMatchObject({ props: { hotkey: '1' } })
  expect(await ui.find({ key: 'opt-n1-o2' })).toMatchObject({ props: { hotkey: '2' } })

  // With every decision open the numbers would collide, so they are dropped
  await ui.press({ key: 'expand' })
  const first = await ui.find({ key: 'opt-n1-o1' })
  expect(first.props.hotkey).toBeUndefined()
  await ui.unmount()
})

test('an opened decision sits in a bordered card, the folded ones do not', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // The open one is boxed and indented, so its text cannot run into its neighbours
  expect(await ui.find({ key: 'card-n1' })).toMatchObject({
    props: { borderStyle: 'round', marginLeft: 2 },
  })
  expect(await ui.find({ key: 'card-n2' })).toBeUndefined()

  // Opening the other moves the card with it
  await ui.press({ key: 'node-n2' })
  expect(await ui.find({ key: 'card-n2' })).toBeDefined()
  expect(await ui.find({ key: 'card-n1' })).toBeUndefined()
  await ui.unmount()
})

test('context belongs to the tree; feeding is a heading of its own', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  const rows = (await ui.find({ type: 'Box' })).children as Array<{
    props?: { key?: string }
    children?: unknown[]
  }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)

  // The context list sits under the questions and above what moves them on
  expect(at('notebar')).toBeGreaterThan(at('viewbar'))
  expect(at('actionbar')).toBeGreaterThan(at('notebar'))
  // Feeding starts the second half, below all of it
  expect(at('feedbar')).toBeGreaterThan(at('actionbar'))
  // With real air between the halves, not one blank line
  const gap = rows.slice(at('actionbar') + 1, at('feedbar'))
  expect(gap.filter((r) => String((r.children || [])[0]) === ' ').length).toBeGreaterThan(1)
  // …and carries its own rule, which is what keeps the two halves apart
  const underFeed = rows[at('feedbar') + 1]
  expect(String((underFeed.children || [])[0])).toMatch(/^─+$/)
  await ui.unmount()
})

test('the two halves are titled, the list inside one is not', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // Both top-level headings are marked; the context list is a plain label
  expect(await ui.find({ type: 'Text', text: '▌질문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▌원하는 결과' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '확장 컨텍스트' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▌확장 컨텍스트' })).toBeUndefined()
  await ui.unmount()
})

test('the section titles carry their original names in brackets', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '▌질문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '(tree)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▌원하는 결과' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '(feeding)' })).toBeDefined()
  await ui.unmount()
})

test('the language button swaps the pack and remembers the choice', async ($, on) => {
  const saved = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'lang', text: 'EN' })).toBeDefined()

  await ui.press({ key: 'lang' })
  // Every word of the pane comes from the pack, titles and hints alike
  expect(await ui.find({ type: 'Text', text: '▌Questions' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▌Desired outcome' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /step 1/ })).toBeDefined()
  expect(await ui.find({ key: 'submit', text: /^Next step/ })).toBeDefined()
  expect(await ui.find({ key: 'lang', text: '한국어' })).toBeDefined()
  // The brackets keep the original names in either pack
  expect(await ui.find({ type: 'Text', text: '(tree)' })).toBeDefined()
  // And the choice outlives the session
  expect(saved.get('lang')).toBe('en')
  await ui.unmount()
})

test('the language reaches the model and the handoff', async ($, on) => {
  const submitted: string[] = []
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  const seen = await openTree($, on, [LAYER1, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'lang' })
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // The prompt tells the model which language to answer in
  expect(seen.prompts[1]).toContain('Write every title, question, tag')

  await ui.press({ key: 'handoff' })
  expect(submitted[0]).toContain('# Work order')
  expect(submitted[0]).toContain('## Settled decisions')
  expect(submitted[0]).toContain('## How to proceed')
  await ui.unmount()
})

test('a narrow pane stacks the two columns instead of splitting', async ($, on) => {
  await openTree($, on, [LAYER1])

  const narrow = { ...PANE, props: { ...PANE.props, bodyColumns: 48 } }
  const ui = await $.ui.mount(narrow)
  expect(await ui.find({ key: 'opt-n1-o1' })).toBeDefined()
  expect(await ui.find({ key: 'write-n1' })).toBeDefined()
  expect(await ui.find({ key: 'submit' })).toBeDefined()
  await ui.unmount()
})

test('writing an answer that no choice covers counts toward the layer', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.input({ key: 'write-n1', text: 'Postgres 를 이미 쓰고 있으니 테이블만 추가' })
  // Typing an answer is still free — nothing is sent until the layer is submitted
  expect(seen.calls).toBe(1)
  expect(await ui.find({ key: 'submit', text: /1\/2/ })).toBeDefined()

  await ui.press({ key: 'submit' })
  expect(seen.prompts[1]).toContain('Postgres 를 이미 쓰고 있으니 테이블만 추가')
  await ui.unmount()
})

test('with nothing to fork yet, it still builds the layer from the messages', async ($, on) => {
  const completions: string[] = []
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // Before the main thread has answered once, a fork has nothing to ride on
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  on('session.model', () => ({ value: 'claude-test' }))
  on('session.messages', () => ({
    value: [{ role: 'user', text: '붙여넣은 긴 컨텍스트: 세션 로그가 너무 커진다', toolUses: [] }],
  }))
  on('model.complete', ($, e) => {
    completions.push(String(e.prompt))
    return { value: { isAnswered: true, text: LAYER1 } }
  })

  await $.command.run({ command: 'tree', args: SEED })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  expect(completions.length).toBe(1)
  expect(completions[0]).toContain('붙여넣은 긴 컨텍스트')
  await ui.unmount()
})

test('a model that answers nothing says why on the pane', async ($, on) => {
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  on('session.model', () => ({ value: 'claude-test' }))
  on('session.messages', () => ({ value: [] }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error' } }))

  await $.command.run({ command: 'tree', args: '무엇이든' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /api-error/ })).toBeDefined()
  await ui.unmount()
})

test('the action row sits under the choices, not up in the heading', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  const pane = await ui.find({ type: 'Box' })
  const rows = pane.children as Array<{ props?: { key?: string } }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)
  const viewRow = at('viewbar')
  const actionRow = at('actionbar')
  const cardRow = at('card-n1')

  // View options stay on top; the choices come next; next-step comes after
  expect(viewRow).toBeGreaterThan(-1)
  expect(cardRow).toBeGreaterThan(viewRow)
  expect(actionRow).toBeGreaterThan(cardRow)
  await ui.unmount()
})

test('each bottom list adds a row the way a todo list does', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // The field is not in the way until the add button asks for it
  expect(await ui.find({ key: 'note' })).toBeUndefined()
  expect(await ui.find({ key: 'add-note' })).toBeDefined()

  await ui.press({ key: 'add-note' })
  const input = await ui.find({ key: 'note' })
  expect(input).toMatchObject({ props: { autoFocus: true } })

  await ui.input({ key: 'note', text: '결제사는 토스만 쓴다' })
  // Submitting adds the row and puts the field away again
  expect(await ui.find({ type: 'Text', text: '결제사는 토스만 쓴다' })).toBeDefined()
  expect(await ui.find({ key: 'note' })).toBeUndefined()
  await ui.unmount()
})

test('both lists can have their field open at the same time', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-note' })
  await ui.press({ key: 'add-feed' })
  // Opening one no longer closes the other
  expect(await ui.find({ key: 'note' })).toBeDefined()
  expect(await ui.find({ key: 'feed' })).toBeDefined()

  // Submitting one closes only that one
  await ui.input({ key: 'note', text: '결제사는 토스만 쓴다' })
  expect(await ui.find({ key: 'note' })).toBeUndefined()
  expect(await ui.find({ key: 'feed' })).toBeDefined()
  await ui.unmount()
})

test('the wait turns a spinner where the questions will appear', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let release: (() => void) | null = null
  let calls = 0
  on('model.fork', async () => {
    calls += 1
    if (calls === 1) return { value: { isAnswered: true, text: LAYER1 } }
    // Hold the second call open so the pane stays in its waiting state
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return { value: { isAnswered: true, text: LAYER2 } }
  })

  await $.command.run({ command: 'tree', args: SEED })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  const pending = ui.press({ key: 'submit' })

  const frameOf = async () => {
    const row = await ui.find({ key: 'loading' })
    const mark = (row.children as Array<{ children?: unknown[] }>)[0]
    return String((mark.children || [])[0])
  }

  // The spinner stands in the list's place, above what moves the round on
  const rows = (await ui.find({ type: 'Box' })).children as Array<{ props?: { key?: string } }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)
  expect(at('loading')).toBeGreaterThan(at('viewbar'))
  expect(at('loading')).toBeLessThan(at('actionbar'))

  // And it actually turns as time passes
  const first = await frameOf()
  await clock.advance(120)
  expect(await frameOf()).not.toBe(first)
  await clock.advance(120)
  expect(await frameOf()).not.toBe(first)

  if (release) (release as () => void)()
  await pending
  // Once the layer lands the spinner is gone and the questions are back
  expect(await ui.find({ key: 'loading' })).toBeUndefined()
  expect(await ui.find({ key: 'node-n3' })).toBeDefined()
  await ui.unmount()
})

test('every action is a framed button, none is bare text', async ($, on) => {
  on('ui.log', () => ({ value: undefined }))
  // The second call refuses, which puts retry and the partial handoff on screen
  await openTree($, on, [LAYER1, JSON.stringify({ oops: true })])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  const bar = await ui.find({ key: 'actionbar' })
  const frames = bar.children as Array<{ props?: { borderStyle?: string }; children?: unknown[] }>
  expect(frames.length).toBe(2)
  for (const frame of frames) {
    // Each action is wrapped, so none of them reads as a line of text
    expect(frame.props?.borderStyle).toBeDefined()
    expect((frame.children as Array<{ type?: string }>)[0].type).toBe('Button')
  }
  expect(await ui.find({ key: 'handoff', text: '여기까지만 넘기기' })).toBeDefined()
  await ui.unmount()
})

test('the add control is a button, not a line of text', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // No `plain`, so the app draws it with brackets like any other button
  const add = await ui.find({ key: 'add-note' })
  expect(add.props.plain).toBeUndefined()
  expect(add.props.label).toBe('+ 추가')

  // And it says how to put it away again once it is open
  await ui.press({ key: 'add-note' })
  expect(await ui.find({ key: 'add-note', text: '닫기' })).toBeDefined()
  await ui.press({ key: 'add-note' })
  expect(await ui.find({ key: 'note' })).toBeUndefined()
  await ui.unmount()
})

test('a row can be struck off either list', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  // The checklist marker is back, and the row carries its own remove
  expect(await ui.find({ type: 'Text', text: '☐' })).toBeDefined()
  const keys: string[] = []
  JSON.stringify(await ui.find({ type: 'Box' }), (k, v) => {
    if (k === 'key' && typeof v === 'string') keys.push(v)
    return v
  })
  const removeKey = keys.find((k) => k.startsWith('rm-feed-'))
  expect(removeKey).toBeDefined()

  await ui.press({ key: removeKey as string })
  expect(await ui.find({ type: 'Text', text: '배포 없이 되돌릴 수 있어야 한다' })).toBeUndefined()
  await ui.unmount()
})

test('the next-step box goes bold once nothing is left to pick', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  const bar = await ui.find({ key: 'actionbar' })
  const frame = (bar.children as Array<{ props?: { borderStyle?: string } }>)[0]
  expect(frame.props?.borderStyle).toBe('round')

  // Answer everything: the frame turns bold, which is the "ready" signal
  await ui.press({ key: 'auto' })
  const after = await ui.find({ key: 'actionbar' })
  const readyFrame = (after.children as Array<{ props?: { borderStyle?: string } }>)[0]
  expect(readyFrame.props?.borderStyle).toBe('bold')
  await ui.unmount()
})

test('auto-pick sits with the view options, not with the actions', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  const keysOf = (bar: { children?: unknown[] }) =>
    ((bar.children || []) as Array<{ props?: { key?: string } }>).map((c) => c.props && c.props.key)
  expect(keysOf(await ui.find({ key: 'viewbar' }))).toContain('auto')
  expect(keysOf(await ui.find({ key: 'actionbar' }))).not.toContain('auto')
  await ui.unmount()
})

test('a note can be added for what no choice covers', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-note' })
  await ui.input({ key: 'note', text: '결제사는 토스만 쓴다' })
  // It is listed, and it costs nothing until the layer is submitted
  expect(await ui.find({ type: 'Text', text: '결제사는 토스만 쓴다' })).toBeDefined()
  expect(seen.calls).toBe(1)

  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // The next layer is asked for with that context as a premise
  expect(seen.prompts[1]).toContain('방금 덧붙인 맥락')
  expect(seen.prompts[1]).toContain('결제사는 토스만 쓴다')
  await ui.unmount()
})

test('a note can be folded into the open layer without submitting it', async ($, on) => {
  // The revise call strikes the settled PayPal decision and asks a KCP one
  const revised = JSON.stringify({
    nodes: [
      {
        id: 'k1',
        title: 'KCP 연동 경로',
        tag: 'KCP 전환에서 파생',
        question: '어떻게 붙이나?',
        options: [{ id: 'o1', label: '포트원 경유 (추천)', detail: '기존 구조 재사용' }],
      },
    ],
    revisit: [],
    drop: ['n1'],
  })
  const seen = await openTree($, on, [LAYER1, LAYER2, revised])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // Layer 2 is open, built on a premise the user is about to overturn
  expect(await ui.find({ key: 'node-n3' })).toBeDefined()

  await ui.press({ key: 'add-note' })
  await ui.input({ key: 'note', text: 'PayPal 말고 KCP 로 전환' })

  // An unread note offers to be applied here and now, before submitting
  expect(await ui.find({ key: 'apply' })).toBeDefined()
  await ui.press({ key: 'apply' })

  // The same layer was rebuilt: its old question is gone, a new one took over
  expect(seen.prompts[2]).toContain('2번째 레이어를 이 맥락에 맞게 다시 만들어라')
  expect(await ui.find({ key: 'node-k1' })).toBeDefined()
  expect(await ui.find({ key: 'node-n3' })).toBeUndefined()
  // The settled decision the note overturned is struck off, not left answered
  expect(await ui.find({ type: 'Text', text: /미룬 것 1/ })).toBeDefined()
  // And the note counts as read, so the button steps aside
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  await ui.unmount()
})

test('a dropped decision never reaches the handoff', async ($, on) => {
  const dropping = JSON.stringify({ nodes: [], revisit: [], drop: ['n1'] })
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await openTree($, on, [LAYER1, dropping])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  await ui.press({ key: 'handoff' })

  // n1 was answered, then struck out: it is listed as deferred, not as settled
  expect(submitted[0]).toContain('보존 기한 → 90일')
  expect(submitted[0]).not.toContain('저장 방식 → SQLite')
  expect(submitted[0]).toContain('## 빼기로 한 것')
  expect(submitted[0]).toContain('- 저장 방식')
  await ui.unmount()
})

test('a note stops reopening decisions once a round has read it', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-note' })
  await ui.input({ key: 'note', text: '결제사는 토스만 쓴다' })
  // Unread, it is flagged in the list and sent as grounds for reopening
  expect(await ui.find({ type: 'Text', text: '+' })).toMatchObject({ props: { color: 'yellow' } })

  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  expect(seen.prompts[1]).toContain('방금 덧붙인 맥락')

  // Next round it has become a standing premise: kept, but no longer a trigger
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  expect(seen.prompts[2]).toContain('앞서 밝혀둔 전제')
  expect(seen.prompts[2]).toContain('결제사는 토스만 쓴다')
  expect(seen.prompts[2]).not.toContain('방금 덧붙인 맥락')
  await ui.unmount()
})

test('the handoff is a work order, not a list of decisions', async ($, on) => {
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  // One answer taken from the list, one written in, one question left unanswered
  const held = JSON.stringify({
    nodes: [
      {
        id: 'n9',
        title: '접근 권한',
        tag: '운영 칸 비었음',
        question: '누가 볼 수 있나?',
        options: [{ id: 'o1', label: '관리자만 (추천)', detail: '감사 범위가 좁다' }],
      },
    ],
    revisit: [],
    drop: [],
  })
  await openTree($, on, [LAYER1, held, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-note' })
  await ui.input({ key: 'note', text: '레거시 DB 는 못 건드린다' })
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'node-n2' })
  await ui.input({ key: 'write-n2', text: '30일' })
  await ui.press({ key: 'submit' })
  // Leave the last question unanswered, so it is carried as held
  await ui.press({ key: 'submit' })
  await ui.press({ key: 'handoff' })

  const order = submitted[0]
  // It opens with the job, not with the first decision
  expect(order).toContain('# 작업 지시')
  expect(order).toContain('## 하려는 일')
  expect(order).toContain(SEED)
  // Premises come before the decisions that were made under them
  expect(order.indexOf('## 전제')).toBeLessThan(order.indexOf('## 확정된 결정'))
  expect(order).toContain('레거시 DB 는 못 건드린다')
  // Each decision carries the question, why it was asked, and the grounds
  expect(order).toContain('### 1. 저장 방식 → SQLite')
  expect(order).toContain('물은 것: 무엇에 보관할 것인가?')
  expect(order).toContain('왜 물었나: 저장소.생성 칸 비었음')
  expect(order).toContain('그 선택을 고른 근거: 한 파일로 끝난다')
  // A written-in answer says so, since it has no listed grounds
  expect(order).toContain('### 2. 보존 기한 → 30일')
  expect(order).toContain('사용자가 선택지 대신 직접 적은 답이다')
  // The criteria are a checklist, and what was held is named with its question
  expect(order).toContain('- [ ] 배포 없이 되돌릴 수 있어야 한다')
  expect(order).toContain('## 정하지 않은 것')
  expect(order).toContain('접근 권한 — 누가 볼 수 있나?')
  // And it closes by saying how to use all of it
  expect(order).toContain('## 진행 방법')
  expect(order).toContain('다시 묻지 말고 그대로 전제하라')
  expect(order).toContain('미룬 항목은 지금 결정하지 말고')
  expect(order).toContain('조건 목록을 하나씩 짚어')
  await ui.unmount()
})

test('notes travel with the handoff', async ($, on) => {
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await openTree($, on, [LAYER1, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-note' })
  await ui.input({ key: 'note', text: '레거시 DB 는 못 건드린다' })
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  await ui.press({ key: 'handoff' })

  expect(submitted[0]).toContain('## 전제 — 사용자가 못박은 것')
  expect(submitted[0]).toContain('레거시 DB 는 못 건드린다')
  await ui.unmount()
})

test('what the user wants out of it shows up as a checklist', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 롤백할 수 있어야 한다' })
  expect(await ui.find({ type: 'Text', text: '배포 없이 롤백할 수 있어야 한다' })).toBeDefined()
  await ui.unmount()
})
