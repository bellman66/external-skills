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

// The same pane with room enough for the summary's tree
const TALL = { ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 48 } } } as const

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

// What the agent checking the request reports before the first layer
const SURVEY = '확인된 사실: 세션 로그는 지금 남기지 않는다'

// Every request is checked by an agent before its first layer: this one
// answers at once. A hook registers once per test, so any other agent the
// test spawns goes to `other`, set by whichever call brings it
type Surveyed = { other: ((e: { prompt: string }) => unknown) | null; prompts: string[] }
const surveyed = new WeakMap<any, Surveyed>()
function answerSurvey($: any, on: any, other?: (e: { prompt: string }) => unknown): Surveyed {
  let slot = surveyed.get(on)
  if (!slot) {
    const mine: Surveyed = { other: null, prompts: [] }
    surveyed.set(on, mine)
    on('agent.spawn', (_: unknown, e: { description: string; prompt: string }, next: any) => {
      if (e.description !== '요구 검증') return mine.other ? mine.other(e) : next(e)
      mine.prompts.push(String(e.prompt))
      void $.turn.complete({ agentId: 's0', answer: SURVEY, reason: 'answer', turnId: 't-s0', durationMs: 1, isAborted: false })
      return { model: 'claude-test', agentId: 's0' }
    })
    on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
    slot = mine
  }
  if (other) slot.other = other
  return slot
}

function stubLayers($: any, on: any, replies: string[]) {
  answerSurvey($, on)
  const seen = { calls: 0, prompts: [] as string[] }
  on('model.fork', ($: unknown, e: { prompt: string }) => {
    seen.prompts.push(String(e.prompt))
    const text = replies[Math.min(seen.calls, replies.length - 1)]
    seen.calls += 1
    return { value: { isAnswered: true, text } }
  })
  return seen
}

// A test can't open a .md, so each prompt file answers with its own name:
// what is checked here is which files are stacked and in what order. What the
// files say is checked against the real model by evals/depth.ts.
function servePrompts(on: any) {
  on('fs.read', ($: unknown, e: { path: string }) => ({
    value: '[' + e.path.replace(/^.*[\\/](prompts)[\\/](\w+\.md)$/, '$1/$2') + ']',
  }))
}

// Every Text under one drawn element, depth first
function textsIn(node: any): any[] {
  if (!node || typeof node !== 'object') return []
  const own = node.type === 'Text' ? [node] : []
  return [...own, ...((node.children || []) as unknown[]).flatMap(textsIn)]
}

// How many decisions the summary's legend counts in one zone
async function zoneCount(ui: any, zone: string) {
  const item = await ui.find({ key: 'legend-' + zone })
  // The zone's shade, then its count in bold
  const value = (item.children as Array<{ children?: unknown[] }>)[1]
  return Number((value.children || [])[0])
}

async function openTree($: any, on: any, replies: string[]) {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const seen = stubLayers($, on, replies)
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
  // The hand-picked choice stays, folded on its title row; only the untouched
  // decision — open now, since the pick moved the hand there — gets a default
  expect(await ui.find({ type: 'Text', text: '→ 평문 파일' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  expect(await ui.find({ key: 'opt-n2-o1' })).toMatchObject({ props: { dimColor: false } })
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
  expect(await zoneCount(ui, 'known')).toBe(2)
  expect(await ui.find({ key: 'node-n3' })).toBeDefined()
  await ui.unmount()
})

test('a decision left unanswered is held, not dropped', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'submit' })

  // The skipped one went to the model as held, and is counted as grey
  expect(seen.prompts[1]).toContain('- n2 [L1/deferred] 보존 기한')
  expect(await zoneCount(ui, 'known')).toBe(1)
  expect(await zoneCount(ui, 'deferred')).toBe(1)
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
  expect(await zoneCount(ui, 'known')).toBe(1)
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
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.model', () => ({ value: 'claude-test' }))
  on('session.messages', () => ({ value: [] }))
  let calls = 0
  answerSurvey($, on)
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
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let release: (() => void) | null = null
  let calls = 0
  answerSurvey($, on)
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
  expect(await ui.find({ type: 'Text', text: '질문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '원하는 결과' })).toBeDefined()
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

  // Picking folds the decision and lifts the answer to its title row, in full
  await ui.press({ key: 'opt-n1-o1' })
  expect(await ui.find({ type: 'Text', text: '→ SQLite' })).toBeDefined()
  // Opened again, the number has become a check
  await ui.press({ key: 'node-n1' })
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  await ui.unmount()
})

test('the picked choice is marked in colour, not by a tick alone', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // Before picking, the host draws the key itself (`1: SQLite`), so no number
  // is drawn beside it; the recommendation carries the theme's hint color
  expect(await ui.find({ type: 'Text', text: /^1$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '★추천' })).toMatchObject({ props: { color: 'suggestion' } })

  await ui.press({ key: 'opt-n1-o1' })
  // The pick moved the hand on to the next decision, so this one is folded
  // with its answer on the title row; opened again, the pick carries colour,
  // since a Button cannot take one itself
  expect(await ui.find({ type: 'Text', text: '→ SQLite' })).toMatchObject({ props: { color: 'success' } })
  await ui.press({ key: 'node-n1' })
  expect(await ui.find({ type: 'Text', text: '✓' })).toMatchObject({ props: { color: 'success', bold: true } })
  // And the choices not taken go dim, so the picked one stands out
  expect(await ui.find({ key: 'opt-n1-o2' })).toMatchObject({ props: { dimColor: true } })
  expect(await ui.find({ key: 'opt-n1-o1' })).toMatchObject({ props: { dimColor: false } })
  // With every decision open the keys are off, so the numbers are drawn dim
  await ui.press({ key: 'expand' })
  const numbers = textsIn(await ui.find({ key: 'card-n1' })).filter((t) => String((t.children || [])[0]) === '2')
  expect(numbers[0]).toMatchObject({ props: { dimColor: true } })
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

test('context, questions and feeding stack top to bottom as three sections', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  const cards = (await ui.find({ type: 'Box' })).children as Array<{
    props?: { key?: string; borderStyle?: string }
    children?: Array<{ props?: { key?: string } }>
  }>
  const at = (key: string) => cards.findIndex((r) => r.props && r.props.key === key)

  // The title band opens the pane, then the summary card, context,
  // questions and feeding
  expect(at('band')).toBe(0)
  expect(at('summary')).toBe(1)
  expect(at('ctxcard')).toBe(2)
  expect(at('treecard')).toBe(3)
  expect(at('feedcard')).toBe(4)
  // Each section is a rounded card, and each card opens on its own heading
  for (const [cardKey, headKey] of [
    ['ctxcard', 'ctxbar'],
    ['treecard', 'treebar'],
    ['feedcard', 'feedbar'],
  ]) {
    const one = cards[at(cardKey)]
    expect(one.props?.borderStyle).toBe('round')
    expect((one.children || [])[0].props?.key).toBe(headKey)
  }
  await ui.unmount()
})

test('the pane wears a title band, and docked, a heavy frame of its own', async ($, on) => {
  await openTree($, on, [LAYER1])

  // Inline, the host's border frames the pane: the root carries none, and
  // the band is its first child, naming the mod in the accent with the
  // panel's own controls at its right
  const inline = await $.ui.mount(PANE)
  const root = (await inline.find({ type: 'Box' })) as { props?: { borderStyle?: string }; children?: Array<{ props?: { key?: string } }> }
  expect(root.props?.borderStyle).toBeUndefined()
  expect((root.children || [])[0].props?.key).toBe('band')
  expect(await inline.find({ type: 'Text', text: ' TREE ' })).toMatchObject({ props: { inverse: true, color: 'claude' } })
  expect(await inline.find({ key: 'close' })).toBeDefined()
  expect(await inline.find({ key: 'lang' })).toBeDefined()
  await inline.unmount()

  // Docked, the pane draws the frame: a bold border in the accent, and the
  // body laid out four columns narrower for it
  const docked = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'dock' } })
  const frame = (await docked.find({ type: 'Box' })) as { props?: { borderStyle?: string; borderColor?: string } }
  expect(frame.props?.borderStyle).toBe('bold')
  expect(frame.props?.borderColor).toBe('claude')
  expect(await docked.find({ key: 'summary' })).toMatchObject({ props: { width: 68 } })
  await docked.unmount()
})

test('all three sections are titled, and extended context is gone', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '컨텍스트' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '(context)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '질문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '원하는 결과' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /확장 컨텍스트/ })).toBeUndefined()
  await ui.unmount()
})

test('the section titles carry their original names in brackets', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '질문' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '(tree)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '원하는 결과' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: 'Questions' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Desired outcome' })).toBeDefined()
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
  expect(await ui.find({ key: 'open-write-n1' })).toBeDefined()
  expect(await ui.find({ key: 'submit' })).toBeDefined()
  await ui.unmount()
})

test('writing an answer that no choice covers counts toward the layer', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  // The field comes out only when asked for
  expect(await ui.find({ key: 'write-n1' })).toBeUndefined()
  await ui.press({ key: 'open-write-n1' })
  expect(await ui.find({ key: 'write-n1' })).toMatchObject({ props: { autoFocus: true } })
  await ui.input({ key: 'write-n1', text: 'Postgres 를 이미 쓰고 있으니 테이블만 추가' })
  // Submitting puts the field away again
  expect(await ui.find({ key: 'write-n1' })).toBeUndefined()
  // Typing an answer is still free — nothing is sent until the layer is submitted
  expect(seen.calls).toBe(1)
  expect(await ui.find({ key: 'submit', text: /1\/2/ })).toBeDefined()

  await ui.press({ key: 'submit' })
  expect(seen.prompts[1]).toContain('Postgres 를 이미 쓰고 있으니 테이블만 추가')
  await ui.unmount()
})

test('with nothing to fork yet, it still builds the layer from the messages', async ($, on) => {
  const completions: string[] = []
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // Before the main thread has answered once, a fork has nothing to ride on
  answerSurvey($, on)
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

test('a bare /tree with no tree yet opens a bare pane that asks for the request', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  const open = new Set<string>()
  on('ui.open', ($, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [...open].map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  on('session.messages', () => ({ value: [{ role: 'user', text: '직전에 보낸 말', toolUses: [] }] }))
  const seen = stubLayers($, on, [LAYER1])

  const result = await $.command.run({ command: 'tree', args: '' })

  // The pane opens, and the last prompt is not taken as a seed: nothing grows
  expect(result.text).toBeUndefined()
  expect(open.has('tree')).toBe(true)
  expect(seen.calls).toBe(0)

  // The pane holds a field for the request, and nothing of a tree
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'seed' })).toMatchObject({ props: { autoFocus: true } })
  expect(await ui.find({ key: 'node-n1' })).toBeUndefined()
  expect(await ui.find({ key: 'submit' })).toBeUndefined()

  // Typing the request in is what starts the interview
  await ui.input({ key: 'seed', text: SEED })
  expect(seen.calls).toBe(1)
  expect(seen.prompts[0]).toContain(SEED)
  expect(await ui.find({ key: 'seed' })).toBeUndefined()
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  await ui.unmount()
})

test('the pane comes up with the session, and stays away once the person put it away', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  const open = new Set<string>()
  const opens: Array<{ focus?: boolean }> = []
  on('ui.open', ($, e) => {
    open.add(e.id)
    opens.push({ focus: e.focus })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open].map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  // A session's start, the mod turned on, a reload: the pane is there, and
  // the keyboard stays at the prompt
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(open.has('tree')).toBe(true)
  expect(opens[0].focus).not.toBe(true)

  // A reload with the pane still up opens nothing twice
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(opens.length).toBe(1)

  // Put away with its own close button, a reload leaves it away
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'close' })
  expect(open.has('tree')).toBe(false)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(open.has('tree')).toBe(false)

  // A bare /tree brings it back. The mod turned off drops the pane without
  // a word to its hooks; turned on again, the start brings the pane back
  await $.command.run({ command: 'tree', args: '' })
  expect(open.has('tree')).toBe(true)
  open.delete('tree')
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(open.has('tree')).toBe(true)

  // Nobody at the prompt: no pane
  open.clear()
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  expect(open.has('tree')).toBe(false)
  await ui.unmount()
})

test('a bare /tree hides the open pane and brings it back, tree intact', async ($, on) => {
  const open = new Set<string>()
  on('ui.open', ($, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open].map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  const seen = stubLayers($, on, [LAYER1])
  await $.command.run({ command: 'tree', args: SEED })
  expect(open.has('tree')).toBe(true)

  // Open: /tree closes it, and the interview is not restarted
  await $.command.run({ command: 'tree', args: '' })
  expect(open.has('tree')).toBe(false)
  expect(seen.prompts.length).toBe(1)

  // Closed: /tree opens it again on the same tree, still without a new call
  await $.command.run({ command: 'tree', args: '' })
  expect(open.has('tree')).toBe(true)
  expect(seen.prompts.length).toBe(1)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  expect(await ui.find({ key: 'node-n2' })).toBeDefined()
  await ui.unmount()
})

test('a model that answers nothing says why on the pane', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  answerSurvey($, on)
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
  const rows = (await ui.find({ key: 'treecard' })).children as Array<{ props?: { key?: string } }>
  // The view options sit on the heading's right, so the heading stands for them
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === (key === 'viewbar' ? 'treebar' : key))
  expect(await ui.find({ key: 'viewbar' })).toBeDefined()
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
  expect(await ui.find({ key: 'ctx' })).toBeUndefined()
  expect(await ui.find({ key: 'add-ctx' })).toBeDefined()

  await ui.press({ key: 'add-ctx' })
  const input = await ui.find({ key: 'ctx' })
  expect(input).toMatchObject({ props: { autoFocus: true } })

  await ui.input({ key: 'ctx', text: '결제사는 토스만 쓴다' })
  // Submitting adds the row and puts the field away again
  expect(await ui.find({ type: 'Text', text: '결제사는 토스만 쓴다' })).toBeDefined()
  expect(await ui.find({ key: 'ctx' })).toBeUndefined()
  await ui.unmount()
})

test('both lists can have their field open at the same time', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.press({ key: 'add-feed' })
  // Opening one no longer closes the other
  expect(await ui.find({ key: 'ctx' })).toBeDefined()
  expect(await ui.find({ key: 'feed' })).toBeDefined()

  // Submitting one closes only that one
  await ui.input({ key: 'ctx', text: '결제사는 토스만 쓴다' })
  expect(await ui.find({ key: 'ctx' })).toBeUndefined()
  expect(await ui.find({ key: 'feed' })).toBeDefined()
  await ui.unmount()
})

test('the wait turns a spinner where the questions will appear', async ($, on) => {
  const clock = mock.clock(on)
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let release: (() => void) | null = null
  let calls = 0
  answerSurvey($, on)
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
  const rows = (await ui.find({ key: 'treecard' })).children as Array<{ props?: { key?: string } }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)
  expect(at('loading')).toBeGreaterThan(at('treebar'))
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

test('every action is a button of the host, none is bare text', async ($, on) => {
  on('ui.log', () => ({ value: undefined }))
  // The second call refuses, which puts retry and the partial handoff on screen
  await openTree($, on, [LAYER1, JSON.stringify({ oops: true })])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  const bar = await ui.find({ key: 'actionbar' })
  const buttons = bar.children as Array<{ type?: string; props?: { variant?: string; plain?: true } }>
  expect(buttons.length).toBe(2)
  for (const button of buttons) {
    // Each action is a `[ label ]` of the host's, so none of them reads as a line of text
    expect(button.type).toBe('Button')
    expect(button.props?.plain).toBeUndefined()
    expect(button.props?.variant).toBeDefined()
  }
  expect(await ui.find({ key: 'handoff', text: '여기까지만 넘기기' })).toBeDefined()
  await ui.unmount()
})

test('the add control is a button, not a line of text', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // The host's own `[ ]` button with an accent plus inside, not a bare line
  const add = await ui.find({ key: 'add-ctx' })
  expect(add.props.label).toBe('추가')
  expect(add.props.plain).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '+ 추가' })).toMatchObject({ props: { color: 'claude' } })

  // And it says how to put it away again once it is open
  await ui.press({ key: 'add-ctx' })
  expect(await ui.find({ key: 'add-ctx', text: '닫기' })).toBeDefined()
  await ui.press({ key: 'add-ctx' })
  expect(await ui.find({ key: 'ctx' })).toBeUndefined()
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

test('the next-step button turns primary once nothing is left to pick', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'submit' })).toMatchObject({ props: { variant: 'secondary' } })

  // Answer everything: the button becomes the host's primary, which is the "ready" signal
  await ui.press({ key: 'auto' })
  expect(await ui.find({ key: 'submit' })).toMatchObject({ props: { variant: 'primary' } })
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
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '결제사는 토스만 쓴다' })
  // It is listed, and it costs nothing until the layer is submitted
  expect(await ui.find({ type: 'Text', text: '결제사는 토스만 쓴다' })).toBeDefined()
  expect(seen.calls).toBe(1)

  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // The next layer is asked for with that context as a premise
  expect(seen.prompts[1]).toContain('- [미반영] 결제사는 토스만 쓴다')
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

  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: 'PayPal 말고 KCP 로 전환' })

  // An unread note offers to be applied here and now, before submitting
  expect(await ui.find({ key: 'apply' })).toBeDefined()
  await ui.press({ key: 'apply' })

  // The same layer was rebuilt: its old question is gone, a new one took over
  expect(seen.prompts[2]).toContain('## 지금까지의 트리')
  expect(seen.prompts[2]).toContain('만들 레이어: 2')
  expect(await ui.find({ key: 'node-k1' })).toBeDefined()
  expect(await ui.find({ key: 'node-n3' })).toBeUndefined()
  // The settled decision the note overturned is struck off, not left answered
  expect(await zoneCount(ui, 'deferred')).toBe(1)
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
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '결제사는 토스만 쓴다' })
  // Pending, it is flagged in the list and sent as grounds for reopening
  expect(await ui.find({ type: 'Text', text: '미반영' })).toMatchObject({ props: { color: 'warning' } })

  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  expect(seen.prompts[1]).toContain('- [미반영] 결제사는 토스만 쓴다')

  // Next round it has become a standing premise: kept, but no longer a trigger
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  expect(seen.prompts[2]).toContain('- [반영됨] 결제사는 토스만 쓴다')
  expect(seen.prompts[2]).not.toContain('[미반영]')
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
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '레거시 DB 는 못 건드린다' })
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  // The pick on n1 opens n2 by itself
  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'open-write-n2' })
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
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '레거시 DB 는 못 건드린다' })
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

// The keys of every element on the pane, for rows whose id is made at runtime
async function keysOn(ui: any) {
  const keys: string[] = []
  JSON.stringify(await ui.find({ type: 'Box' }), (k, v) => {
    if (k === 'key' && typeof v === 'string') keys.push(v)
    return v
  })
  return keys
}

test('the request sits in the context, folded once the first layer read it', async ($, on) => {
  await openTree($, on, [LAYER1])

  const ui = await $.ui.mount(PANE)
  // Applied right away, with the check it was given, so both fold into the
  // count with nothing to apply; the count line is itself the toggle
  expect(await ui.find({ key: 'ctx-fold', text: '▸ 반영됨 2개' })).toMatchObject({ props: { plain: true } })
  expect(await ui.find({ key: 'ctxrow-seed' })).toBeUndefined()
  expect(await ui.find({ key: 'apply' })).toBeUndefined()

  await ui.press({ key: 'ctx-fold' })
  expect(await ui.find({ type: 'Text', text: SEED })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '검증: 요구' })).toBeDefined()
  expect(await ui.find({ key: 'ctx-fold', text: '▾ 반영됨 2개' })).toBeDefined()
  await ui.unmount()
})

test('an added item is pending until applied, then folds with the rest', async ($, on) => {
  const revised = JSON.stringify({ nodes: [], revisit: [], drop: [] })
  const seen = await openTree($, on, [LAYER1, revised])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '레거시 DB 는 못 건드린다' })
  // Out in the open with its badge, and the apply button has come up
  expect(await ui.find({ type: 'Text', text: '레거시 DB 는 못 건드린다' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '미반영' })).toBeDefined()
  expect(await ui.find({ key: 'apply', text: '컨텍스트 반영 (m)' })).toBeDefined()

  await ui.press({ key: 'apply' })
  // The whole context went in: the request and the item
  expect(seen.prompts[1]).toContain('## 요구\n\n' + SEED)
  expect(seen.prompts[1]).toContain('레거시 DB 는 못 건드린다')
  // All now applied — request, its check, the item — folded into one line
  expect(await ui.find({ key: 'ctx-fold', text: /반영됨 3개/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '레거시 DB 는 못 건드린다' })).toBeUndefined()
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  await ui.unmount()
})

test('editing an applied item sends it back to pending, out of the fold', async ($, on) => {
  const revised = JSON.stringify({ nodes: [], revisit: [], drop: [] })
  await openTree($, on, [LAYER1, revised, revised])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  await ui.press({ key: 'apply' })
  await ui.press({ key: 'ctx-fold' })

  const editKey = (await keysOn(ui)).find((k) => k.startsWith('edit-ctx-c')) as string
  await ui.press({ key: editKey })
  const field = await ui.find({ key: editKey.replace('edit-ctx-', 'ctx-edit-') })
  expect(field).toMatchObject({ props: { value: '토스만 쓴다' } })
  await ui.input({ key: editKey.replace('edit-ctx-', 'ctx-edit-'), text: '토스와 KCP 를 쓴다' })

  // Only the request and its check are left in the fold; the edited item is pending again
  expect(await ui.find({ key: 'ctx-fold', text: /반영됨 2개/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '토스와 KCP 를 쓴다' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '미반영' })).toBeDefined()
  expect(await ui.find({ key: 'apply' })).toBeDefined()
  await ui.unmount()
})

test('an open edit field closes on its own button or when Esc takes the keyboard', async ($, on) => {
  await openTree($, on, [LAYER1])

  let ui = await $.ui.mount(PANE)
  await ui.press({ key: 'ctx-fold' })
  await ui.press({ key: 'edit-ctx-seed' })
  expect(await ui.find({ key: 'ctx-edit-seed' })).toBeDefined()
  await ui.press({ key: 'close-ctx-seed' })
  expect(await ui.find({ key: 'ctx-edit-seed' })).toBeUndefined()

  // Esc hands the keyboard back to the prompt, and the pane drawn without it
  // has the field put away, as the add field is
  await ui.press({ key: 'edit-ctx-seed' })
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false } })
  expect(await ui.find({ key: 'ctx-edit-seed' })).toBeUndefined()
  expect(await ui.find({ key: 'edit-ctx-seed' })).toBeDefined()
  await ui.unmount()
})

test('rewriting the request brings up apply and is sent as the new starting point', async ($, on) => {
  const revised = JSON.stringify({ nodes: [], revisit: [], drop: [] })
  const seen = await openTree($, on, [LAYER1, revised])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'ctx-fold' })
  await ui.press({ key: 'edit-ctx-seed' })
  await ui.input({ key: 'ctx-edit-seed', text: '세션 로그를 S3 에 보관하고 싶다' })
  // The request cannot be removed, only rewritten
  expect(await ui.find({ key: 'rm-ctx-seed' })).toBeUndefined()
  expect(await ui.find({ key: 'apply' })).toBeDefined()

  await ui.press({ key: 'apply' })
  expect(seen.prompts[1]).toContain('[prompts/tree.md]')
  expect(seen.prompts[1]).toContain('세션 로그를 S3 에 보관하고 싶다')
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  await ui.unmount()
})

test('removing an applied item keeps the tree but asks for a re-apply', async ($, on) => {
  const revised = JSON.stringify({ nodes: [], revisit: [], drop: [] })
  const seen = await openTree($, on, [LAYER1, revised])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  await ui.press({ key: 'apply' })
  const before = seen.calls
  await ui.press({ key: 'ctx-fold' })

  const removeKey = (await keysOn(ui)).find((k) => k.startsWith('rm-ctx-c')) as string
  await ui.press({ key: removeKey })
  // Nothing was recomputed; the button is what says the tree is behind
  expect(seen.calls).toBe(before)
  expect(await ui.find({ type: 'Text', text: '토스만 쓴다' })).toBeUndefined()
  expect(await ui.find({ key: 'apply' })).toBeDefined()
  await ui.unmount()
})

test('a failed apply keeps the tree and the badges, and offers to try again', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, 'not json'])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  await ui.press({ key: 'apply' })

  expect(seen.calls).toBe(2)
  // The layer on screen is the one from before, and the item is still pending
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '미반영' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /JSON 을 읽지 못했습니다/ })).toBeDefined()
  expect(await ui.find({ key: 'apply', text: '컨텍스트 반영 다시 시도 (m)' })).toBeDefined()
  await ui.unmount()
})

test('nothing in the context can be touched while an apply is out', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let release: (() => void) | null = null
  let calls = 0
  answerSurvey($, on)
  on('model.fork', async () => {
    calls += 1
    if (calls === 1) return { value: { isAnswered: true, text: LAYER1 } }
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return { value: { isAnswered: true, text: DONE } }
  })
  await $.command.run({ command: 'tree', args: SEED })

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  const pending = ui.press({ key: 'apply' })

  expect(await ui.find({ key: 'add-ctx' })).toBeUndefined()
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  expect((await keysOn(ui)).some((k) => k.startsWith('edit-ctx-') || k.startsWith('rm-ctx-'))).toBe(false)

  if (release) (release as () => void)()
  await pending
  expect(await ui.find({ key: 'add-ctx' })).toBeDefined()
  await ui.unmount()
})

test('the fold stays shut once the next round reads a pending item', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'ctx-fold' })
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // The round read it, so it is applied and the fold closed over it again
  expect(await ui.find({ key: 'ctx-fold', text: '▸ 반영됨 3개' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '토스만 쓴다' })).toBeUndefined()
  await ui.unmount()
})

test('a prompt is tree.md with the state stacked below it', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })

  const order = (text: string, parts: string[]) => parts.map((p) => text.indexOf(p))
  // The first call: no tree yet, so that section is simply absent
  const firstAt = order(seen.prompts[0], ['[prompts/tree.md]', '## 요구', '## 출력 언어'])
  expect(firstAt.every((at, i) => at > -1 && (i === 0 || at > firstAt[i - 1]))).toBe(true)
  expect(seen.prompts[0]).not.toContain('## 지금까지의 트리')
  // The next call stacks the tree and where the interview stands
  const nextAt = order(seen.prompts[1], [
    '[prompts/tree.md]',
    '## 요구',
    '## 지금까지의 트리',
    '## 진행 상황',
    '## 원하는 결과',
    '## 출력 언어',
  ])
  expect(nextAt.every((at, i) => at > -1 && (i === 0 || at > nextAt[i - 1]))).toBe(true)
  expect(seen.prompts[1]).toContain('- 배포 없이 되돌릴 수 있어야 한다')
  await ui.unmount()
})

test('a prompt file that will not load says so instead of hanging', async ($, on) => {
  // No answer for fs.read at all: the read rejects, as a missing file would
  answerSurvey($, on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'tree', args: SEED })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /트리를 세우다 끊겼습니다 — .*fs\.read/ })).toBeDefined()
  expect(await ui.find({ key: 'apply' })).toBeDefined()
  await ui.unmount()
})

test('a request with nothing worth asking can be handed over at once', async ($, on) => {
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await openTree($, on, [DONE])

  const ui = await $.ui.mount(PANE)
  // No line says the interview is over: the lit hand-over button is the whole message
  expect(await ui.find({ type: 'Text', text: /물어볼 것이 끝났습니다/ })).toBeUndefined()
  expect(await ui.find({ key: 'handoff' })).toMatchObject({ props: { variant: 'primary' } })
  await ui.press({ key: 'handoff', text: 'Claude에 넘기고 종료하기 (r)' })
  expect(submitted[0]).toContain(SEED)
  expect(submitted[0]).not.toContain('## 확정된 결정')
  await ui.unmount()
})

test('the interview stops after four rounds, whatever the model wants', async ($, on) => {
  // The model would keep asking forever; the pane stops calling it
  const round = (id: string) =>
    JSON.stringify({
      nodes: [{ id, title: id, tag: '파생', question: '?', options: [{ id: 'o1', label: '예 (추천)', detail: '' }] }],
      revisit: [],
    })
  const seen = await openTree($, on, [LAYER1, round('r2'), round('r3'), round('r4'), round('r5')])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  for (let i = 0; i < 5; i += 1) {
    if (!(await ui.find({ key: 'submit' }))) break
    await ui.press({ key: 'submit' })
  }
  expect(seen.calls).toBe(4)
  // The brake is a rule in tree.md, read off this number — not a branch here
  expect(seen.prompts[1]).toContain('만들 레이어: 2')
  expect(seen.prompts[2]).toContain('만들 레이어: 3')
  expect(await ui.find({ key: 'handoff', text: 'Claude에 넘기고 종료하기 (r)' })).toBeDefined()
  await ui.unmount()
})

// A layer that asks one thing, settles one without asking, and flags what it added
const WITH_ASSUMED = JSON.stringify({
  nodes: [
    {
      id: 'n1',
      title: '저장 방식',
      tag: '저장소.생성 칸 비었음',
      question: '무엇에 보관할 것인가?',
      isExpansion: true,
      options: [{ id: 'o1', label: 'SQLite (추천)', detail: '한 파일로 끝난다' }],
    },
  ],
  assumed: [{ title: '파일 위치', answer: '~/.tree/logs', why: '기존 설정 폴더 관례' }],
  revisit: [],
  drop: [],
})

test('a decision settled without asking is shown, and can still be asked', async ($, on) => {
  await openTree($, on, [WITH_ASSUMED])

  const ui = await $.ui.mount(PANE)
  // Shown under the questions, not counted among them
  // No title of its own: each row opens with `Pass` in green, as a settled thing
  expect(await ui.find({ type: 'Text', text: /질문 없이 정함/ })).toBeUndefined()
  const mark = textsIn(await ui.find({ key: 'assumed-L1a1' }))[0]
  expect(String((mark.children || [])[0])).toBe('Pass')
  expect(mark).toMatchObject({ props: { color: 'success', bold: true } })
  // The first row sits right under the heading's air
  expect(await ui.find({ key: 'assumed-L1a1' })).toMatchObject({ props: { marginTop: 0 } })
  // Its title bold, its answer plain, the row hung in under the heading
  expect(await ui.find({ type: 'Text', text: '파일 위치' })).toMatchObject({ props: { bold: true } })
  expect(await ui.find({ type: 'Text', text: '~/.tree/logs' })).toBeDefined()
  expect(await ui.find({ key: 'submit', text: /0\/1/ })).toBeDefined()
  // The model's own additions carry a mark beside their title
  expect(await ui.find({ type: 'Text', text: '확장' })).toBeDefined()

  // It sits above the questions, under the heading, so it is read first
  const rows = (await ui.find({ key: 'treecard' })).children as Array<{ props?: { key?: string } }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)
  expect(at('assumed-L1a1')).toBe(at('treebar') + 1)
  expect(at('row-n1')).toBeGreaterThan(at('assumed-L1a1'))
  expect(at('actionbar')).toBeGreaterThan(at('row-n1'))

  // Asking it puts it on the open layer, its default as the recommendation,
  // in the warning color — a direction stands, so it is not an open red
  await ui.press({ key: 'ask-L1a1' })
  expect(await ui.find({ key: 'node-L1a1' })).toBeDefined()
  const titleRow = await ui.find({ key: 'row-L1a1' })
  expect(textsIn(titleRow).find((t) => String((t.children || [])[0]) === '●')).toMatchObject({ props: { color: 'warning' } })
  expect(await zoneCount(ui, 'gray')).toBe(1)
  // And it is listed before the red ones: green, yellow, red, top to bottom
  const after = (await ui.find({ key: 'treecard' })).children as Array<{ props?: { key?: string } }>
  const atAfter = (key: string) => after.findIndex((r) => r.props && r.props.key === key)
  expect(atAfter('row-L1a1')).toBeLessThan(atAfter('row-n1'))
  expect(await ui.find({ key: 'opt-L1a1-o1', text: '~/.tree/logs' })).toBeDefined()
  expect(await ui.find({ key: 'submit', text: /0\/2/ })).toBeDefined()
  expect(await ui.find({ key: 'assumed-L1a1' })).toBeUndefined()
  await ui.unmount()
})

test('what was settled without asking reaches the handoff with its grounds', async ($, on) => {
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await openTree($, on, [WITH_ASSUMED, DONE])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  await ui.press({ key: 'handoff' })
  expect(submitted[0]).toContain('파일 위치 → ~/.tree/logs')
  expect(submitted[0]).toContain('질문 없이 정했다. 근거: 기존 설정 폴더 관례')
  expect(submitted[0]).not.toContain('사용자가 선택지 대신 직접 적은 답이다')
  await ui.unmount()
})

test('a struck decision takes its subtree with it', async ($, on) => {
  // Layer 2 grows a child of n1; layer 3 strikes n1, and the child goes too
  const child = JSON.stringify({
    nodes: [
      {
        id: 'c1',
        title: 'SQLite 저널 모드',
        tag: 'n1 확정에서 파생',
        question: '어느 모드?',
        parent: 'n1',
        options: [{ id: 'o1', label: 'WAL (추천)', detail: '' }],
      },
    ],
    revisit: [],
    drop: [],
  })
  const strike = JSON.stringify({ nodes: [], revisit: [], drop: ['n1'] })
  const seen = await openTree($, on, [LAYER1, child, strike])

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  // The child names its parent when the tree rides along
  await ui.press({ key: 'submit' })
  expect(seen.prompts[2]).toContain('c1 [L2/known] SQLite 저널 모드 확정="WAL"')
  expect(seen.prompts[2]).toContain('^n1')
  // n1 struck, c1 with it: two of the three settled are gone
  expect(await zoneCount(ui, 'known')).toBe(1)
  expect(await zoneCount(ui, 'deferred')).toBe(2)
  await ui.unmount()
})

test('the summary meter splits its width by the traffic light', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])

  const ui = await $.ui.mount(TALL)
  const COLOR: Record<string, string> = { known: 'success', gray: 'warning', unknown: 'error', deferred: 'inactive' }
  const widthOf = async (zone: string) => {
    const seg = textsIn(await ui.find({ key: 'meter' })).find((t) => t.props && t.props.color === COLOR[zone])
    return seg ? String((seg.children || [])[0]).length : 0
  }
  // Two open questions fill the meter in the open color; the meter shares the
  // row with the tree and the legend, so it is the rest of the card's width
  const meterW = await widthOf('unknown')
  expect(meterW).toBe(30)
  expect(await ui.find({ type: 'Text', text: '1단계' })).toMatchObject({ props: { bold: true } })

  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'submit' })
  // One settled, one held, one new: thirds that still add up to the whole width
  const parts = [await widthOf('known'), await widthOf('deferred'), await widthOf('unknown')]
  expect(parts.every((w) => w >= 8)).toBe(true)
  expect(parts.reduce((a, b) => a + b, 0)).toBe(meterW)
  // A zone with nothing in it takes no room at all
  expect(await widthOf('gray')).toBe(0)
  expect(await zoneCount(ui, 'gray')).toBe(0)
  await ui.unmount()
})

// The leaves on the summary card's tree
const leavesIn = async (ui: any) =>
  textsIn(await ui.find({ key: 'tree' })).filter((t) => String((t.children || [])[0]) === '●')

test('the summary tree stands bare before anything is asked', async ($) => {
  const ui = await $.ui.mount(TALL)
  const leaves = await leavesIn(ui)
  expect(leaves.length).toBe(35)
  expect(leaves.every((t) => t.props && t.props.color === 'subtle')).toBe(true)
  await ui.unmount()
})

test('the summary tree colors its leaves by the traffic light', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(TALL)
  // Two open questions turn every leaf the open color
  const leaves = await leavesIn(ui)
  expect(leaves.length).toBe(35)
  expect(leaves.every((t) => t.props && t.props.color === 'error')).toBe(true)
  await ui.unmount()
})

test('a short pane leaves the tree out so the first question stays in view', async ($, on) => {
  await openTree($, on, [LAYER1])
  // 22 rows: the ten the tree takes would push the questions below the fold
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'tree' })).toBeUndefined()
  // The meter and legend still say where the interview stands, wider now
  const seg = textsIn(await ui.find({ key: 'meter' })).find((t) => t.props && t.props.color === 'error')
  expect(String((seg.children || [])[0]).length).toBe(48)
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  await ui.unmount()
})

test('the summary is two lines: step dots and the count, then the meter with its legend', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  const summary = await ui.find({ key: 'summary' })
  // Border aside, the card holds the title row and the bar row, nothing else
  expect((summary.children as unknown[]).length).toBe(2)
  // One dot per round, the first lit on step one
  const stepTexts = textsIn(await ui.find({ key: 'steps' }))
  expect(stepTexts.map((t) => String((t.children || [])[0]))).toEqual(['●', '○', '○', '○'])
  expect(stepTexts[0]).toMatchObject({ props: { color: 'claude' } })
  expect(stepTexts[1]).toMatchObject({ props: { color: 'subtle' } })
  // The legend is a shade and a count per zone, no words and no percentages
  expect(await ui.find({ type: 'Text', text: /%$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '남은 단계' })).toBeUndefined()
  expect(await zoneCount(ui, 'unknown')).toBe(2)

  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  const after = textsIn(await ui.find({ key: 'steps' })).map((t) => String((t.children || [])[0]))
  expect(after).toEqual(['●', '●', '○', '○'])
  await ui.unmount()
})

test('the fold rides on the heading and the add button sits under the rows, so an idle list is two lines', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  // Context: the request is applied and folded on the heading, so the card
  // is its heading and the add button
  const ctx = await ui.find({ key: 'ctxcard' })
  const keysIn = (node: any) => (node.children as Array<{ props?: { key?: string } }>).map((r) => r.props && r.props.key)
  expect(keysIn(ctx)).toEqual(['ctxbar', 'ctxactions'])
  expect(await ui.find({ key: 'ctx-fold' })).toBeDefined()
  // Feeding: nothing listed, so the heading and the add button are all there
  // is, and the button sits right under the heading's own air
  expect(keysIn(await ui.find({ key: 'feedcard' }))).toEqual(['feedbar', 'feedadd'])
  expect(await ui.find({ key: 'feedadd' })).toMatchObject({ props: { marginTop: 0 } })
  expect(await ui.find({ key: 'ctxactions' })).toMatchObject({ props: { marginTop: 0 } })
  // With a row listed, the button stands a line off it
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  expect(await ui.find({ key: 'feedadd' })).toMatchObject({ props: { marginTop: 1 } })
  // Rows stand a line apart from each other, the first right under the heading
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '한글 깨짐 없음' })
  const feedRows = ((await ui.find({ key: 'feedcard' })).children as any[]).filter(
    (r) => r.props && String(r.props.key).startsWith('feedrow-'),
  )
  expect(feedRows.map((r) => r.props.marginTop)).toEqual([0, 1])
  // The context's rows the same way
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '레거시 DB 는 못 건드린다' })
  const ctxRows = ((await ui.find({ key: 'ctxcard' })).children as any[]).filter(
    (r) => r.props && String(r.props.key).startsWith('ctxrow-'),
  )
  expect(ctxRows.map((r) => r.props.marginTop)).toEqual([0, 1])

  // Opening the field puts it where the button was, right under the rows
  await ui.press({ key: 'add-feed' })
  const opened = keysIn(await ui.find({ key: 'feedcard' }))
  expect(opened[0]).toBe('feedbar')
  expect(opened.slice(1, -1).every((k) => String(k).startsWith('feedrow-'))).toBe(true)
  expect(opened[opened.length - 1]).toBe('feedfield')
  expect(opened).not.toContain('feedadd')
  await ui.unmount()
})

test('a section title is set off in the heading color, with a line of air under it', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  for (const key of ['ctxbar', 'treebar', 'feedbar']) {
    const bar = await ui.find({ key })
    expect(bar).toMatchObject({ props: { marginBottom: 1 } })
    // The theme's blue, not the accent the handover button has
    expect(textsIn(bar)[0]).toMatchObject({ props: { color: 'permission', bold: true } })
    expect(String((textsIn(bar)[0].children || [])[0]).startsWith('▍')).toBe(true)
  }
  await ui.unmount()
})

test('add and apply share one row under the context', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  const keysIn = (node: any) => (node.children as Array<{ props?: { key?: string } }>).map((r) => r.props && r.props.key)
  // Nothing pending: the row is the add button alone
  expect(keysIn(await ui.find({ key: 'ctxactions' }))).toEqual(['add-ctx'])

  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  // A pending item brings apply up beside it, on the same row, a line off the list
  expect(keysIn(await ui.find({ key: 'ctxactions' }))).toEqual(['add-ctx', 'apply'])
  expect(await ui.find({ key: 'ctxactions' })).toMatchObject({ props: { marginTop: 1 } })
  // With the field open, the button is out and apply holds the row
  await ui.press({ key: 'add-ctx' })
  expect(keysIn(await ui.find({ key: 'ctxactions' }))).toEqual(['apply'])
  expect(keysIn(await ui.find({ key: 'ctxcard' }))).toContain('ctxfield')
  await ui.unmount()
})

test('an open field keeps the list spacing: a line off the rows, none under a bare heading', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  // No rows yet: the field sits right under the heading's own air
  await ui.press({ key: 'add-feed' })
  expect(await ui.find({ key: 'feedfield' })).toMatchObject({ props: { marginTop: 0 } })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  // With a row above, the field stands a line off it, as a row would
  await ui.press({ key: 'add-feed' })
  expect(await ui.find({ key: 'feedfield' })).toMatchObject({ props: { marginTop: 1 } })
  await ui.unmount()
})

test('each action button carries a status color that says what the press would do', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  const colorOf = async (key: string) => textsIn(await ui.find({ key }))[0].props.color
  // A layer with holes sends in the warning color; whole, in green
  expect(await colorOf('submit')).toBe('warning')
  await ui.press({ key: 'auto' })
  expect(await colorOf('submit')).toBe('success')
  expect(await ui.find({ key: 'submit' })).toMatchObject({ props: { variant: 'primary' } })
  // A handover is in the accent, finished or not
  await ui.press({ key: 'submit' })
  expect(await colorOf('handoff')).toBe('claude')
  // Something pending to apply is in the warning color too
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '토스만 쓴다' })
  expect(await colorOf('apply')).toBe('warning')
  await ui.unmount()
})

test('question titles stand a line apart, the first right under the heading', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'row-n1' })).toMatchObject({ props: { marginTop: 0 } })
  expect(await ui.find({ key: 'row-n2' })).toMatchObject({ props: { marginTop: 1 } })
  // The opened card sits right under its title; the next title's air sets it off
  const rows = (await ui.find({ key: 'treecard' })).children as Array<{ props?: { key?: string } }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)
  expect(at('card-n1')).toBe(at('row-n1') + 1)
  expect(at('row-n2')).toBe(at('card-n1') + 1)
  await ui.unmount()
})

test('a pick opens the next decision still waiting, and the last one stays put', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'card-n1' })).toBeDefined()
  expect(await ui.find({ key: 'card-n2' })).toBeUndefined()

  // Picking on n1 folds it and opens n2
  await ui.press({ key: 'opt-n1-o1' })
  expect(await ui.find({ key: 'card-n1' })).toBeUndefined()
  expect(await ui.find({ key: 'card-n2' })).toBeDefined()
  // Picking on the last one opens nothing more; next-step lights up instead
  await ui.press({ key: 'opt-n2-o1' })
  expect(await ui.find({ key: 'card-n2' })).toBeDefined()
  expect(await ui.find({ key: 'submit' })).toMatchObject({ props: { variant: 'primary' } })

  // With every decision open there is nothing to move to
  await ui.press({ key: 'expand' })
  await ui.press({ key: 'opt-n1-o2' })
  expect(await ui.find({ key: 'card-n1' })).toBeDefined()
  expect(await ui.find({ key: 'card-n2' })).toBeDefined()
  await ui.unmount()
})

test('next-step says how many it would hold', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'submit', text: '다음 단계로 (s) · 0/2 · 2개는 미룸' })).toBeDefined()
  await ui.press({ key: 'opt-n1-o1' })
  expect(await ui.find({ key: 'submit', text: '다음 단계로 (s) · 1/2 · 1개는 미룸' })).toBeDefined()
  await ui.press({ key: 'opt-n2-o1' })
  expect(await ui.find({ key: 'submit', text: '다음 단계로 (s) · 2/2' })).toBeDefined()
  await ui.unmount()
})

test('write-in and look-in-the-code share one line, with letters for keys one at a time', async ($, on) => {
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'open-write-n1' })).toMatchObject({ props: { hotkey: 'w', plain: true } })
  expect(await ui.find({ key: 'probe-n1' })).toMatchObject({ props: { hotkey: 'f', plain: true } })
  // Opening the field turns the button into the way out
  await ui.press({ key: 'open-write-n1' })
  expect(await ui.find({ key: 'open-write-n1', text: '닫기' })).toBeDefined()
  await ui.press({ key: 'open-write-n1' })
  expect(await ui.find({ key: 'write-n1' })).toBeUndefined()
  // With every decision open the letters would collide, so they are dropped
  await ui.press({ key: 'expand' })
  expect((await ui.find({ key: 'open-write-n1' })).props.hotkey).toBeUndefined()
  expect((await ui.find({ key: 'probe-n2' })).props.hotkey).toBeUndefined()
  await ui.unmount()
})

test('a decision under research says so on its title, and names itself in the notice', async ($, on) => {
  answerSurvey($, on, () => ({ model: 'claude-test', agentId: 'a1' }))
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'probe-n1' })
  expect(await ui.find({ type: 'Text', text: '조사 중' })).toMatchObject({ props: { color: 'warning' } })
  expect(await ui.find({ type: 'Text', text: /'저장 방식' 조사를 띄웠습니다/ })).toBeDefined()
  // A second agent is not offered for the same decision; the other is untouched
  expect(await ui.find({ key: 'probe-n1' })).toBeUndefined()
  await ui.press({ key: 'node-n2' })
  expect(await ui.find({ key: 'probe-n2' })).toBeDefined()
  await ui.unmount()
})

test('the hint line says the keys that work now, and carries the language button', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  const hintText = async () => String((textsIn(await ui.find({ key: 'hint' }))[0].children || [])[0])
  // Digits are live with one decision open
  expect(await hintText()).toBe('Tab 이동 · Enter 선택 · Esc 프롬프트로 · 숫자 키로 선택')
  expect(await ui.find({ key: 'viewbar' })).toBeDefined()
  expect(textsIn(await ui.find({ key: 'viewbar' })).some((t) => String((t.children || [])[0]) === 'EN')).toBe(false)
  expect(await ui.find({ key: 'lang' })).toBeDefined()
  // Not with every decision open
  await ui.press({ key: 'expand' })
  expect(await hintText()).toBe('Tab 이동 · Enter 선택 · Esc 프롬프트로')
  // In a field, only the keys that close it
  await ui.press({ key: 'add-ctx' })
  expect(await hintText()).toBe('Enter 저장 · Esc 닫기')
  await ui.unmount()
})

test('an answer written in shows on the open card with the same tick as a pick', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'written-n1' })).toBeUndefined()

  await ui.press({ key: 'open-write-n1' })
  await ui.input({ key: 'write-n1', text: 'Postgres 테이블 추가' })
  const row = await ui.find({ key: 'written-n1' })
  expect(row).toBeDefined()
  expect(textsIn(row)[0]).toMatchObject({ props: { color: 'success', bold: true } })
  expect(await ui.find({ type: 'Text', text: '직접 입력 · Postgres 테이블 추가' })).toBeDefined()
  // Picking a listed choice afterwards takes the row away again
  await ui.press({ key: 'opt-n1-o2' })
  expect(await ui.find({ key: 'written-n1' })).toBeUndefined()
  await ui.unmount()
})

test('earlier rounds are listed as Pass rows above the questions, and can be asked again', async ($, on) => {
  await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  // Nothing has been settled or held yet, so nothing is listed
  expect(await ui.find({ key: 'past-n1' })).toBeUndefined()

  await ui.press({ key: 'opt-n1-o1' })
  await ui.press({ key: 'submit' })
  // The settled one opens with a green Pass, the held one with the held word, dim
  const settled = textsIn(await ui.find({ key: 'past-n1' })).map((t) => [String((t.children || [])[0]), t.props])
  expect(settled[0][0]).toBe('Pass')
  expect(settled[0][1]).toMatchObject({ color: 'success', bold: true })
  expect(settled.map((s) => s[0])).toContain('SQLite')
  const held = textsIn(await ui.find({ key: 'past-n2' })).map((t) => [String((t.children || [])[0]), t.props])
  expect(held[0][0]).toBe('미룸')
  expect(held[0][1]).toMatchObject({ color: 'inactive' })
  expect(held.map((s) => s[0])).not.toContain('→')

  // Both sit above the new question, under the heading; the actions close the card
  const rows = (await ui.find({ key: 'treecard' })).children as Array<{ props?: { key?: string } }>
  const at = (key: string) => rows.findIndex((r) => r.props && r.props.key === key)
  expect(at('past-n1')).toBe(at('treebar') + 1)
  expect(at('past-n2')).toBe(at('past-n1') + 1)
  expect(await ui.find({ key: 'past-n2' })).toMatchObject({ props: { marginTop: 1 } })
  expect(at('row-n3')).toBeGreaterThan(at('past-n2'))
  expect(at('actionbar')).toBeGreaterThan(at('row-n3'))

  // The held decision comes back onto the open layer, beside the new one
  await ui.press({ key: 'reask-n2' })
  expect(await ui.find({ key: 'node-n2' })).toBeDefined()
  expect(await ui.find({ key: 'node-n3' })).toBeDefined()
  expect(await ui.find({ key: 'submit', text: /0\/2/ })).toBeDefined()
  expect(await zoneCount(ui, 'deferred')).toBe(0)
  await ui.unmount()
})

test('a criterion can be edited in place, the way a context row can', async ($, on) => {
  const submitted: string[] = []
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await openTree($, on, [LAYER1, DONE])
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })
  const [row] = (await ui.find({ key: 'feedcard' })).children.filter((r: any) => String(r.props?.key).startsWith('feedrow-'))
  const id = String(row.props.key).replace('feedrow-', '')

  // The edit button opens a field holding the row's text, in the row's place
  await ui.press({ key: 'edit-feed-' + id })
  expect(await ui.find({ key: 'feed-edit-' + id })).toMatchObject({ props: { value: '배포 없이 되돌릴 수 있어야 한다', autoFocus: true } })
  await ui.input({ key: 'feed-edit-' + id, text: '배포 없이 되돌릴 수 있고, 한글이 깨지지 않아야 한다' })
  // Saved: the row shows the new text, the field is gone, and the handoff carries it
  expect(await ui.find({ key: 'feed-edit-' + id })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '배포 없이 되돌릴 수 있고, 한글이 깨지지 않아야 한다' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '배포 없이 되돌릴 수 있어야 한다' })).toBeUndefined()
  // The close button puts an open field away without saving
  await ui.press({ key: 'edit-feed-' + id })
  await ui.press({ key: 'close-feed-' + id })
  expect(await ui.find({ key: 'feed-edit-' + id })).toBeUndefined()

  await ui.press({ key: 'auto' })
  await ui.press({ key: 'submit' })
  await ui.press({ key: 'handoff' })
  expect(submitted[0]).toContain('- [ ] 배포 없이 되돌릴 수 있고, 한글이 깨지지 않아야 한다')
  await ui.unmount()
})

test('a new /tree starts clean: the last interview\'s context and criteria do not ride along', async ($, on) => {
  const seen = await openTree($, on, [LAYER1, LAYER2])
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '결제사는 토스만 쓴다' })
  await ui.press({ key: 'add-feed' })
  await ui.input({ key: 'feed', text: '배포 없이 되돌릴 수 있어야 한다' })

  await $.command.run({ command: 'tree', args: '알림 발송 채널을 정하고 싶다' })
  // The first layer of the new tree is asked for without the old premises
  expect(seen.prompts[1]).toContain('알림 발송 채널을 정하고 싶다')
  expect(seen.prompts[1]).not.toContain('결제사는 토스만 쓴다')
  expect(seen.prompts[1]).not.toContain('배포 없이 되돌릴 수 있어야 한다')
  expect(await ui.find({ type: 'Text', text: '결제사는 토스만 쓴다' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '배포 없이 되돌릴 수 있어야 한다' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '1단계' })).toBeDefined()
  await ui.unmount()
})

test('stopping the wait on the first layer offers try again, and the late reply is thrown away', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let release: (() => void) | null = null
  let calls = 0
  answerSurvey($, on)
  on('model.fork', async () => {
    calls += 1
    // The first call hangs until the test lets it go; the retry answers at once
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
    return { value: { isAnswered: true, text: LAYER1 } }
  })

  const run = $.command.run({ command: 'tree', args: SEED })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'cancel' })).toBeDefined()
  await ui.press({ key: 'cancel' })
  // No tree stands yet, and still the pane offers to try again
  expect(await ui.find({ key: 'retry' })).toBeDefined()

  // The stopped call comes back: its layer must not appear out of nowhere
  if (release) (release as () => void)()
  await run
  expect(await ui.find({ key: 'node-n1' })).toBeUndefined()
  expect(await ui.find({ key: 'retry' })).toBeDefined()

  await ui.press({ key: 'retry' })
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  expect(calls).toBe(2)
  await ui.unmount()
})

// A link added to the context: the model building a layer has no tools, so
// what it points at is read by an agent when the context is applied
const LINK = 'https://example.atlassian.net/browse/MOB-4986'
const ISSUE = ['### ' + LINK, '제목: 로그인 세션 만료 정책', '요구사항: 세션 만료 시 재로그인 없이 토큰을 갱신한다', '수용 기준: 만료 후 첫 요청이 401 없이 성공한다'].join('\n')

function spawnReader($: any, on: any, agentId = 'r1') {
  const spawned: string[] = []
  answerSurvey($, on, (e) => {
    spawned.push(String(e.prompt))
    return { model: 'claude-test', agentId }
  })
  return spawned
}

function turnOf(agentId: string, answer: string, reason: 'answer' | 'error' = 'answer') {
  return { agentId, answer, reason, turnId: 't-' + agentId, durationMs: 1, isAborted: false }
}

// A request goes as written, link and all, first to the agent that checks
// it and then to the model with that check beside it
const SENTENCE = '세션 만료 정책 정리해야 하는데 ' + LINK + ' 이거 보고 기존 토큰 갱신 코드도 서칭해서 맞춰줘'

test('a request is checked by an agent as written, and the first layer stands on that check', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const check = answerSurvey($, on)
  const seen = stubLayers($, on, [LAYER1])

  await $.command.run({ command: 'tree', args: SENTENCE })
  const ui = await $.ui.mount(PANE)
  expect(check.prompts.length).toBe(1)
  expect(check.prompts[0]).toContain(SENTENCE)
  expect(seen.calls).toBe(1)
  expect(seen.prompts[0]).toContain('## 요구\n\n' + SENTENCE)
  expect(seen.prompts[0]).toContain('검증: 요구\n')
  expect(seen.prompts[0]).toContain(SURVEY)
  // The link in the request is the check's to read, not a separate fetch
  expect(seen.prompts[0]).not.toContain('읽음:')
  expect(await ui.find({ key: 'node-n1' })).toBeDefined()
  await ui.unmount()
})

test('a link added to the context is read when the context is applied', async ($, on) => {
  const clock = mock.clock(on)
  const spawned = spawnReader($, on, 'r2')
  const seen = await openTree($, on, [LAYER1, LAYER1])
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '참고: ' + LINK })

  const apply = ui.press({ key: 'apply' })
  await clock.settle()
  await $.turn.complete(turnOf('r2', ISSUE))
  await apply
  expect(spawned[0]).toContain(LINK)
  // The rebuilt layer was asked for with both the row and what its link said
  expect(seen.prompts[1]).toContain('[미반영] 참고: ' + LINK)
  expect(seen.prompts[1]).toContain('[미반영] 읽음: ' + LINK)
  expect(seen.prompts[1]).toContain('제목: 로그인 세션 만료 정책')
  // A second apply reads nothing again: the link is known
  await ui.press({ key: 'add-ctx' })
  await ui.input({ key: 'ctx', text: '하나 더' })
  await ui.press({ key: 'apply' })
  expect(spawned.length).toBe(1)
  await ui.unmount()
})

test('the hint line has a close button that puts the pane away', async ($, on) => {
  const closed: string[] = []
  on('ui.close', ($: unknown, e: { id: string }) => {
    closed.push(e.id)
    return { value: undefined }
  })
  await openTree($, on, [LAYER1])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'close' })).toBeDefined()
  await ui.press({ key: 'close' })
  expect(closed).toEqual(['tree'])
  await ui.unmount()
})

test('a request that cannot be checked builds no tree, and says why', async ($, on) => {
  servePrompts(on)
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ deny: 'agents are off' }))
  let calls = 0
  on('model.fork', () => {
    calls += 1
    return { value: { isAnswered: true, text: LAYER1 } }
  })

  await $.command.run({ command: 'tree', args: SEED })
  const ui = await $.ui.mount(PANE)
  // No layer is guessed without the check behind it
  expect(calls).toBe(0)
  expect(await ui.find({ type: 'Text', text: /요구를 검증하지 못했습니다 — .*agents are off/ })).toBeDefined()
  expect(await ui.find({ key: 'node-n1' })).toBeUndefined()
  await ui.unmount()
})
