import { atom, read, update } from 'claude-code'

// The pane's id, used to open it and to recognize it while drawing
const PANE = 'tree'

// Every decision the interview has raised so far
const nodes = atom({ plugin: 'tree', key: 'nodes' }, [])
// What the user says the finished work has to satisfy
const feeding = atom({ plugin: 'tree', key: 'feeding' }, [])
// Anything else the user wants the interview to know, in their own words
const notes = atom({ plugin: 'tree', key: 'notes' }, [])
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
    doneCount: (n) => '정한 것 ' + n,
    heldCount: (n) => '미룬 것 ' + n,
    alreadyDone: '이미 정한 것',
    why: '왜 묻나 · ',
    recommended: '★추천',
    writeIn: '직접 입력',
    writeInPlaceholder: '위에 없는 답을 적고 Enter',
    writeInSubmit: '선택',
    probe: '이 질문의 답을 코드에서 찾아보기',
    stopWaiting: '그만 기다리기',
    expandAll: '전체 펼치기',
    expandOne: '하나씩 보기',
    autoOn: '추천 자동선택 켜짐',
    autoOff: '추천으로 모두 선택',
    next: (a, b) => '다음 단계로 (s) · ' + a + '/' + b,
    retry: '다시 시도 (t)',
    handoff: 'Claude에게 넘기기 (r)',
    handoffPartial: '여기까지만 넘기기',
    thinking: '생각하는 중',
    firstLayerBusy: '첫 단계를 세우는 중',
    nextLayerBusy: '다음 단계를 계산하는 중',
    spawning: '조사 에이전트를 띄우는 중',
    spawned: '조사 에이전트를 띄웠습니다.',
    allAsked: '물어볼 것이 끝났습니다. 넘기기를 누르세요.',
    stopped: '기다리기를 멈췄습니다. 다시 시도를 누르세요.',
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
    droppedBy: '전제가 바뀌어 빠짐',
    applyNotes: '메모 반영 (m)',
    applyBusy: '메모를 트리에 반영하는 중',
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
    notes: '확장 컨텍스트',
    addItem: '+ 추가',
    closeItem: '닫기',
    removeItem: 'x',
    notesPlaceholder: '선택지로 못 담는 전제·제약을 적고 Enter',
    notesSubmit: '추가',
    handoffNotes: '## 사용자가 덧붙인 것',
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
    doneCount: (n) => 'settled ' + n,
    heldCount: (n) => 'held ' + n,
    alreadyDone: 'Already settled',
    why: 'why asked · ',
    recommended: '★pick',
    writeIn: 'Write in',
    writeInPlaceholder: 'an answer not listed above, then Enter',
    writeInSubmit: 'pick',
    probe: 'Look for the answer in the code',
    stopWaiting: 'stop waiting',
    expandAll: 'expand all',
    expandOne: 'one at a time',
    autoOn: 'auto-pick on',
    autoOff: 'pick all recommended',
    next: (a, b) => 'Next step (s) · ' + a + '/' + b,
    retry: 'Try again (t)',
    handoff: 'Hand to Claude (r)',
    handoffPartial: 'hand over what is settled',
    thinking: 'thinking',
    firstLayerBusy: 'building the first step',
    nextLayerBusy: 'working out the next step',
    spawning: 'starting a research agent',
    spawned: 'A research agent is on it.',
    allAsked: 'Nothing left to ask. Press hand over.',
    stopped: 'Stopped waiting. Press try again.',
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
    droppedBy: 'dropped — its premise changed',
    applyNotes: 'apply notes (m)',
    applyBusy: 'folding the notes into the tree',
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
    notes: 'Extended context',
    addItem: '+ add',
    closeItem: 'close',
    removeItem: 'x',
    notesPlaceholder: 'a constraint no choice covers, then Enter',
    notesSubmit: 'add',
    handoffNotes: '## Context the user added',
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
    }))
  const revisit = Array.isArray(parsed.revisit) ? parsed.revisit.filter((id) => typeof id === 'string') : []
  const drop = Array.isArray(parsed.drop) ? parsed.drop.filter((id) => typeof id === 'string') : []
  return { nodes: fresh, revisit, drop }
}

// The compact form of the tree that rides along in every call
function snapshot(list) {
  if (!list.length) return '(아직 없음)'
  return list
    .map((n) => {
      const answer = n.answer ? ' 확정="' + n.answer + '"' : ''
      const tag = n.tag ? ' 근거="' + n.tag + '"' : ''
      return '- ' + n.id + ' [L' + n.layer + '/' + n.zone + '] ' + n.title + answer + tag
    })
    .join('\n')
}

function feedingLines(list) {
  if (!list.length) return ''
  return '\n\n사용자가 밝힌 결과물의 모양 (가지를 이쪽으로 쳐라):\n' + list.map((f) => '- ' + f.text).join('\n')
}

// What the user typed that was not an answer to any one question. A note a
// round has already read is a standing premise; only a new one can reopen a
// decision, so the same note cannot keep knocking the same answer over.
function noteLines(standing, fresh) {
  const blocks = []
  if (standing.length) {
    blocks.push(
      '\n\n사용자가 앞서 밝혀둔 전제 (계속 유효하다. 트리가 이와 어긋나 있으면 어긋난 노드를 drop 하라):\n' +
        standing.map((n) => '- ' + n.text).join('\n'),
    )
  }
  if (fresh.length) {
    blocks.push(
      '\n\n사용자가 방금 덧붙인 맥락 (전제로 삼아라. 이와 모순되는 기존 노드는 revisit 에 넣어라):\n' +
        fresh.map((n) => '- ' + n.text).join('\n'),
    )
  }
  return blocks.join('')
}

const RULES = [
  '한 레이어 = 선행 결정이 모두 해소되어 지금 당장 물을 수 있는 결정들의 집합이다.',
  '같은 레이어의 결정끼리는 서로의 답에 의존하지 않아야 한다. 의존한다면 다음 레이어로 미뤄라.',
  '',
  '규칙:',
  '- 트리는 주어진 것의 분해가 아니다. 사용자가 준 맥락은 일부일 뿐이고, 나머지 가지는 네가 찾아 붙인다.',
  '- 기계적 확장: 요구에 등장하는 개체를 생성 / 조회 / 수정 / 삭제·해지 / 운영 / 상태·이력 칸에 투영해, 비어 있는 칸을 노드로 세워라.',
  '- 판단 확장: 그 어휘로 안 잡히지만 추가로 정해둬야 할 결정을 등재하라.',
  '- 모든 노드의 tag 에 왜 이 결정이 트리에 있는지 근거를 적어라. 예: "구독.삭제·해지 칸 비었음".',
  '- 근거 꼬리표를 못 다는 순수 추측은 만들지 마라.',
  '- 노드마다 question 과 선택지 2~4개를 달아라. 첫 선택지가 추천안이고 label 끝에 " (추천)" 을 붙여라.',
  '- detail 에는 그 선택의 근거와 대가를 한 줄로 적어라.',
  '- 한 레이어는 4~7개 노드로 제한하라.',
  '',
  'JSON 만 출력하라. 설명도 코드펜스도 금지.',
  '{"nodes":[{"id":"n1","title":"...","tag":"...","question":"...","options":[{"id":"o1","label":"... (추천)","detail":"..."}]}],"revisit":[],"drop":[]}',
].join('\n')

function firstLayerPrompt(text, feeds, memos, lang) {
  return [
    '아래 요구를 확장 결정 트리로 바꾸되, 지금은 첫 레이어만 만들어라.',
    '',
    '요구: ' + text,
    feedingLines(feeds),
    noteLines([], memos),
    '',
    '첫 레이어에는 다른 결정의 답을 몰라도 답할 수 있는 결정만 넣어라.',
    '',
    RULES,
    pack(lang).replyLanguage,
  ].join('\n')
}

function nextLayerPrompt(list, feeds, standing, fresh, settled, held, fromLayer, lang) {
  const lines = [
    '지금까지 세운 결정 트리:',
    '',
    snapshot(list),
    feedingLines(feeds),
    noteLines(standing, fresh),
    '',
    '방금 한 레이어가 통째로 확정되었다:',
  ]
  for (const row of settled) lines.push('- ' + row.id + ' "' + row.title + '" → "' + row.answer + '"')
  if (held.length) lines.push('', '사용자가 답하지 않고 미룬 것: ' + held.map((n) => n.id).join(', '))
  lines.push(
    '',
    '다음 레이어를 만들어라.',
    '- 이 답들에서 파생되어 이제야 물을 수 있게 된 결정만 넣어라.',
    '- 이 답들과 모순되는 기존 노드가 있으면 그 id 를 revisit 에 넣어라. 그 노드는 다시 묻는다 (상향 재개방).',
    '- 이미 확정된 노드를 다시 만들지 마라. 새 id 를 써라.',
    '- 전제가 뒤집혀 더 이상 물을 가치가 없어진 노드는 그 id 를 drop 에 넣어라. 이미 확정된 노드도 드롭할 수 있다.',
    '  예: 결제사를 바꾸기로 했다면 이전 결제사에만 해당하는 질문과 그 답은 전부 drop 이다.',
    '- 같은 결정을 다시 묻고 싶을 때만 revisit 을 쓰고, 아예 필요 없어진 것은 drop 을 써라.',
    '- 더 물을 것이 남지 않았으면 nodes 를 빈 배열로 둬라. 억지로 채우지 마라.',
  )
  if (fromLayer >= 3) {
    lines.push(
      '- 이미 레이어를 ' +
        fromLayer +
        '번 돌았고 확정된 결정이 ' +
        list.filter((n) => n.zone === 'known').length +
        '개다. 지금 정하지 않으면 작업을 시작할 수 없는 결정만 남겨라. 그런 것이 없으면 빈 배열로 끝내라.',
    )
  }
  lines.push('', RULES, pack(lang).replyLanguage)
  return lines.join('\n')
}

// Rebuild the layer that is open, instead of moving on to the next one. Used
// when the user adds context mid-layer and the questions on screen no longer fit.
function reviseLayerPrompt(list, feeds, standing, fresh, layer, lang) {
  return [
    '지금까지 세운 결정 트리:',
    '',
    snapshot(list),
    feedingLines(feeds),
    noteLines(standing, fresh),
    '',
    '사용자가 방금 맥락을 덧붙였다. 지금 열려 있는 ' + layer + '번째 레이어를 이 맥락에 맞게 다시 만들어라.',
    '- 이 맥락 때문에 더 물을 가치가 없어진 노드는 그 id 를 drop 에 넣어라. 이미 확정된 노드도 드롭할 수 있다.',
    '  예: 결제사를 바꾸기로 했다면 이전 결제사에만 해당하는 질문과 그 답은 전부 drop 이다.',
    '- 이 맥락과 모순되어 다시 물어야 할 확정 노드는 그 id 를 revisit 에 넣어라.',
    '- nodes 에는 이 맥락을 전제로 삼았을 때 지금 물어야 할 질문을 새로 써라.',
    '- 맥락과 무관하게 여전히 유효한 확정 노드는 건드리지 마라.',
    '',
    RULES,
    pack(lang).replyLanguage,
  ].join('\n')
}

// The whole interview, written so the next session can start work from it
// without asking anything again: what the job is, what was fixed and why,
// what it has to satisfy, and what was deliberately left open or thrown out.
function handoffText(list, feeds, memos, seedText, lang) {
  const L = pack(lang)
  const settled = list.filter((n) => n.zone === 'known')
  const dropped = list.filter((n) => n.zone === 'deferred' && n.dropped)
  const held = list.filter((n) => n.zone === 'deferred' && !n.dropped)
  const lines = [L.hoTitle, '', L.hoGoal, '', seedText || L.hoNoGoal]

  if (memos.length) {
    lines.push('', L.hoPremise)
    for (const m of memos) lines.push('- ' + m.text)
  }

  if (settled.length) {
    lines.push('', L.hoDecisions)
    settled.forEach((n, i) => {
      lines.push('', '### ' + (i + 1) + '. ' + n.title + ' → ' + (n.answer || L.hoNoAnswer))
      // The choice's own reasoning, when the answer came from the list
      const chosen = (n.options || []).find((o) => o.label === n.answer)
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

// Frames of the spinner, and the tick a timer advances while a call is out
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let tick = 0
let spin = null

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

// ── calls that need the mods API ──────────────────────────────────────────────

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
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.firstLayerBusy }))
  let message = ''
  let opened = null
  try {
    const feeds = await read($, feeding)
    const memos = await read($, notes)
    const grown = await think($, firstLayerPrompt(text, feeds, memos, lang), 1, lang)
    if (!grown.step) {
      message = L.failedFirst(grown.why)
    } else {
      opened = grown.step.nodes
      await update($, nodes, () => opened)
      const state = await read($, view)
      if (state.auto && opened.length) await update($, draft, (d) => fillRecommended(opened, d))
    }
  } catch (error) {
    message = L.failedFirstThrow(String(error && error.message ? error.message : error))
  }
  stopSpin()
  await update($, view, (v) => ({
    ...v,
    layer: opened && opened.length ? 1 : v.layer,
    busy: false,
    notice: message,
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
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.nextLayerBusy }))
  let message = ''
  let moved = null
  try {
    const current = await read($, nodes)
    const feeds = await read($, feeding)
    const memos = await read($, notes)
    // Anything written during this layer is new to the model; the rest is settled context
    const standing = memos.filter((m) => (m.layer || 0) < fromLayer)
    const fresh = memos.filter((m) => (m.layer || 0) >= fromLayer)
    const settled = current.filter((n) => n.layer === fromLayer && n.zone === 'known')
    const held = current.filter((n) => n.layer === fromLayer && n.zone === 'deferred')
    const grown = await think(
      $,
      nextLayerPrompt(current, feeds, standing, fresh, settled, held, fromLayer, lang),
      fromLayer + 1,
      lang,
    )
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
      const all = [...carried, ...added]
      const opened = all.filter((n) => n.layer === fromLayer + 1 && n.zone !== 'known' && n.zone !== 'deferred')
      await update($, nodes, () => all)
      const state = await read($, view)
      if (state.auto && opened.length) await update($, draft, (d) => fillRecommended(opened, d))
      moved = opened
    }
  } catch (error) {
    message = L.failedThrow(String(error && error.message ? error.message : error))
  }
  stopSpin()
  await update($, view, (v) => ({
    ...v,
    layer: moved && moved.length ? fromLayer + 1 : v.layer,
    busy: false,
    notice: message,
    isComplete: moved ? moved.length === 0 : v.isComplete,
    focusId: moved && moved.length ? moved[0].id : v.focusId,
  }))
  // Logging last, so a failure here can no longer leave the pane waiting
  if (message) $.ui.log('tree: ' + message)
}

// Fold newly written notes into the layer that is open right now, rather than
// making the user submit a round they already know is built on a dead premise
async function revise($) {
  const state = await read($, view)
  const layer = state.layer
  if (!layer) return
  const L = pack(state.lang)
  startSpin($)
  await update($, view, (v) => ({ ...v, busy: true, notice: L.applyBusy }))
  let message = ''
  let rebuilt = null
  try {
    const current = await read($, nodes)
    const feeds = await read($, feeding)
    const memos = await read($, notes)
    const standing = memos.filter((m) => (m.layer || 0) < layer)
    const fresh = memos.filter((m) => (m.layer || 0) >= layer)
    // The open questions of this layer are thrown away and asked for again
    const kept = current.filter((n) => !(n.layer === layer && n.zone !== 'known' && n.zone !== 'deferred'))
    const grown = await think(
      $,
      reviseLayerPrompt(kept, feeds, standing, fresh, layer, state.lang),
      layer,
      state.lang,
    )
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
      const all = [...carried, ...added]
      const opened = all.filter((n) => n.layer === layer && n.zone !== 'known' && n.zone !== 'deferred')
      await update($, nodes, () => all)
      // Those notes have been read now, so they become standing premises
      await update($, notes, (list) =>
        list.map((m) => ((m.layer || 0) >= layer ? { ...m, layer: layer - 1 } : m)),
      )
      await update($, draft, () => ({}))
      const after = await read($, view)
      if (after.auto && opened.length) await update($, draft, (d) => fillRecommended(opened, d))
      rebuilt = opened
    }
  } catch (error) {
    message = L.failedThrow(String(error && error.message ? error.message : error))
  }
  stopSpin()
  await update($, view, (v) => ({
    ...v,
    busy: false,
    notice: message,
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
    await update($, view, (v) => ({ ...v, busy: false, notice: L.spawned }))
  } catch (error) {
    stopSpin()
    await update($, view, (v) => ({
      ...v,
      busy: false,
      notice: L.failedSpawn(String(error && error.message ? error.message : error)),
    }))
  }
}

// Hand the settled tree to Claude and close up
async function handoff($) {
  const current = await read($, nodes)
  const feeds = await read($, feeding)
  const memos = await read($, notes)
  const seedText = await read($, seed)
  const lang = (await read($, view)).lang
  $.prompt
    .submit({ text: handoffText(current, feeds, memos, seedText, lang), asUser: true })
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
    await grow($, text)
    // The pane is the output, so nothing goes in the transcript
    return {}
  })

  // Runs each time Claude Code draws a pane
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    // Leave other mods' panes alone
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, nodes)
    const feeds = await read($, feeding)
    const state = await read($, view)
    const picked = await read($, draft)
    const memos = await read($, notes)
    const L = pack(state.lang)
    const width = (e.props && e.props.bodyColumns) || 72

    const settled = list.filter((n) => n.zone === 'known')
    const held = list.filter((n) => n.zone === 'deferred')
    const openNow = list.filter((n) => n.layer === state.layer && n.zone !== 'known' && n.zone !== 'deferred')
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
    const rule = () => Text({ dimColor: true, children: ['─'.repeat(Math.max(4, width))] })

    const dot = (zone) => {
      if (zone === 'known') return Text({ color: 'green', children: ['●'] })
      if (zone === 'gray') return Text({ color: 'yellow', children: ['●'] })
      if (zone === 'deferred') return Text({ dimColor: true, children: ['●'] })
      return Text({ color: 'red', children: ['●'] })
    }

    // Line one names the section and says where the interview stands
    const treeHeading = Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Text({ bold: true, children: ['▌' + L.tree] }),
        Text({ dimColor: true, children: [L.treeTag] }),
        Text({ dimColor: true, children: [state.layer ? L.step(state.layer) : L.beforeStart] }),
        openNow.length
          ? Text({ children: [L.picked(answered, openNow.length)] })
          : Text({ dimColor: true, children: [L.nothingOpen] }),
        ...(settled.length || held.length
          ? [
              Text({
                dimColor: true,
                children: [
                  '· ' +
                    [settled.length ? L.doneCount(settled.length) : '', held.length ? L.heldCount(held.length) : '']
                      .filter(Boolean)
                      .join(' · '),
                ],
              }),
            ]
          : []),
      ],
    })

    // Line two under the heading only changes how the layer is shown
    const viewControls = []
    if (!state.busy) {
      if (openNow.length) {
        viewControls.push(
          Button({
            key: 'expand',
            label: isAll ? L.expandOne : L.expandAll,
            hotkey: 'a',
            plain: true,
            dimColor: true,
            onPress: () => update($, view, (v) => ({ ...v, expanded: isAll ? 'one' : 'all' })),
          }),
        )
        viewControls.push(
          Button({
            key: 'auto',
            label: state.auto ? L.autoOn : L.autoOff,
            hotkey: 'p',
            plain: true,
            dimColor: !state.auto,
            onPress: async () => {
              const turningOn = !state.auto
              await update($, view, (v) => ({ ...v, auto: turningOn }))
              if (turningOn) await update($, draft, (d) => fillRecommended(openNow, d))
            },
          }),
        )
      }
      // Switching the pack redraws the pane, and sticks for the next session
      viewControls.push(
        Button({
          key: 'lang',
          label: L.other,
          hotkey: 'l',
          plain: true,
          dimColor: true,
          onPress: async () => {
            const picked = state.lang === 'en' ? 'ko' : 'en'
            await update($, view, (v) => ({ ...v, lang: picked }))
            await $.store.set('lang', picked)
          },
        }),
      )
    }

    // What moves the interview on sits under the choices, where the hand ends
    // up after the last pick. There is always at least one of these, so a call
    // that never comes back can't strand the pane.
    // Every action looks the same: a framed button. The frame goes bold on the
    // one the round is waiting for, so there is never a bare line of text here.
    const actionButton = (key, label, hotkey, strong, onPress) =>
      Box({
        borderStyle: strong ? 'bold' : 'round',
        paddingLeft: 1,
        paddingRight: 1,
        children: [Button({ key, label, hotkey, plain: true, onPress })],
      })

    const actions = []
    if (state.busy) {
      actions.push(
        actionButton('cancel', L.stopWaiting, 'c', false, () =>
          {
            stopSpin()
            update($, view, (v) => ({ ...v, busy: false, notice: L.stopped }))
          },
        ),
      )
    } else {
      if (openNow.length) {
        // A note the open layer has not seen yet can be folded in right away
        const unread = memos.filter((m) => (m.layer || 0) >= state.layer)
        if (unread.length) {
          actions.push(actionButton('apply', L.applyNotes, 'm', true, () => revise($)))
        }
        actions.push(
          actionButton(
            'submit',
            L.next(answered, openNow.length),
            's',
            answered === openNow.length && !unread.length,
            () => submitLayer($),
          ),
        )
      } else if (list.length && !state.isComplete) {
        // The layer emptied but no next one arrived — offer the call again
        actions.push(actionButton('retry', L.retry, 't', true, () => advance($, state.layer)))
      }
      // Whatever is settled can always be handed over, finished or not
      if (settled.length) {
        actions.push(
          actionButton(
            'handoff',
            state.isComplete ? L.handoff : L.handoffPartial,
            'r',
            state.isComplete,
            () => handoff($),
          ),
        )
      }
    }

    // The counts live in the heading; the list itself only in 'all' mode
    const doneSummary = []
    if (isAll && settled.length) {
      doneSummary.push(Text({ dimColor: true, children: [L.alreadyDone] }))
      for (const n of settled) {
        doneSummary.push(
          Text({ dimColor: true, children: ['  ' + clip(n.title + ' → ' + n.answer, Math.max(8, width - 2))] }),
        )
      }
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
        // Only one decision is open in 'one' mode, so its numbers can be keys
        const key = !isAll && i < 9 ? { hotkey: String(i + 1) } : {}
        right.push(
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              // Button takes no colour, so the mark beside it carries it
              isChosen
                ? Text({ color: 'green', bold: true, children: ['✓'] })
                : Text({ dimColor: true, children: [String(i + 1)] }),
              Button({
                key: 'opt-' + node.id + '-' + option.id,
                label: clip(option.label, Math.max(6, rightW - 10)),
                plain: true,
                ...key,
                dimColor: chosen !== '' && !isChosen,
                onPress: () => update($, draft, (d) => ({ ...d, [node.id]: option.label })),
              }),
              ...(option.isPick ? [Text({ color: 'yellow', children: [L.recommended] })] : []),
            ],
          }),
        )
        if (option.detail) {
          right.push(Text({ dimColor: true, children: ['   ' + clip(option.detail, Math.max(6, rightW - 3))] }))
        }
      })
      right.push(
        Input({
          key: 'write-' + node.id,
          label: L.writeIn,
          placeholder: L.writeInPlaceholder,
          value: '',
          submitLabel: L.writeInSubmit,
          onSubmit: (value) => {
            if (!value || !value.trim()) return
            update($, draft, (d) => ({ ...d, [node.id]: value.trim() }))
          },
        }),
      )
      right.push(
        Button({
          key: 'probe-' + node.id,
          label: L.probe,
          plain: true,
          dimColor: true,
          onPress: () => probe($, node.id),
        }),
      )

      const inner = isSplit
        ? [
            Box({
              flexDirection: 'row',
              columnGap: 3,
              children: [
                Box({ flexDirection: 'column', width: leftW, children: left }),
                Box({ flexDirection: 'column', children: right }),
              ],
            }),
          ]
        : [...left, Text({ children: [' '] }), ...right]

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
    for (const node of openNow) {
      const chosen = picked[node.id] || ''
      const isOpen = isAll || state.focusId === node.id
      // Air above an opened title, so the card reads as belonging to it
      if (isOpen && openRows.length) openRows.push(blank())
      openRows.push(
        Box({
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
            // An open decision already shows its ✓ among the choices below
            ...(chosen && !isOpen
              ? [Text({ color: 'green', children: ['→ ' + clip(chosen, Math.max(10, width - titleW - 6))] })]
              : []),
          ],
        }),
      )
      if (isOpen) {
        openRows.push(body(node))
        openRows.push(blank())
      }
    }

    // While a call is out, the spinner stands where the questions will appear —
    // it is the list that is being fetched, so that is where the wait belongs
    const listArea = state.busy
      ? [
          Box({
            key: 'loading',
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ color: 'cyan', children: [FRAMES[tick % FRAMES.length]] }),
              Text({ dimColor: true, children: [clip(state.notice || L.thinking, Math.max(8, width - 3))] }),
            ],
          }),
        ]
      : openRows

    const status = []
    if (!state.busy && state.notice) status.push(Text({ dimColor: true, children: [clip(state.notice, width)] }))
    if (!state.busy && state.isComplete && list.length) {
      status.push(Text({ dimColor: true, children: [L.allAsked] }))
    }

    // Both bottom lists behave like a todo list: the title carries an add
    // button, the field drops in under it, and every row can be struck off.
    const todoList = (kind, titleRow, items, marker, placeholder, onAdd, onRemove) => {
      const isAdding = (state.adding || []).includes(kind)
      const rows = [
        Box({
          key: kind + 'bar',
          flexDirection: 'row',
          columnGap: 2,
          children: [
            ...titleRow,
            Button({
              key: 'add-' + kind,
              label: isAdding ? L.closeItem : L.addItem,
              onPress: () =>
                update($, view, (v) => ({
                  ...v,
                  adding: (v.adding || []).includes(kind)
                    ? (v.adding || []).filter((one) => one !== kind)
                    : [...(v.adding || []), kind],
                })),
            }),
          ],
        }),
      ]
      if (isAdding) {
        rows.push(
          Box({
            width: width,
            borderStyle: 'round',
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: 'column',
            children: [
              Input({
                key: kind,
                label: '',
                placeholder,
                value: '',
                submitLabel: L.addItem,
                autoFocus: true,
                onSubmit: (value) => {
                  if (!value || !value.trim()) return
                  onAdd(value.trim())
                },
              }),
            ],
          }),
        )
      }
      for (const item of items) {
        rows.push(
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              typeof marker === 'function' ? marker(item) : Text({ dimColor: true, children: [marker] }),
              Text({ children: [clip(item.text, Math.max(8, width - 6))] }),
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
      }
      return rows
    }

    // Part of the tree: what the choices could not hold, under the questions
    const noteSection = todoList(
      'note',
      [Text({ bold: true, children: [L.notes] })],
      memos,
      // A note the next round has yet to read is marked; once read it dims
      (m) =>
        (m.layer || 0) >= state.layer
          ? Text({ color: 'yellow', children: ['+'] })
          : Text({ dimColor: true, children: ['·'] }),
      L.notesPlaceholder,
      (text) => {
        update($, notes, (current) => [...current, { id: 'm' + Date.now(), text, layer: state.layer }])
        update($, view, (v) => ({ ...v, adding: (v.adding || []).filter((one) => one !== 'note') }))
      },
      (id) => update($, notes, (current) => current.filter((m) => m.id !== id)),
    )

    // The other half of the pane, with a heading of its own
    const feedSection = todoList(
      'feed',
      [Text({ bold: true, children: ['▌' + L.feeding] }), Text({ dimColor: true, children: [L.feedingTag] })],
      feeds,
      '☐',
      L.feedPlaceholder,
      (text) => {
        update($, feeding, (current) => [...current, { id: 'f' + Date.now(), text }])
        update($, view, (v) => ({ ...v, adding: (v.adding || []).filter((one) => one !== 'feed') }))
      },
      (id) => update($, feeding, (current) => current.filter((f) => f.id !== id)),
    )

    return Box({
      flexDirection: 'column',
      children: [
        treeHeading,
        ...(viewControls.length
          ? [Box({ key: 'viewbar', flexDirection: 'row', columnGap: 2, children: viewControls })]
          : []),
        rule(),
        ...doneSummary,
        ...(doneSummary.length ? [blank()] : []),
        ...listArea,
        // Still inside the tree: under the questions, above what moves them on
        blank(),
        ...noteSection,
        blank(),
        // Right after the list, so the hand is already there
        ...(actions.length
          ? [Box({ key: 'actionbar', flexDirection: 'row', columnGap: 2, children: actions })]
          : []),
        ...status,
        // Two blank lines and its own rule keep the second half clearly apart
        blank(),
        blank(),
        ...feedSection.slice(0, 1),
        rule(),
        ...feedSection.slice(1),
      ],
    })
  })
}
