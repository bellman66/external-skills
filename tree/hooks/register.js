import { atom, read, update } from 'claude-code'

// The pane's id, used to open it and to recognize it while drawing
const PANE = 'tree'

// Every decision the interview has raised so far
const nodes = atom({ plugin: 'tree', key: 'nodes' }, [])
// What the user says the finished work has to satisfy
const feeding = atom({ plugin: 'tree', key: 'feeding' }, [])
// Everything the user wants the interview to know besides the request itself,
// each item marked by whether a round has folded it into the tree yet. A new
// key, so lists kept under the old memo key are left behind.
const context = atom({ plugin: 'tree', key: 'context' }, [])
// Which layer is open, what is expanded, and whether a call is in flight
const view = atom(
  { plugin: 'tree', key: 'view' },
  {
    layer: 0,
    busy: false,
    notice: '',
    isComplete: false,
    expanded: 'one',
    focusId: null,
    auto: false,
    lang: 'ko',
    adding: [],
    // the request the tree grew out of has been read by a round
    seedApplied: false,
    // an applied item was removed, so the tree rests on context no longer there
    stale: false,
    // the applied items sit folded under one line
    folded: true,
    // the context row whose field is open for editing
    editing: null,
    // the last apply came back without a tree
    applyFailed: false,
    // the notice on screen is a failure, said in the error color
    alert: false,
    // the decision whose write-in field is open
    writing: null,
    // the decisions a research agent has been sent at
    probing: [],
  },
)

// Every word the pane shows, and the one prompt line that picks the reply's
// language. Add a pack here and it is available everywhere at once.
const PACKS = {
  ko: {
    name: '한국어',
    other: 'EN',
    tree: '질문',
    treeTag: '(tree)',
    feeding: '원하는 결과',
    feedingTag: '(feeding)',
    feedPlaceholder: '결과물이 만족해야 할 조건을 적고 Enter',
    feedSubmit: '추가',
    beforeStart: '시작 전',
    step: (n) => n + '단계',
    picked: (a, b) => b + '개 중 ' + a + '개 선택함',
    nothingOpen: '고를 것 없음',
    reask: '다시 묻기',
    writtenAs: (a) => '직접 입력 · ' + a,
    why: '왜 묻나 · ',
    recommended: '★추천',
    writeIn: '직접 입력',
    writeInPlaceholder: '위에 없는 답을 적고 Enter',
    writeInSubmit: '선택',
    probe: '코드에서 찾아보기',
    probing: '조사 중',
    stopWaiting: '그만 기다리기',
    expandAll: '전체 펼치기',
    expandOne: '하나씩 보기',
    autoOn: '추천 자동선택 켜짐',
    autoOff: '추천으로 모두 선택',
    next: (a, b, held) => '다음 단계로 (s) · ' + a + '/' + b + (held ? ' · ' + held + '개는 미룸' : ''),
    retry: '다시 시도 (t)',
    handoff: 'Claude에 넘기고 종료하기 (r)',
    handoffPartial: '여기까지만 넘기기',
    thinking: '생각하는 중',
    firstLayerBusy: '첫 단계를 세우는 중',
    nextLayerBusy: '다음 단계를 계산하는 중',
    spawning: '조사 에이전트를 띄우는 중',
    spawned: (title) => "'" + title + "' 조사를 띄웠습니다 — 결과는 대화 쪽으로 돌아옵니다.",
    noSeed: 'tree: 무엇을 정할지 한 줄 적어주세요. 예: /tree 결제 연동 붙이고 싶다',
    failedFirst: (why) => '트리를 세우지 못했습니다 — ' + why,
    failedFirstThrow: (why) => '트리를 세우다 끊겼습니다 — ' + why,
    failedNext: (why) => '다음 단계를 받지 못했습니다 — ' + why,
    failedThrow: (why) => '계산이 끊겼습니다 — ' + why,
    failedSpawn: (why) => '조사 에이전트를 띄우지 못했습니다: ' + why,
    noAnswer: (why) => '모델이 답하지 않았습니다 — ' + why,
    badJson: (head) => 'JSON 을 읽지 못했습니다 — ' + head,
    noCall: (why) => '모델을 부르지 못했습니다 — ' + why,
    heldBy: '사용자가 미룸',
    passMark: 'Pass',
    askIt: '묻기',
    expansion: '확장',
    hoAssumed: '질문 없이 정했다. 근거',
    droppedBy: '전제가 바뀌어 빠짐',
    applyContext: '컨텍스트 반영 (m)',
    applyRetry: '컨텍스트 반영 다시 시도 (m)',
    applyBusy: '컨텍스트를 트리에 반영하는 중',
    commandDescription: '결정 트리를 열고 단계별로 인터뷰한다',
    commandHint: '[무엇을 정할지]',
    replyLanguage: '노드의 title, question, tag 와 선택지의 label, detail 은 모두 한국어로 써라.',
    hoTitle: '# 작업 지시',
    hoGoal: '## 하려는 일',
    hoNoGoal: '(요구가 적히지 않았다)',
    hoPremise: '## 전제 — 사용자가 못박은 것',
    hoDecisions: '## 확정된 결정',
    hoQuestion: '물은 것',
    hoWhy: '왜 물었나',
    hoGround: '그 선택을 고른 근거',
    hoWritten: '사용자가 선택지 대신 직접 적은 답이다',
    hoNoAnswer: '(답 없음)',
    hoCriteria: '## 결과물이 만족해야 할 조건',
    hoHeld: '## 정하지 않은 것 — 물었지만 미룸',
    hoDropped: '## 빼기로 한 것 — 전제가 바뀌어 무효가 됨',
    hoHow: '## 진행 방법',
    hoRules: [
      '위 결정은 사용자와 이미 합의된 것이다. 다시 묻지 말고 그대로 전제하라.',
      '전제와 결정이 어긋나 보이면 전제가 우선이다. 그 지점을 한 줄로 알려라.',
      '결정에 없는 세부는 네 판단으로 가장 단순한 쪽을 고르고, 고른 바를 한 줄로 밝혀라.',
    ],
    hoRuleHeld: '미룬 항목은 지금 결정하지 말고, 그 자리에 오면 사용자에게 물어라.',
    hoRuleDropped: '빼기로 한 항목은 고려 대상이 아니다. 되살리지 마라.',
    hoRuleCriteria: '작업을 마친 뒤 조건 목록을 하나씩 짚어 충족 여부를 보고하라.',
    context: '컨텍스트',
    contextTag: '(context)',
    applied: '반영됨',
    unapplied: '미반영',
    appliedCount: (n) => '반영됨 ' + n + '개',
    editItem: '수정',
    saveItem: '저장',
    addItem: '추가',
    closeItem: '닫기',
    removeItem: 'x',
    contextPlaceholder: '선택지로 못 담는 전제·제약을 적고 Enter',
    zones: { known: '정함', gray: '애매', unknown: '미정', deferred: '미룸' },
    hint: 'Tab 이동 · Enter 선택 · Esc 프롬프트로',
    hintKeys: '숫자 키로 선택',
    hintBusy: 'c 그만 기다리기 · Esc 프롬프트로',
    hintField: 'Enter 저장 · Esc 닫기',
  },
  en: {
    name: 'English',
    other: '한국어',
    tree: 'Questions',
    treeTag: '(tree)',
    feeding: 'Desired outcome',
    feedingTag: '(feeding)',
    feedPlaceholder: 'a condition the result must meet, then Enter',
    feedSubmit: 'add',
    beforeStart: 'not started',
    step: (n) => 'step ' + n,
    picked: (a, b) => a + ' of ' + b + ' picked',
    nothingOpen: 'nothing to pick',
    reask: 'ask again',
    writtenAs: (a) => 'written · ' + a,
    why: 'why asked · ',
    recommended: '★pick',
    writeIn: 'Write in',
    writeInPlaceholder: 'an answer not listed above, then Enter',
    writeInSubmit: 'pick',
    probe: 'look in the code',
    probing: 'researching',
    stopWaiting: 'stop waiting',
    expandAll: 'expand all',
    expandOne: 'one at a time',
    autoOn: 'auto-pick on',
    autoOff: 'pick all recommended',
    next: (a, b, held) => 'Next step (s) · ' + a + '/' + b + (held ? ' · ' + held + ' held' : ''),
    retry: 'Try again (t)',
    handoff: 'Hand to Claude and close (r)',
    handoffPartial: 'hand over what is settled',
    thinking: 'thinking',
    firstLayerBusy: 'building the first step',
    nextLayerBusy: 'working out the next step',
    spawning: 'starting a research agent',
    spawned: (title) => "A research agent is on '" + title + "' — its findings come back in the conversation.",
    noSeed: 'tree: write one line about what to decide, e.g. /tree add a payments integration',
    failedFirst: (why) => 'Could not build the tree — ' + why,
    failedFirstThrow: (why) => 'Building the tree was cut short — ' + why,
    failedNext: (why) => 'No next step came back — ' + why,
    failedThrow: (why) => 'The call was cut short — ' + why,
    failedSpawn: (why) => 'Could not start the research agent: ' + why,
    noAnswer: (why) => 'The model did not answer — ' + why,
    badJson: (head) => 'The reply would not parse as JSON — ' + head,
    noCall: (why) => 'Could not reach the model — ' + why,
    heldBy: 'held by the user',
    passMark: 'Pass',
    askIt: 'ask',
    expansion: 'added',
    hoAssumed: 'settled without asking; grounds',
    droppedBy: 'dropped — its premise changed',
    applyContext: 'apply context (m)',
    applyRetry: 'apply context again (m)',
    applyBusy: 'folding the context into the tree',
    commandDescription: 'Open the decision tree and interview yourself through it',
    commandHint: '[what you want to decide]',
    replyLanguage: 'Write every title, question, tag, option label and detail in English.',
    hoTitle: '# Work order',
    hoGoal: '## What this is for',
    hoNoGoal: '(no request was written down)',
    hoPremise: '## Premises — fixed by the user',
    hoDecisions: '## Settled decisions',
    hoQuestion: 'asked',
    hoWhy: 'why it was asked',
    hoGround: 'grounds for this choice',
    hoWritten: 'the user wrote this answer instead of taking a listed choice',
    hoNoAnswer: '(no answer)',
    hoCriteria: '## What the result has to satisfy',
    hoHeld: '## Left open — asked, then held',
    hoDropped: '## Struck out — its premise changed',
    hoHow: '## How to proceed',
    hoRules: [
      'The decisions above are already agreed with the user. Take them as given; do not ask again.',
      'Where a premise and a decision disagree, the premise wins. Say in one line where that happened.',
      'For detail no decision covers, take the simplest option and state in one line what you took.',
    ],
    hoRuleHeld: 'Do not decide the held items now — ask the user when you reach them.',
    hoRuleDropped: 'The struck-out items are out of scope. Do not revive them.',
    hoRuleCriteria: 'When the work is done, go through the criteria one by one and report on each.',
    context: 'Context',
    contextTag: '(context)',
    applied: 'applied',
    unapplied: 'pending',
    appliedCount: (n) => n + ' applied',
    editItem: 'edit',
    saveItem: 'save',
    addItem: 'add',
    closeItem: 'close',
    removeItem: 'x',
    contextPlaceholder: 'a constraint no choice covers, then Enter',
    zones: { known: 'settled', gray: 'unclear', unknown: 'open', deferred: 'held' },
    hint: 'Tab moves · Enter presses · Esc back to the prompt',
    hintKeys: 'digits pick',
    hintBusy: 'c stops waiting · Esc back to the prompt',
    hintField: 'Enter saves · Esc closes',
  },
}

function pack(lang) {
  return PACKS[lang] || PACKS.ko
}
// Answers picked in this layer but not sent yet
const draft = atom({ plugin: 'tree', key: 'draft' }, {})
// The prompt the tree grew out of
const seed = atom({ plugin: 'tree', key: 'seed' }, '')

// ── plain helpers, no mods API ────────────────────────────────────────────────

// One round's reply: the next layer of decisions, and any earlier ones to reopen
function parseStep(text, layer) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  let parsed
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || !Array.isArray(parsed.nodes)) return null
  // Keep only what the pane can draw, so one bad field can't break a redraw
  const fresh = parsed.nodes
    .filter((n) => n && typeof n.id === 'string' && typeof n.title === 'string')
    .map((n) => ({
      id: n.id,
      layer,
      title: n.title,
      zone: n.zone === 'gray' ? 'gray' : 'unknown',
      tag: typeof n.tag === 'string' ? n.tag : '',
      question: typeof n.question === 'string' ? n.question : '',
      options: Array.isArray(n.options)
        ? n.options
            .filter((o) => o && typeof o.label === 'string')
            .map((o, i) => ({
              id: typeof o.id === 'string' ? o.id : 'o' + (i + 1),
              // The recommendation becomes a mark, not words inside the label
              label: o.label.replace(/\s*\(추천\)\s*$/, '').trim(),
              detail: typeof o.detail === 'string' ? o.detail : '',
              isPick: /\(추천\)\s*$/.test(o.label),
            }))
        : [],
      answer: '',
      parent: typeof n.parent === 'string' ? n.parent : '',
      isExpansion: n.isExpansion === true,
    }))
  // Decided without asking: settled on arrival, shown so the user can still ask
  const assumed = (Array.isArray(parsed.assumed) ? parsed.assumed : [])
    .filter((a) => a && typeof a.title === 'string' && typeof a.answer === 'string')
    .map((a, i) => ({
      id: 'L' + layer + 'a' + (i + 1),
      layer,
      title: a.title,
      zone: 'known',
      tag: typeof a.why === 'string' ? a.why : '',
      question: '',
      options: [],
      answer: a.answer,
      assumed: true,
    }))
  const revisit = Array.isArray(parsed.revisit) ? parsed.revisit.filter((id) => typeof id === 'string') : []
  const drop = Array.isArray(parsed.drop) ? parsed.drop.filter((id) => typeof id === 'string') : []
  return { nodes: [...fresh, ...assumed], revisit, drop }
}

// A decision's fate is its subtree's: struck with its parent, and held with
// it unless already settled
function cascade(list) {
  let changed = true
  while (changed) {
    changed = false
    list = list.map((n) => {
      const parent = n.parent && list.find((one) => one.id === n.parent)
      if (!parent || parent.zone !== 'deferred' || n.zone === 'deferred') return n
      if (!parent.dropped && n.zone === 'known') return n
      changed = true
      return parent.dropped ? { ...n, zone: 'deferred', answer: '', dropped: true } : { ...n, zone: 'deferred' }
    })
  }
  return list
}

// Nodes still waiting for an answer in the given layer
const openIn = (list, layer) => list.filter((n) => n.layer === layer && n.zone !== 'known' && n.zone !== 'deferred')

// ── the prompt: what a tree is, then the state stacked underneath ───────────
//
// prompts/tree.md says what the tree is and how it grows, for every call
// alike. The code only turns the state it holds into titled sections under
// it — how to read each one, and what to do when a tree already stands, is
// the .md's business.

// Read from where the plugin ships it, once per process
let treeText = null

async function loadTree($) {
  if (!treeText) treeText = await $.fs.read($.plugin.root + '/prompts/tree.md')
  return treeText
}

// One section per piece of state. Each says what is, never what to do about it.
const section = {
  request: (seedText) => ({ title: '요구', body: seedText }),
  tree: (list) => ({
    title: '지금까지의 트리',
    body: list
      .map((n) => {
        const answer = n.answer ? ' 확정="' + n.answer + '"' : ''
        const tag = n.tag ? ' 근거="' + n.tag + '"' : ''
        const parent = n.parent ? ' ^' + n.parent : ''
        return '- ' + n.id + ' [L' + n.layer + '/' + n.zone + '] ' + n.title + answer + tag + parent
      })
      .join('\n'),
  }),
  progress: (list, layer) => ({
    title: '진행 상황',
    body: [
      '만들 레이어: ' + layer,
      '확정된 결정: ' + list.filter((n) => n.zone === 'known').length + '개',
      '레이어 상한: ' + MAX_LAYERS,
    ].join('\n'),
  }),
  feeding: (feeds) => ({ title: '원하는 결과', body: feeds.map((f) => '- ' + f.text).join('\n') }),
  context: (items) => ({
    title: '컨텍스트',
    body: items.map((m) => '- [' + (m.applied ? '반영됨' : '미반영') + '] ' + m.text).join('\n'),
  }),
  language: (lang) => ({ title: '출력 언어', body: pack(lang).replyLanguage }),
}

// One ask for every round: the first layer, the next one, or the open one
// rebuilt. Which layer the reply fills is the caller's to place. A section
// with nothing in it — no tree yet, say — is left out.
function treePrompt(text, seedText, list, feeds, items, layer, lang) {
  const sections = [
    section.request(seedText),
    section.tree(list),
    section.progress(list, layer),
    section.feeding(feeds),
    section.context(items),
    section.language(lang),
  ]
  const stacked = sections.filter((one) => one.body).map((one) => '## ' + one.title + '\n\n' + one.body)
  return [text.trim(), ...stacked].join('\n\n')
}

// The whole interview, written so the next session can start work from it
// without asking anything again: what the job is, what was fixed and why,
// what it has to satisfy, and what was deliberately left open or thrown out.
function handoffText(list, feeds, items, seedText, lang) {
  const L = pack(lang)
  const settled = list.filter((n) => n.zone === 'known')
  const dropped = list.filter((n) => n.zone === 'deferred' && n.dropped)
  const held = list.filter((n) => n.zone === 'deferred' && !n.dropped)
  const lines = [L.hoTitle, '', L.hoGoal, '', seedText || L.hoNoGoal]

  if (items.length) {
    lines.push('', L.hoPremise)
    for (const m of items) lines.push('- ' + m.text)
  }

  if (settled.length) {
    lines.push('', L.hoDecisions)
    settled.forEach((n, i) => {
      lines.push('', '### ' + (i + 1) + '. ' + n.title + ' → ' + (n.answer || L.hoNoAnswer))
      // The choice's own reasoning, when the answer came from the list
      const chosen = (n.options || []).find((o) => o.label === n.answer)
      if (n.assumed) return lines.push('- ' + L.hoAssumed + ': ' + n.tag)
      if (n.question) lines.push('- ' + L.hoQuestion + ': ' + n.question)
      if (n.tag) lines.push('- ' + L.hoWhy + ': ' + n.tag)
      if (chosen && chosen.detail) lines.push('- ' + L.hoGround + ': ' + chosen.detail)
      if (!chosen && n.answer) lines.push('- ' + L.hoWritten)
    })
  }

  if (feeds.length) {
    lines.push('', L.hoCriteria)
    for (const f of feeds) lines.push('- [ ] ' + f.text)
  }

  if (held.length) {
    lines.push('', L.hoHeld)
    for (const n of held) lines.push('- ' + n.title + (n.question ? ' — ' + n.question : ''))
  }

  if (dropped.length) {
    lines.push('', L.hoDropped)
    for (const n of dropped) lines.push('- ' + n.title)
  }

  lines.push('', L.hoHow)
  for (const rule of L.hoRules) lines.push('- ' + rule)
  if (held.length) lines.push('- ' + L.hoRuleHeld)
  if (dropped.length) lines.push('- ' + L.hoRuleDropped)
  if (feeds.length) lines.push('- ' + L.hoRuleCriteria)
  return lines.join('\n')
}

function clip(text, width) {
  if (width <= 0 || text.length <= width) return text
  return text.slice(0, Math.max(1, width - 1)) + '…'
}

// Columns each count takes on a meter `width` wide, rounded so they add up to it
function meterWidths(counts, width) {
  const total = counts.reduce((sum, n) => sum + n, 0)
  if (!total) return counts.map(() => 0)
  const raw = counts.map((n) => (n * width) / total)
  const out = raw.map(Math.floor)
  let left = width - out.reduce((sum, n) => sum + n, 0)
  const byRemainder = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0])
  for (const [, i] of byRemainder) {
    if (left <= 0) break
    if (!counts[i]) continue
    out[i] += 1
    left -= 1
  }
  return out
}

// The tree on the summary card: leaves per canopy row, centred on one
// column, and the trunk and ground drawn under them
const CANOPY = [3, 5, 7, 8, 7, 5]
const TREE_MID = 8
const TREE_W = 16
const TRUNK = ['     ╲  │  ╱', '       ╲│╱', '        │', '  ╶─────┴─────╴']
// Each zone's own shade on the meter, so it still reads without color
const ZONE_SHADE = { known: '█', gray: '▓', unknown: '░', deferred: '▒' }

// The section titles' color: the theme's blue, the one its own dialogs ask
// in — off the traffic light, and off the accent the handover button has
const HEADING_COLOR = 'permission'

// The most rounds one interview runs before it hands over
const MAX_LAYERS = 4

// The summary's tree needs this many rows of room before it is drawn; under
// that the first question would start below the fold
const TREE_ROWS = 36

// Frames of the spinner, and the tick a timer advances while a call is out
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let tick = 0
let spin = null

// Which call the pane is waiting for. Stopping the wait, or sending a newer
// call, moves it on, and a reply to an older one is thrown away when it lands
let generation = 0

// The pane only redraws when asked, so a running call needs its own heartbeat
function startSpin($) {
  if (spin) return
  try {
    spin = $.clock.every(120, () => {
      tick += 1
      $.ui.invalidate('ui.render')
    })
  } catch {
    // A refused timer costs the animation, never the call it was waiting on
    spin = null
  }
}

function stopSpin() {
  if (spin) spin.cancel()
  spin = null
}

// The recommendation of each decision not answered yet — auto-pilot's one move
function fillRecommended(open, picked) {
  const next = { ...picked }
  for (const node of open) {
    if (next[node.id] && next[node.id].trim()) continue
    const pick = node.options.find((o) => o.isPick) || node.options[0]
    if (pick) next[node.id] = pick.label
  }
  return next
}

// What a round is about to read, so only what it really read is marked applied
// once it comes back — an item edited meanwhile stays pending
function contextSent(seedText, items) {
  return { seed: seedText, items: items.map((m) => ({ id: m.id, text: m.text })) }
}

// ── calls that need the mods API ──────────────────────────────────────────────

// A round came back with a tree: what it read is applied, and folds away
async function settleContext($, sent) {
  await update($, context, (list) =>
    list.map((m) => (sent.items.some((x) => x.id === m.id && x.text === m.text) ? { ...m, applied: true } : m)),
  )
  const now = await read($, seed)
  await update($, view, (v) => ({
    ...v,
    seedApplied: now === sent.seed,
    stale: false,
    folded: true,
    applyFailed: false,
  }))
}

// The recent conversation, written out for the calls that can't ride on a fork
async function gatherContext($) {
  const history = await $.session.messages()
  const lines = []
  for (const row of history.slice(-12)) {
    if (!row || !row.text || !row.text.trim()) continue
    lines.push((row.role === 'user' ? '사용자' : 'Claude') + ': ' + row.text.trim().slice(0, 2000))
  }
  if (!lines.length) return ''
  return '지금까지의 대화:\n' + lines.join('\n\n').slice(0, 12000) + '\n\n'
}

// One model call per layer, not per node. A fork rides on this conversation for
// free, but there is nothing to fork until the main thread has answered once —
// which is where /tree starts — so it falls back to a completion that carries
// the recent messages itself.
async function think($, prompt, layer, lang) {
  let reply = null
  try {
    reply = await $.model.fork({ prompt: '너는 이 대화의 맥락을 그대로 알고 있다.\n\n' + prompt })
  } catch (error) {
    reply = { isAnswered: false, reason: String(error && error.message ? error.message : error) }
  }
  if (!reply.isAnswered) {
    const model = await $.session.model()
    const context = await gatherContext($)
    try {
      reply = await $.model.complete({ model, prompt: context + prompt, maxTokens: 8000 })
    } catch (error) {
      return { step: null, why: pack(lang).noCall(String(error && error.message ? error.message : error)) }
    }
  }
  if (!reply.isAnswered) return { step: null, why: pack(lang).noAnswer(reply.reason) }
  const step = parseStep(reply.text, layer)
  if (!step) return { step: null, why: pack(lang).badJson(String(reply.text).slice(0, 160)) }
  return { step, why: '' }
}

// Build the first layer out of the seed prompt
async function grow($, text) {
  const lang = (await read($, view)).lang
  const L = pack(lang)
  await update($, seed, () => text)
  const gen = ++generation
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.firstLayerBusy, seedApplied: false }))
  let message = ''
  let opened = null
  try {
    const feeds = await read($, feeding)
    const items = await read($, context)
    const sent = contextSent(text, items)
    const grown = await think($, treePrompt(await loadTree($), text, [], feeds, items, 1, lang), 1, lang)
    if (gen !== generation) return
    if (!grown.step) {
      message = L.failedFirst(grown.why)
    } else {
      await update($, nodes, () => grown.step.nodes)
      opened = openIn(grown.step.nodes, 1)
      await settleContext($, sent)
      const state = await read($, view)
      if (state.auto && opened.length) await update($, draft, (d) => fillRecommended(opened, d))
    }
  } catch (error) {
    if (gen !== generation) return
    message = L.failedFirstThrow(String(error && error.message ? error.message : error))
  }
  stopSpin()
  await update($, view, (v) => ({
    ...v,
    layer: opened && opened.length ? 1 : v.layer,
    busy: false,
    notice: message,
    alert: Boolean(message),
    applyFailed: !opened,
    isComplete: opened ? opened.length === 0 : v.isComplete,
    focusId: opened && opened.length ? opened[0].id : null,
  }))
  if (message) $.ui.log('tree: ' + message)
}

// Send the whole layer at once: every picked answer settles, the rest are held,
// and one call builds the layer that those answers opened up
async function submitLayer($) {
  const current = await read($, nodes)
  const picked = await read($, draft)
  const state = await read($, view)
  const lang = state.lang
  const inLayer = current.filter((n) => n.layer === state.layer && n.zone !== 'known' && n.zone !== 'deferred')
  if (!inLayer.length) return

  const settled = []
  const held = []
  const next = current.map((n) => {
    if (!inLayer.some((row) => row.id === n.id)) return n
    const answer = picked[n.id]
    if (answer && answer.trim()) {
      const done = { ...n, zone: 'known', answer: answer.trim() }
      settled.push(done)
      return done
    }
    const skipped = { ...n, zone: 'deferred', tag: n.tag || pack(lang).heldBy }
    held.push(skipped)
    return skipped
  })

  await update($, nodes, () => next)
  await update($, draft, () => ({}))
  await advance($, state.layer)
}

// Ask for the layer after `fromLayer`. Whatever happens — a refusal, a reply
// that won't parse, a call that throws — the pane comes back out of its wait,
// because a stuck spinner leaves the interview with no button at all.
async function advance($, fromLayer) {
  const lang = (await read($, view)).lang
  const L = pack(lang)
  // However the model judges it, the interview ends after this many rounds:
  // what is still open by then is the implementer's to settle
  if (fromLayer >= MAX_LAYERS) {
    await update($, view, (v) => ({ ...v, busy: false, notice: '', isComplete: true }))
    return
  }
  const gen = ++generation
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.nextLayerBusy }))
  let message = ''
  let moved = null
  try {
    const current = await read($, nodes)
    const feeds = await read($, feeding)
    const items = await read($, context)
    const seedText = await read($, seed)
    const sent = contextSent(seedText, items)
    const grown = await think(
      $,
      treePrompt(await loadTree($), seedText, current, feeds, items, fromLayer + 1, lang),
      fromLayer + 1,
      lang,
    )
    if (gen !== generation) return
    if (!grown.step) {
      message = L.failedNext(grown.why)
    } else {
      // A reopened node comes back into the new layer, with its answer cleared.
      // A dropped one is struck off: the premise it belonged to is gone, so it
      // keeps no answer and never reaches the handoff.
      const reopened = new Set(grown.step.revisit)
      const struck = new Set(grown.step.drop)
      const carried = current.map((n) => {
        if (struck.has(n.id)) return { ...n, zone: 'deferred', answer: '', tag: L.droppedBy, dropped: true }
        if (reopened.has(n.id)) return { ...n, layer: fromLayer + 1, zone: 'gray', answer: '' }
        return n
      })
      const added = grown.step.nodes.filter((n) => !carried.some((row) => row.id === n.id))
      const all = cascade([...carried, ...added])
      const opened = openIn(all, fromLayer + 1)
      await update($, nodes, () => all)
      await settleContext($, sent)
      const state = await read($, view)
      if (state.auto && opened.length) await update($, draft, (d) => fillRecommended(opened, d))
      moved = opened
    }
  } catch (error) {
    if (gen !== generation) return
    message = L.failedThrow(String(error && error.message ? error.message : error))
  }
  stopSpin()
  await update($, view, (v) => ({
    ...v,
    layer: moved && moved.length ? fromLayer + 1 : v.layer,
    busy: false,
    notice: message,
    alert: Boolean(message),
    isComplete: moved ? moved.length === 0 : v.isComplete,
    focusId: moved && moved.length ? moved[0].id : v.focusId,
  }))
  // Logging last, so a failure here can no longer leave the pane waiting
  if (message) $.ui.log('tree: ' + message)
}

// Fold the whole context — the request and every item — into the layer that is
// open right now, rather than making the user submit a round they already know
// is built on a dead premise. A failure leaves the tree and the badges as they were.
async function revise($) {
  const state = await read($, view)
  const layer = state.layer
  const seedText = await read($, seed)
  // No layer stands yet, so there is nothing to revise: grow it from scratch
  if (!layer) return grow($, seedText)
  const L = pack(state.lang)
  const gen = ++generation
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.applyBusy, editing: null }))
  let message = ''
  let rebuilt = null
  try {
    const current = await read($, nodes)
    const feeds = await read($, feeding)
    const items = await read($, context)
    const sent = contextSent(seedText, items)
    // The open questions of this layer are thrown away and asked for again
    const kept = current.filter((n) => !(n.layer === layer && n.zone !== 'known' && n.zone !== 'deferred'))
    const grown = await think(
      $,
      treePrompt(await loadTree($), seedText, kept, feeds, items, layer, state.lang),
      layer,
      state.lang,
    )
    if (gen !== generation) return
    if (!grown.step) {
      message = L.failedNext(grown.why)
    } else {
      const struck = new Set(grown.step.drop)
      const reopened = new Set(grown.step.revisit)
      const carried = kept.map((n) => {
        if (struck.has(n.id)) return { ...n, zone: 'deferred', answer: '', tag: L.droppedBy, dropped: true }
        if (reopened.has(n.id)) return { ...n, layer, zone: 'gray', answer: '' }
        return n
      })
      const added = grown.step.nodes.filter((n) => !carried.some((row) => row.id === n.id))
      const all = cascade([...carried, ...added])
      const opened = openIn(all, layer)
      await update($, nodes, () => all)
      // That context has been read now, so it becomes standing premises
      await settleContext($, sent)
      await update($, draft, () => ({}))
      const after = await read($, view)
      if (after.auto && opened.length) await update($, draft, (d) => fillRecommended(opened, d))
      rebuilt = opened
    }
  } catch (error) {
    if (gen !== generation) return
    message = L.failedThrow(String(error && error.message ? error.message : error))
  }
  stopSpin()
  await update($, view, (v) => ({
    ...v,
    busy: false,
    notice: message,
    alert: Boolean(message),
    applyFailed: !rebuilt,
    isComplete: rebuilt ? rebuilt.length === 0 : v.isComplete,
    focusId: rebuilt && rebuilt.length ? rebuilt[0].id : v.focusId,
  }))
  if (message) $.ui.log('tree: ' + message)
}

// Send a real subagent at one node, for the questions the code can answer
async function probe($, nodeId) {
  const current = await read($, nodes)
  const target = current.find((n) => n.id === nodeId)
  if (!target) return
  const L = pack((await read($, view)).lang)
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.spawning }))
  try {
    await $.agent.spawn({
      subagentType: 'Explore',
      description: '결정 하나의 근거 조사',
      prompt:
        '이 저장소에서 다음 결정의 근거가 될 사실만 찾아서 결론만 알려줘. 추측하지 말고 확인된 것만.\n\n결정: ' +
        target.title +
        (target.question ? '\n질문: ' + target.question : '') +
        (target.tag ? '\n근거 꼬리표: ' + target.tag : ''),
    })
    stopSpin()
    await update($, view, (v) => ({
      ...v,
      busy: false,
      notice: L.spawned(target.title),
      alert: false,
      probing: [...(v.probing || []), nodeId],
    }))
  } catch (error) {
    stopSpin()
    await update($, view, (v) => ({
      ...v,
      busy: false,
      notice: L.failedSpawn(String(error && error.message ? error.message : error)),
      alert: true,
    }))
  }
}

// Hand the settled tree to Claude and close up
async function handoff($) {
  const current = await read($, nodes)
  const feeds = await read($, feeding)
  const items = await read($, context)
  const seedText = await read($, seed)
  const lang = (await read($, view)).lang
  $.prompt
    .submit({ text: handoffText(current, feeds, items, seedText, lang), asUser: true })
    .catch(() => {})
  await $.ui.close({ id: PANE })
  await update($, view, (v) => ({ ...v, layer: 0, busy: false, notice: '', isComplete: false, focusId: null }))
}

// The seed is whatever came after /tree, or the last thing the user said
async function seedFrom($, args) {
  if (args && args.trim()) return args.trim()
  const history = await $.session.messages()
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i]
    if (row && row.role === 'user' && row.text && row.text.trim()) return row.text.trim()
  }
  return ''
}

export function register(on) {
  // Runs before the first prompt, and again after each reload
  on('session.start', async ($, e, next) => {
    // The language the user last chose, kept across sessions
    const saved = await $.store.get('lang')
    const lang = saved === 'en' || saved === 'ko' ? saved : 'ko'
    await update($, view, (v) => ({ ...v, lang }))
    await $.command.register({
      name: 'tree',
      description: pack(lang).commandDescription,
      argumentHint: pack(lang).commandHint,
      immediate: true,
    })
    return next(e)
  })

  // Runs when you type /tree
  on('command.run', { command: 'tree' }, async ($, e) => {
    const text = await seedFrom($, e.args)
    if (!text) {
      return { text: pack((await read($, view)).lang).noSeed }
    }
    await $.ui.open({ id: PANE, title: 'tree', focus: true, rows: 22 })
    // A new request starts a new interview: what the last one gathered —
    // its tree, context, criteria and unsent picks — would otherwise ride
    // into this one's prompt as standing premises
    await update($, nodes, () => [])
    await update($, context, () => [])
    await update($, feeding, () => [])
    await update($, draft, () => ({}))
    await update($, view, (v) => ({
      ...v,
      layer: 0,
      isComplete: false,
      focusId: null,
      stale: false,
      applyFailed: false,
      editing: null,
      adding: [],
      writing: null,
      probing: [],
    }))
    await grow($, text)
    // The pane is the output, so nothing goes in the transcript
    return {}
  })

  // Runs each time Claude Code draws a pane. Everything here is drawn with the
  // host's own widgets as the host draws them — a `[ label ]` button for an
  // action, `1: label` for a choice, the theme's status colors for the dots —
  // so the pane reads like the rest of Claude Code. Only the mod's own marks
  // (the traffic light, ★, ✓, ☐) are its own.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    // Leave other mods' panes alone
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, nodes)
    const feeds = await read($, feeding)
    const state = await read($, view)
    const picked = await read($, draft)
    const items = await read($, context)
    const seedText = await read($, seed)
    const L = pack(state.lang)
    const paneW = (e.props && e.props.bodyColumns) || 72
    // Every section sits in a rounded card whose border and padding take four
    // columns, so everything inside is laid out to what is left
    const width = Math.max(20, paneW - 4)
    // Esc in a field hands the keyboard back to the prompt and never reaches
    // the mod, so losing the keyboard is what puts an open field away
    const hasKeys = !(e.props && e.props.isFocused === false)
    const adding = hasKeys ? state.adding || [] : []
    const editing = hasKeys ? state.editing : null
    const writing = hasKeys ? state.writing : null
    if (!hasKeys && ((state.adding || []).length || state.editing || state.writing)) {
      Promise.resolve()
        .then(() => update($, view, (v) => ({ ...v, adding: [], editing: null, writing: null })))
        .catch(() => {})
    }
    const probing = state.probing || []
    // Something the tree has not read yet: an edited request, a pending item,
    // or an applied one taken away
    const needsApply = Boolean(seedText && !state.seedApplied) || items.some((m) => !m.applied) || Boolean(state.stale)

    const settled = list.filter((n) => n.zone === 'known')
    // The layer's questions in traffic-light order under the green Pass rows:
    // the grey ones (a direction stands) first, the red ones (nothing yet)
    // after, each group in the order the tree gave them
    const inLayer = list.filter((n) => n.layer === state.layer && n.zone !== 'known' && n.zone !== 'deferred')
    const openNow = [...inLayer.filter((n) => n.zone === 'gray'), ...inLayer.filter((n) => n.zone !== 'gray')]
    const answered = openNow.filter((n) => picked[n.id] && picked[n.id].trim()).length
    const isAll = state.expanded === 'all'

    // An opened decision sits in a bordered card, indented under its title, so
    // its text never runs into the rows above and below it
    const cardW = Math.max(20, width - 2)
    const innerW = Math.max(14, cardW - 4)
    // Two columns inside that card, while there is room for them
    const isSplit = innerW >= 64
    const leftW = isSplit ? Math.max(20, Math.floor(innerW * 0.42)) : innerW
    const rightW = isSplit ? Math.max(18, innerW - leftW - 3) : innerW
    // A title row keeps its own width, so a folded answer always has room
    const titleW = Math.max(12, Math.min(34, Math.floor(width * 0.45)))

    const blank = () => Text({ children: [' '] })

    // The traffic light in the theme's own status colors, so it follows the
    // person's theme as the engine's own marks do
    const ZONES = ['known', 'gray', 'unknown', 'deferred']
    const ZONE_COLOR = { known: 'success', gray: 'warning', unknown: 'error', deferred: 'inactive' }
    const dot = (zone) => Text({ color: ZONE_COLOR[zone] || 'error', children: ['●'] })

    // Each section is a rounded card, the way the host draws /context: the
    // border is what keeps one section apart from the next
    const card = (key, children) =>
      Box({
        key,
        width: paneW,
        borderStyle: 'round',
        borderDimColor: true,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
        children,
      })

    // A section opens with its title set off from what follows: a bar and
    // the title in the heading color, bold — the terminal has no larger
    // type, so weight and color do its work — its tag beside it, whatever
    // belongs to the heading pushed to the right edge, and a line of air
    // underneath
    const heading = (key, title, tag, right) =>
      Box({
        key,
        flexDirection: 'row',
        columnGap: 1,
        marginBottom: 1,
        children: [
          Text({ color: HEADING_COLOR, bold: true, children: ['▍' + title] }),
          Text({ dimColor: true, children: [tag] }),
          ...(right && right.length ? [Box({ flexGrow: 1 }), ...right] : []),
        ],
      })

    // A fold is one plain button that says what it holds and which way it
    // is: pressing the line itself opens or shuts it
    const foldButton = (key, isShut, label, onPress) =>
      Button({ key, label: (isShut ? '▸ ' : '▾ ') + label, plain: true, onPress })

    // The card on top says where the interview stands in two lines: which
    // step of how many, and how many are picked; then a meter split by the
    // traffic light with each zone's count beside it. A tree whose leaves
    // are the decisions stands on the left when there is room for it.
    const counts = ZONES.map((zone) => list.filter((n) => n.zone === zone).length)
    const total = counts.reduce((sum, n) => sum + n, 0)
    // The tree takes its own columns while the meter still has room beside
    // it, and only when the pane is tall enough that it does not push the
    // first question out of view
    const bodyRows = (e.props && e.props.scroll && e.props.scroll.bodyRows) || 0
    const hasTree = width - TREE_W - 2 >= 24 && bodyRows >= TREE_ROWS
    const barsW = hasTree ? width - TREE_W - 2 : width
    // The legend is each zone's shade and its count, nothing more: the meter
    // already says the shares, and the shade ties the two without color
    const legend = Box({
      key: 'legend',
      flexDirection: 'row',
      columnGap: 2,
      children: ZONES.map((zone, i) =>
        Box({
          key: 'legend-' + zone,
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({ color: ZONE_COLOR[zone], children: [ZONE_SHADE[zone]] }),
            Text({ bold: true, children: [String(counts[i])] }),
          ],
        }),
      ),
    })
    const legendW = ZONES.reduce((sum, zone, i) => sum + 2 + String(counts[i]).length, 0) + 2 * (ZONES.length - 1)
    const meterW = Math.max(8, barsW - legendW - 2)
    const widths = meterWidths(counts, meterW)
    const meter = Box({
      key: 'meter',
      flexDirection: 'row',
      children: total
        ? ZONES.map((zone, i) =>
            widths[i]
              ? Text({ key: 'meter-' + zone, color: ZONE_COLOR[zone], children: [ZONE_SHADE[zone].repeat(widths[i])] })
              : null,
          ).filter(Boolean)
        : [Text({ key: 'meter-free', color: 'subtle', children: ['░'.repeat(meterW)] })],
    })
    // One dot per round, the ones taken in the accent: `●●○○` is step two
    const steps = Box({
      key: 'steps',
      flexDirection: 'row',
      children: Array.from({ length: MAX_LAYERS }, (_, i) =>
        Text({
          key: 'step-' + i,
          color: i < state.layer ? 'claude' : 'subtle',
          children: [i < state.layer ? '●' : '○'],
        }),
      ),
    })
    // The leaves take the zones' shares in reading order, so the canopy is
    // the meter folded into a crown; before anything is asked it stays bare
    const leafWidths = meterWidths(counts, CANOPY.reduce((sum, n) => sum + n, 0))
    const leafZones = ZONES.flatMap((zone, i) => Array(leafWidths[i]).fill(zone))
    let leaf = 0
    const tree = Box({
      key: 'tree',
      width: TREE_W,
      flexDirection: 'column',
      children: [
        ...CANOPY.map((n, row) =>
          Box({
            key: 'canopy-' + row,
            flexDirection: 'row',
            columnGap: 1,
            paddingLeft: TREE_MID - (n - 1),
            children: Array.from({ length: n }, (_, i) => {
              const zone = leafZones[leaf++]
              return Text({ key: 'leaf-' + row + '-' + i, color: zone ? ZONE_COLOR[zone] : 'subtle', children: ['●'] })
            }),
          }),
        ),
        ...TRUNK.map((line, row) => Text({ key: 'trunk-' + row, dimColor: true, children: [line] })),
      ],
    })
    const bars = Box({ key: 'bars', flexDirection: 'row', columnGap: 2, children: [meter, legend] })
    const summary = card('summary', [
      Box({
        key: 'summarybar',
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: 'claude', children: ['◆'] }),
          Text({ bold: true, children: ['tree'] }),
          Text({ children: [' '] }),
          steps,
          Text({ bold: true, children: [state.layer ? L.step(state.layer) : L.beforeStart] }),
          Box({ flexGrow: 1 }),
          Text({ dimColor: true, children: [openNow.length ? L.picked(answered, openNow.length) : L.nothingOpen] }),
        ],
      }),
      hasTree
        ? Box({
            key: 'summarybody',
            flexDirection: 'row',
            columnGap: 2,
            children: [tree, Box({ flexDirection: 'column', justifyContent: 'center', children: [bars] })],
          })
        : bars,
    ])

    // A control that only changes how the layer is shown is drawn as a
    // survey row of the host's — `a: expand all` — its key in the accent
    const toggle = (key, label, hotkey, isOn, onPress) =>
      Button({ key, label, hotkey, plain: true, dimColor: !isOn, onPress })

    // Line two under the heading only changes how the layer is shown
    const viewControls = []
    if (!state.busy) {
      if (openNow.length) {
        viewControls.push(
          toggle('expand', isAll ? L.expandOne : L.expandAll, 'a', false, () =>
            update($, view, (v) => ({ ...v, expanded: isAll ? 'one' : 'all' })),
          ),
        )
        viewControls.push(
          toggle('auto', state.auto ? L.autoOn : L.autoOff, 'p', state.auto, async () => {
            const turningOn = !state.auto
            await update($, view, (v) => ({ ...v, auto: turningOn }))
            if (turningOn) await update($, draft, (d) => fillRecommended(openNow, d))
          }),
        )
      }
    }
    // Switching the pack redraws the pane, and sticks for the next session.
    // A setting touched once a session, so it sits on the hint line, not
    // among the view options
    const langButton = toggle('lang', L.other, 'l', false, async () => {
      const chosen = state.lang === 'en' ? 'ko' : 'en'
      await update($, view, (v) => ({ ...v, lang: chosen }))
      await $.store.set('lang', chosen)
    })

    // What moves the interview on sits under the choices, where the hand ends
    // up after the last pick. There is always at least one of these, so a call
    // that never comes back can't strand the pane.
    // Every action is the host's own `[ label ]` button; the one the round is
    // waiting for is its primary, as the host marks the main action of several.
    // The label is drawn in a status color of its own, as the add button's
    // plus is: what the press would do says which — green sends a layer that
    // is whole, the warning color one with holes or a call to make again,
    // the accent a handover, the error color a stop
    const actionButton = (key, label, hotkey, strong, onPress, color) =>
      Button({
        key,
        label,
        hotkey,
        variant: strong ? 'primary' : 'secondary',
        onPress,
        children: [Text({ color, bold: strong, children: [label] })],
      })

    const actions = []
    if (state.busy) {
      actions.push(
        actionButton(
          'cancel',
          L.stopWaiting,
          'c',
          false,
          () => {
            // The call keeps running, but its reply no longer reaches the pane
            generation += 1
            stopSpin()
            // The try-again button that comes up says all there is to say
            update($, view, (v) => ({ ...v, busy: false, notice: '', alert: false }))
          },
          'error',
        ),
      )
    } else {
      if (openNow.length) {
        // The label says how many would be held, so a half-answered layer is
        // sent knowingly — and never blocked
        const whole = answered === openNow.length
        actions.push(
          actionButton(
            'submit',
            L.next(answered, openNow.length, openNow.length - answered),
            's',
            whole && !needsApply,
            () => submitLayer($),
            whole ? 'success' : 'warning',
          ),
        )
      } else if (!state.isComplete && (list.length || seedText)) {
        // The layer emptied but no next one arrived — offer the call again;
        // with no tree standing yet, that is the first layer over again
        actions.push(
          actionButton(
            'retry',
            L.retry,
            't',
            true,
            () => (list.length ? advance($, state.layer) : grow($, seedText)),
            'warning',
          ),
        )
      }
      // Whatever is settled can always be handed over, finished or not —
      // and a request with nothing worth asking goes over as it is
      if (settled.length || state.isComplete) {
        actions.push(
          actionButton(
            'handoff',
            state.isComplete ? L.handoff : L.handoffPartial,
            'r',
            state.isComplete,
            () => handoff($),
            'claude',
          ),
        )
      }
    }

    // Earlier rounds fold under one line that counts them, the way the applied
    // context does; opened, each decision can be put back on the open layer
    // A decision of an earlier round, settled or held, goes back onto the
    // open layer as a question
    const reask = async (n) => {
      const layer = state.layer || 1
      // A written answer is kept as a choice, so it can be picked again
      const options = n.answer && !n.options.some((o) => o.label === n.answer)
        ? [...n.options, { id: 'w', label: n.answer, detail: '', isPick: false }]
        : n.options
      const asked = { ...n, zone: 'gray', layer, options, answer: '', dropped: false }
      await update($, nodes, (all) => all.map((one) => (one.id === n.id ? asked : one)))
      await update($, view, (v) => ({ ...v, layer, isComplete: false, focusId: n.id, expanded: 'one' }))
    }
    // The body of one opened decision: why it is asked, and what to pick
    const body = (node) => {
      const chosen = picked[node.id] || ''
      const left = []
      if (node.question) left.push(Text({ children: [clip(node.question, leftW)] }))
      if (node.tag) left.push(Text({ dimColor: true, children: [clip(L.why + node.tag, leftW)] }))

      const right = []
      node.options.forEach((option, i) => {
        const isChosen = chosen === option.label
        // Only one decision is open in 'one' mode, so its numbers can be keys,
        // and the host draws each key before its label (`1: SQLite`). With
        // every decision open the keys are off, so the number is drawn here.
        const hasKey = !isAll && i < 9
        const key = hasKey ? { hotkey: String(i + 1) } : {}
        const mark = isChosen
          ? Text({ color: 'success', bold: true, children: ['✓'] })
          : Text({ dimColor: true, children: [hasKey ? ' ' : String(i + 1)] })
        right.push(
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              // Button takes no colour, so the mark beside it carries it
              mark,
              Button({
                key: 'opt-' + node.id + '-' + option.id,
                label: clip(option.label, Math.max(6, rightW - 10)),
                plain: true,
                ...key,
                dimColor: chosen !== '' && !isChosen,
                onPress: async () => {
                  await update($, draft, (d) => ({ ...d, [node.id]: option.label }))
                  // The hand moves on to the next decision still waiting, so
                  // a layer is answered with digits alone; after the last one
                  // nothing more opens, and next-step is the lit button
                  if (isAll) return
                  const at = openNow.findIndex((n) => n.id === node.id)
                  const rest = [...openNow.slice(at + 1), ...openNow.slice(0, at)]
                  const waiting = rest.find((n) => !(picked[n.id] && picked[n.id].trim()))
                  if (waiting) await update($, view, (v) => ({ ...v, focusId: waiting.id }))
                },
              }),
              ...(option.isPick ? [Text({ color: 'suggestion', children: [L.recommended] })] : []),
            ],
          }),
        )
        // The grounds wrap under the label, every line of them indented the
        // same, so a long one is read whole instead of cut off
        if (option.detail) {
          right.push(
            Box({
              paddingLeft: 5,
              width: rightW,
              children: [Text({ dimColor: true, wrap: 'wrap', children: [option.detail] })],
            }),
          )
        }
      })
      // An answer the user wrote matches no choice, so it is shown on a row
      // of its own, with the same tick the choices get
      if (chosen && !node.options.some((o) => o.label === chosen)) {
        right.push(
          Box({
            key: 'written-' + node.id,
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ color: 'success', bold: true, children: ['✓'] }),
              Text({ children: [clip(L.writtenAs(chosen), Math.max(6, rightW - 2))] }),
            ],
          }),
        )
      }
      // The two things done now and then — writing an answer in, sending a
      // subagent at the decision — share one dim line, so the choices stand
      // alone above it. The field only comes out when asked for.
      const isWriting = writing === node.id
      if (isWriting) {
        right.push(
          Input({
            key: 'write-' + node.id,
            label: L.writeIn,
            placeholder: L.writeInPlaceholder,
            value: '',
            submitLabel: L.writeInSubmit,
            autoFocus: true,
            onSubmit: async (value) => {
              if (!value || !value.trim()) return
              await update($, draft, (d) => ({ ...d, [node.id]: value.trim() }))
              await update($, view, (v) => ({ ...v, writing: null }))
            },
          }),
        )
      }
      // Letters are keys only while one decision is open, as the digits are
      const letter = (hotkey) => (isAll ? {} : { hotkey })
      const isProbing = probing.includes(node.id)
      right.push(
        Box({
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Button({
              key: 'open-write-' + node.id,
              label: isWriting ? L.closeItem : L.writeIn,
              plain: true,
              dimColor: true,
              ...letter('w'),
              onPress: () => update($, view, (v) => ({ ...v, writing: v.writing === node.id ? null : node.id })),
            }),
            // Once sent, the title row says so; a second agent is not offered
            ...(isProbing
              ? []
              : [
                  Text({ dimColor: true, children: ['·'] }),
                  Button({
                    key: 'probe-' + node.id,
                    label: L.probe,
                    plain: true,
                    dimColor: true,
                    ...letter('f'),
                    onPress: () => probe($, node.id),
                  }),
                ]),
          ],
        }),
      )

      const inner = isSplit
        ? [
            Box({
              flexDirection: 'row',
              columnGap: 3,
              children: [
                Box({ flexDirection: 'column', width: leftW, children: left }),
                Box({ flexDirection: 'column', width: rightW, children: right }),
              ],
            }),
          ]
        : [...left, blank(), ...right]

      // The border is what tells this block apart from the rows around it
      return Box({
        key: 'card-' + node.id,
        width: cardW,
        marginLeft: 2,
        borderStyle: 'round',
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
        children: inner,
      })
    }

    // The layer as an accordion: one title line each, the open one expanded
    const openRows = []
    openNow.forEach((node, i) => {
      const chosen = picked[node.id] || ''
      const isOpen = isAll || state.focusId === node.id
      // A line of air between titles, as every list on the pane has; it is
      // also what sets an opened card apart from the title after it
      openRows.push(
        Box({
          key: 'row-' + node.id,
          marginTop: i ? 1 : 0,
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({ dimColor: true, children: [isOpen ? '▾' : '▸'] }),
            dot(node.zone),
            Button({
              key: 'node-' + node.id,
              label: clip(node.title, titleW),
              plain: true,
              dimColor: !isOpen,
              onPress: () =>
                update($, view, (v) => ({ ...v, focusId: v.focusId === node.id ? null : node.id, expanded: 'one' })),
            }),
            // A decision the user never raised says so, so it is easy to hold
            ...(node.isExpansion ? [Text({ dimColor: true, children: [L.expansion] })] : []),
            // One a research agent is out on says so until the layer moves on
            ...(probing.includes(node.id) ? [Text({ color: 'warning', children: [L.probing] })] : []),
            // An open decision already shows its ✓ among the choices below
            ...(chosen && !isOpen
              ? [Text({ color: 'success', children: ['→ ' + clip(chosen, Math.max(10, width - titleW - 6))] })]
              : []),
          ],
        }),
      )
      if (isOpen) {
        openRows.push(body(node))
      }
    })

    // While a call is out, the spinner stands where the questions will appear —
    // it is the list that is being fetched, so that is where the wait belongs.
    // It turns in the accent, as the engine's own spinner does.
    const listArea = state.busy
      ? [
          Box({
            key: 'loading',
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ color: 'claude', children: [FRAMES[tick % FRAMES.length]] }),
              Text({ dimColor: true, children: [clip(state.notice || L.thinking, Math.max(8, width - 3))] }),
            ],
          }),
        ]
      : openRows

    // Everything already past — settled without asking, settled in an
    // earlier round, or held — stays in view above the questions, one line
    // each. A settled one opens with `Pass` in green, as the traffic light
    // says it; a held one with the held word, dim. No title above: the mark
    // is the title. A line of air between rows, as every list on the pane
    // has; each row's title bold, its answer plain, and a button that puts
    // it back on the open layer as a question.
    const assumedRows = []
    const passed = list.filter((n) => n.zone === 'known' || (n.zone === 'deferred' && !n.dropped))
    const askAssumed = async (n) => {
      const layer = state.layer || 1
      const option = { id: 'o1', label: n.answer, detail: n.tag, isPick: true }
      // It comes back as a grey question — a direction is already set, the
      // user just wants to confirm it — so its dot is the warning color, not
      // the open red, and it reads apart from the questions never answered
      const asked = { ...n, assumed: false, zone: 'gray', layer, question: n.title, options: [option], answer: '' }
      await update($, nodes, (all) => all.map((one) => (one.id === n.id ? asked : one)))
      await update($, view, (v) => ({ ...v, layer, isComplete: false, focusId: n.id, expanded: 'one' }))
    }
    if (!state.busy && passed.length) {
      const titleW = Math.max(8, Math.floor(width * 0.3))
      passed.forEach((n, i) => {
        const isHeld = n.zone === 'deferred'
        assumedRows.push(
          Box({
            key: (n.assumed ? 'assumed-' : 'past-') + n.id,
            marginTop: i ? 1 : 0,
            flexDirection: 'row',
            columnGap: 1,
            children: [
              isHeld
                ? Text({ color: 'inactive', bold: true, children: [L.zones.deferred] })
                : Text({ color: 'success', bold: true, children: [L.passMark] }),
              Text({ bold: true, dimColor: isHeld, children: [clip(n.title, titleW)] }),
              ...(isHeld
                ? []
                : [
                    Text({ dimColor: true, children: ['→'] }),
                    Text({ children: [clip(n.answer, Math.max(8, width - 18 - Math.min(n.title.length, titleW)))] }),
                  ]),
              n.assumed
                ? Button({ key: 'ask-' + n.id, label: L.askIt, plain: true, dimColor: true, onPress: () => askAssumed(n) })
                : Button({ key: 'reask-' + n.id, label: L.reask, plain: true, dimColor: true, onPress: () => reask(n) }),
            ],
          }),
        )
      })
    }

    // A failure is said in the theme's error color, anything else in dim
    const status = []
    if (!state.busy && state.notice) {
      status.push(
        state.alert
          ? Text({ color: 'error', children: [clip(state.notice, width)] })
          : Text({ dimColor: true, children: [clip(state.notice, width)] }),
      )
    }

    // The add control sits right under the rows it grows, where the field
    // comes out: the host's own button with an accent plus, so it reads as
    // the one thing to press to grow the list. Pressed, the field takes its
    // place with the way out at the field's own right edge.
    const toggleAdd = (kind) => () =>
      update($, view, (v) => ({
        ...v,
        adding: (v.adding || []).includes(kind)
          ? (v.adding || []).filter((one) => one !== kind)
          : [...(v.adding || []), kind],
      }))
    const addButton = (kind) =>
      adding.includes(kind)
        ? []
        : [
            Button({
              key: 'add-' + kind,
              label: L.addItem,
              variant: 'secondary',
              onPress: toggleAdd(kind),
              children: [Text({ color: 'claude', bold: true, children: ['+ ' + L.addItem] })],
            }),
          ]
    // The field stands a line off the rows above it, as the rows do from
    // each other; with none above, it sits right under the heading's air
    const addField = (kind, placeholder, onAdd, hasRows) => {
      if (!adding.includes(kind)) return []
      // Border and padding take 4 columns, the close button about 10
      const fieldW = Math.max(10, width - 14)
      return [
        Box({
          key: kind + 'field',
          marginTop: hasRows ? 1 : 0,
          width: width,
          borderStyle: 'round',
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Box({
              width: fieldW,
              flexDirection: 'column',
              children: [
                Input({
                  key: kind,
                  label: '',
                  placeholder,
                  value: '',
                  submitLabel: '',
                  autoFocus: true,
                  onSubmit: (value) => {
                    if (!value || !value.trim()) return
                    onAdd(value.trim())
                  },
                }),
              ],
            }),
            Button({ key: 'add-' + kind, label: L.closeItem, plain: true, dimColor: true, onPress: toggleAdd(kind) }),
          ],
        }),
      ]
    }

    // Both bottom lists behave like a todo list: rows first, the add control
    // under them, and every row can be struck off.
    const closeEditing = () => update($, view, (v) => ({ ...v, editing: null }))
    // A row being edited: laid out like the add field, the row's text in the
    // field, the way out at the field's right edge — and Esc puts it away
    // the same way. Both lists edit a row with this.
    const editField = (kind, row, i, onSave) =>
      Box({
        key: kind + 'row-' + row.id,
        marginTop: i ? 1 : 0,
        width: width,
        borderStyle: 'round',
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Box({
            width: Math.max(10, width - 14),
            flexDirection: 'column',
            children: [
              Input({
                key: kind + '-edit-' + row.id,
                label: '',
                value: row.text,
                submitLabel: L.saveItem,
                autoFocus: true,
                onSubmit: onSave,
              }),
            ],
          }),
          Button({ key: 'close-' + kind + '-' + row.id, label: L.closeItem, plain: true, dimColor: true, onPress: closeEditing }),
        ],
      })

    const todoList = (kind, title, tag, rows, marker, placeholder, onAdd, onEdit, onRemove) => {
      const out = [heading(kind + 'bar', title, tag, [])]
      rows.forEach((item, i) => {
        if (!state.busy && editing === item.id) {
          out.push(
            editField(kind, item, i, async (value) => {
              const text = value && value.trim()
              if (!text) return
              if (text !== item.text) await onEdit(item.id, text)
              await closeEditing()
            }),
          )
          return
        }
        out.push(
          Box({
            key: kind + 'row-' + item.id,
            marginTop: i ? 1 : 0,
            flexDirection: 'row',
            columnGap: 1,
            children: [
              typeof marker === 'function' ? marker(item) : Text({ dimColor: true, children: [marker] }),
              Text({ children: [clip(item.text, Math.max(8, width - 12))] }),
              ...(state.busy
                ? []
                : [
                    Button({
                      key: 'edit-' + kind + '-' + item.id,
                      label: L.editItem,
                      plain: true,
                      dimColor: true,
                      onPress: () => update($, view, (v) => ({ ...v, editing: item.id })),
                    }),
                  ]),
              Button({
                key: 'rm-' + kind + '-' + item.id,
                label: L.removeItem,
                plain: true,
                dimColor: true,
                onPress: () => onRemove(item.id),
              }),
            ],
          }),
        )
      })
      if (!state.busy) {
        out.push(...addField(kind, placeholder, onAdd, rows.length > 0))
        // A line of air above the button, as under the context — but not
        // when there are no rows, since the heading's own air is already there
        const add = addButton(kind)
        if (add.length) {
          out.push(Box({ key: kind + 'add', marginTop: rows.length ? 1 : 0, flexDirection: 'row', children: add }))
        }
      }
      return out
    }

    // An edit puts the row back to pending, which also lifts it out of the fold
    const saveRow = async (row, value) => {
      const text = value && value.trim()
      if (!text) return
      if (text !== row.text) {
        if (row.id === 'seed') {
          await update($, seed, () => text)
          await update($, view, (v) => ({ ...v, seedApplied: false }))
        } else {
          await update($, context, (list) => list.map((m) => (m.id === row.id ? { ...m, text, applied: false } : m)))
        }
      }
      await closeEditing()
    }
    // Taking an applied item away leaves the tree resting on it, so the
    // apply button comes up; the tree itself is left as it is until then
    const removeRow = async (row) => {
      await update($, context, (list) => list.filter((m) => m.id !== row.id))
      if (row.applied) await update($, view, (v) => ({ ...v, stale: true }))
    }

    // A row's state is its word in the theme's status color: settled green, pending
    // the warning color, as the engine says a task's state
    const badge = (isApplied) =>
      isApplied
        ? [Text({ color: 'success', children: [L.applied] })]
        : [Text({ color: 'warning', children: [L.unapplied] })]

    // Every list on the pane puts a line of air between its rows — the first
    // row sits right under the heading's own air
    const contextRow = (row, i) => {
      // Laid out like the add field: the way out sits at the field's right
      // edge, and Esc puts it away the same way
      if (!state.busy && editing === row.id) return editField('ctx', row, i, (value) => saveRow(row, value))
      return Box({
        key: 'ctxrow-' + row.id,
        marginTop: i ? 1 : 0,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          ...badge(row.applied),
          Text({ children: [clip(row.text, Math.max(8, width - 20))] }),
          ...(state.busy
            ? []
            : [
                Button({
                  key: 'edit-ctx-' + row.id,
                  label: L.editItem,
                  plain: true,
                  dimColor: true,
                  onPress: () => update($, view, (v) => ({ ...v, editing: row.id })),
                }),
                // The request is what the tree grows from, so it can be rewritten, not removed
                ...(row.id === 'seed'
                  ? []
                  : [
                      Button({
                        key: 'rm-ctx-' + row.id,
                        label: L.removeItem,
                        plain: true,
                        dimColor: true,
                        onPress: () => removeRow(row),
                      }),
                    ]),
              ]),
        ],
      })
    }

    const rows = [
      ...(seedText ? [{ id: 'seed', text: seedText, applied: Boolean(state.seedApplied) }] : []),
      ...items,
    ]
    const appliedRows = rows.filter((r) => r.applied)
    const pendingRows = rows.filter((r) => !r.applied)
    const isFolded = state.folded !== false

    // The first section: the request and everything said around it. Nothing
    // here can change while a round is reading it, so every control waits.
    // Everything already applied folds under one count on the heading's
    // right — the line itself is the toggle — so only the pending rows stay
    // out in the open
    const addContext = (text) => {
      update($, context, (current) => [...current, { id: 'c' + Date.now(), text, applied: false }])
      update($, view, (v) => ({ ...v, adding: (v.adding || []).filter((one) => one !== 'ctx') }))
    }
    const contextSection = [
      heading(
        'ctxbar',
        L.context,
        L.contextTag,
        appliedRows.length
          ? [
              foldButton('ctx-fold', isFolded, L.appliedCount(appliedRows.length), () =>
                update($, view, (v) => ({ ...v, folded: v.folded === false })),
              ),
            ]
          : [],
      ),
    ]
    const shownRows = [...(appliedRows.length && !isFolded ? appliedRows : []), ...pendingRows]
    shownRows.forEach((row, i) => contextSection.push(contextRow(row, i)))
    // The field comes out under the rows; under that, one row holds what
    // can be done with the list — grow it, and have the round read it —
    // side by side, and a line of air above so the row is not read as one
    // more item of the list
    if (!state.busy) {
      contextSection.push(...addField('ctx', L.contextPlaceholder, addContext, shownRows.length > 0))
      const controls = [
        ...addButton('ctx'),
        ...(needsApply
          ? [
              actionButton(
                'apply',
                state.applyFailed ? L.applyRetry : L.applyContext,
                'm',
                true,
                () => revise($),
                'warning',
              ),
            ]
          : []),
      ]
      if (controls.length) {
        // Only the heading above it: its own air is enough
        const hasRows = contextSection.length > 1
        contextSection.push(
          Box({ key: 'ctxactions', marginTop: hasRows ? 1 : 0, flexDirection: 'row', columnGap: 2, children: controls }),
        )
      }
    }

    // The other half of the pane, with a heading of its own
    const feedSection = todoList(
      'feed',
      L.feeding,
      L.feedingTag,
      feeds,
      '☐',
      L.feedPlaceholder,
      (text) => {
        update($, feeding, (current) => [...current, { id: 'f' + Date.now(), text }])
        update($, view, (v) => ({ ...v, adding: (v.adding || []).filter((one) => one !== 'feed') }))
      },
      (id, text) => update($, feeding, (current) => current.map((f) => (f.id === id ? { ...f, text } : f))),
      (id) => update($, feeding, (current) => current.filter((f) => f.id !== id)),
    )

    // The view options ride on the right of the questions' own heading
    const treeHeading = heading(
      'treebar',
      L.tree,
      L.treeTag,
      viewControls.length ? [Box({ key: 'viewbar', flexDirection: 'row', columnGap: 2, children: viewControls })] : [],
    )

    const treeSection = card('treecard', [
      treeHeading,
      // What was settled without asking comes first: it is the ground the
      // questions stand on, read before they are
      ...assumedRows,
      ...(assumedRows.length && !state.busy ? [blank()] : []),
      ...listArea,
      blank(),
      ...(actions.length ? [Box({ key: 'actionbar', flexDirection: 'row', columnGap: 1, children: actions })] : []),
      ...status,
    ])

    // The keys that work right now, said the way the host's dialogs say
    // theirs: while a call is out only the one that stops it, in a field
    // the two that close it, otherwise the digits when they are live
    const hasField = adding.length > 0 || Boolean(editing) || Boolean(writing)
    const hintText = state.busy
      ? L.hintBusy
      : hasField
        ? L.hintField
        : L.hint + (openNow.length && !isAll ? ' · ' + L.hintKeys : '')
    const hint = Box({
      key: 'hint',
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Text({ dimColor: true, children: [clip(hintText, Math.max(8, paneW - 10))] }),
        Text({ dimColor: true, children: ['·'] }),
        langButton,
      ],
    })

    return Box({
      flexDirection: 'column',
      children: [summary, card('ctxcard', contextSection), treeSection, card('feedcard', feedSection), hint],
    })
  })
}
