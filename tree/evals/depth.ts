// Does the tree ask what the user has to think about, and only that?
//
// Runs the mod's own prompt code against the real model, auto-picking every
// recommendation the way 추천으로 모두 선택 does, and checks each sample for
// two things: the depth fits the ask (count and layers), and the questions
// are the user's to answer — policy is asked, not settled without asking,
// and implementation detail is never asked.
//
//   cd tree && bun evals/depth.ts [--runs 2] [--model opus] [--only design]
//
// The mod's tests stub the model and can't reach a process, so this sits
// outside them: it loads hooks/register.js with the mods API stubbed out.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf('--' + name)
  return i === -1 ? fallback : args[i + 1]
}
type Sample = {
  id: string
  seed: string
  feeds: string[]
  // context the user already gave, read by an earlier round
  context?: string[]
  // the most the tree should ever take for this ask, and for a real decision
  // the least, so cutting the prompt never cuts the questions that matter
  expect: { maxNodes: number; maxLayers: number; minNodes?: number }
  // the user's own decisions: each must be asked, and none settled silently
  mustAsk?: RegExp[]
  mustNotAssume?: RegExp[]
  // the implementer's business, or already decided: never asked
  mustNotAsk?: RegExp[]
}

const SAMPLES: Sample[] = [
  {
    // The ask that grew 40 decisions. Polish the look, change nothing else.
    id: 'design',
    seed: [
      'tree 플러그인의 유려한 화면 디자인',
      '1. 기능 변경이 아닙니다. 기존 배치와 기능을 모두 유지하세요',
      '2. 사람이 볼 때 디자인적으로 훌륭한 디자인을 다른 mod와 레퍼런스에서 참조하세요',
    ].join('\n'),
    feeds: ['유저는 text 형식의 디자인이 아닌 gui 형식의 flow를 제공받는다'],
    expect: { maxNodes: 3, maxLayers: 2 },
    mustNotAsk: [/커밋|브랜치|스크린샷|검증|테스트|fixture|데모|보관/],
  },
  {
    // A one-line edit with nothing left to decide
    id: 'work',
    seed: 'README 의 개발 섹션에 테스트 실행 명령 `cd tree && claude plugin test` 한 줄을 추가해줘',
    feeds: [],
    expect: { maxNodes: 1, maxLayers: 1 },
  },
  {
    // The control: an ask full of choices only the user can make
    id: 'payments',
    seed: '우리 SaaS 에 유료 구독 결제를 처음 붙이고 싶다. 아직 결제사도 요금제도 안 정했다',
    feeds: [],
    expect: { minNodes: 3, maxNodes: 12, maxLayers: 4 },
    mustAsk: [/환불|해지/, /요금|과금|플랜|티어/],
    // The policy itself must be asked; what follows it (data after cancel) may be a default
    mustNotAssume: [/환불 정책|해지 정책|해지·환불/],
    mustNotAsk: [/웹훅|빌링키|API|스키마|테스트|로그|테이블/],
  },
  {
    // Mid-sized: one feature, a couple of policies the user owns
    id: 'social',
    seed: '로그인에 구글 소셜 로그인을 추가하고 싶다',
    feeds: [],
    expect: { minNodes: 1, maxNodes: 6, maxLayers: 3 },
    mustAsk: [/기존|이미|같은 이메일|연동|합치|중복/],
    mustNotAsk: [/라이브러리|SDK|패키지|테스트|커밋|파일|환경 ?변수|시크릿/],
  },
  {
    // Policy-heavy but tiny to build: the policies must still be the user's
    id: 'withdraw',
    seed: '회원 탈퇴 기능을 추가해줘',
    feeds: [],
    expect: { minNodes: 1, maxNodes: 5, maxLayers: 2 },
    mustAsk: [/데이터|보관|삭제|유예|재가입|복구/],
    // The direction is the user's; a length (30 days) is a default they can still ask
    mustNotAssume: [/데이터 처리|콘텐츠 처리/],
    mustNotAsk: [/테스트|마이그레이션|API|테이블|커밋/],
  },
  {
    // Everything decided in the request: nothing to ask again
    id: 'decided',
    seed: [
      '토스페이먼츠로 월 구독 카드 정기결제를 붙여줘.',
      '요금제는 Pro 월 29,000원 하나. 무료 체험 없음. 환불은 하지 않고 해지하면 기간 말까지 쓴다.',
      '결제 실패하면 3일 간격 3회 재시도 후 정지.',
    ].join(' '),
    feeds: [],
    expect: { maxNodes: 2, maxLayers: 2 },
    // The decisions the request already made, not every title that mentions one
    mustNotAsk: [/결제사|요금제|가격|환불 (여부|정책)|해지 (시점|정책|처리)|체험|재시도 (횟수|간격)|결제 주기/],
  },
  {
    // Context already answers the obvious questions; they must not come back
    id: 'context',
    seed: '알림 기능을 추가하고 싶다',
    feeds: [],
    context: ['알림 채널은 이메일만 쓴다', '알림은 즉시 발송만 한다. 모아서 보내지 않는다', '수신 거부는 계정 설정에서 한다'],
    expect: { maxNodes: 4, maxLayers: 2 },
    mustNotAsk: [/채널|이메일|푸시|SMS|슬랙|즉시|모아|다이제스트|빈도|몰리|수신 ?거부 (위치|방법|화면)/],
  },
]

// ── load the mod's prompt code without the mods runtime ─────────────────────

async function loadMod() {
  const here = new URL('.', import.meta.url).pathname
  const source = readFileSync(join(here, '../hooks/register.js'), 'utf8')
  const stubbed =
    source.replace(
      /^import \{[^}]*\} from 'claude-code'$/m,
      'const atom = (_k, v) => v; const read = async () => {}; const update = async () => {}',
    ) + '\nexport { treePrompt, parseStep, MAX_LAYERS }\n'
  const dir = mkdtempSync(join(tmpdir(), 'tree-eval-'))
  const file = join(dir, 'register.mjs')
  writeFileSync(file, stubbed)
  const mod = await import(file)
  // The same file the pane reads through $.fs.read
  return { ...mod, text: readFileSync(join(here, '../prompts/tree.md'), 'utf8') }
}

// ── one model call, isolated from settings, CLAUDE.md, tools and MCP ────────

async function ask(prompt: string, model: string) {
  const proc = Bun.spawn(
    [
      'claude', '-p',
      '--model', model,
      '--no-session-persistence',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--disallowedTools', '*',
      '--system-prompt', 'You produce exactly the output the user asks for.',
    ],
    { stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe' },
  )
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return text
}

// ── the interview, as the pane runs it with auto-pick on ────────────────────

async function interview(mod: any, sample: Sample, model: string) {
  const feeds = sample.feeds.map((text, i) => ({ id: 'f' + i, text }))
  const items = (sample.context || []).map((text, i) => ({ id: 'c' + i, text, applied: true }))
  let list: any[] = []
  const perLayer: number[] = []
  const asked: string[] = []

  const settle = (fresh: any[]) =>
    fresh.map((n) => {
      const pick = n.options.find((o: any) => o.isPick) || n.options[0]
      return { ...n, zone: 'known', answer: pick ? pick.label : '' }
    })

  let step = mod.parseStep(await ask(mod.treePrompt(mod.text, sample.seed, [], feeds, items, 1, 'ko'), model), 1)
  if (!step) throw new Error(sample.id + ': layer 1 did not parse')
  let layer = 1
  const assumed: string[] = []
  const open = (s: any) => s.nodes.filter((n: any) => !n.assumed)
  while (step) {
    for (const n of step.nodes.filter((n: any) => n.assumed)) assumed.push('L' + layer + ' ' + n.title + ' → ' + n.answer)
    if (!open(step).length) break
    perLayer.push(open(step).length)
    for (const n of open(step)) asked.push('L' + layer + ' ' + n.title + (n.isExpansion ? ' [확장]' : '') + ' — ' + n.question)
    list = [...list, ...settle(open(step)), ...step.nodes.filter((n: any) => n.assumed)]
    // Same brake as advance(): no call past the cap
    if (layer >= mod.MAX_LAYERS) break
    const raw = await ask(mod.treePrompt(mod.text, sample.seed, list, feeds, items, layer + 1, 'ko'), model)
    layer += 1
    step = mod.parseStep(raw, layer)
    if (!step) throw new Error(sample.id + ': layer ' + layer + ' did not parse')
    const struck = new Set(step.drop)
    list = list.map((n) => (struck.has(n.id) ? { ...n, zone: 'deferred', dropped: true } : n))
    step.nodes = step.nodes.filter((n: any) => !list.some((row) => row.id === n.id))
  }
  const total = perLayer.reduce((a, b) => a + b, 0)
  return { layers: perLayer.length, perLayer, total, asked, assumed }
}

// ── run and compare ─────────────────────────────────────────────────────────

const runs = Number(flag('runs', '1'))
const model = flag('model', 'opus')
const only = flag('only', '')

// Every way one run can miss, named so a failure says what to fix
function faults(sample: Sample, r: Awaited<ReturnType<typeof interview>>) {
  const out: string[] = []
  const e = sample.expect
  if (r.total > e.maxNodes) out.push('too many questions: ' + r.total + ' > ' + e.maxNodes)
  if (r.total < (e.minNodes || 0)) out.push('too few questions: ' + r.total + ' < ' + e.minNodes)
  if (r.layers > e.maxLayers) out.push('too deep: ' + r.layers + ' > ' + e.maxLayers)
  for (const re of sample.mustAsk || []) {
    if (!r.asked.some((q) => re.test(q))) out.push('never asked ' + re)
  }
  // What a node is about is its title; the body may name anything in passing
  const title = (line: string) => line.replace(/ — .*| → .*/, '')
  for (const re of sample.mustNotAsk || []) {
    const hit = r.asked.find((q) => re.test(title(q)))
    if (hit) out.push('asked the implementer\'s business: ' + title(hit))
  }
  for (const re of sample.mustNotAssume || []) {
    const hit = r.assumed.find((a) => re.test(title(a)))
    if (hit) out.push('settled without asking: ' + hit)
  }
  return out
}

const mod = await loadMod()
const picked = SAMPLES.filter((s) => !only || s.id === only)
// Every run of every sample at once, a few at a time
const jobs = picked.flatMap((sample) => Array.from({ length: runs }, (_, i) => ({ sample, i })))
const results: Array<{ sample: Sample; i: number; r: Awaited<ReturnType<typeof interview>> }> = []
const LANES = 6
await Promise.all(
  Array.from({ length: LANES }, async () => {
    while (jobs.length) {
      const job = jobs.shift() as (typeof jobs)[number]
      results.push({ ...job, r: await interview(mod, job.sample, model) })
    }
  }),
)

let failed = 0
const summary: string[] = []
for (const sample of picked) {
  const mine = results.filter((x) => x.sample === sample).sort((a, b) => a.i - b.i)
  let passes = 0
  for (const { i, r } of mine) {
    const bad = faults(sample, r)
    if (bad.length) failed += 1
    else passes += 1
    console.log(
      (bad.length ? 'FAIL' : 'PASS') + ' ' + sample.id + ' #' + (i + 1) +
        '  questions ' + r.total +
        ' (' + (sample.expect.minNodes ? sample.expect.minNodes + '~' : '≤') + sample.expect.maxNodes + ')' +
        '  layers ' + r.layers + ' (≤' + sample.expect.maxLayers + ')' +
        '  per layer [' + r.perLayer.join(', ') + ']',
    )
    for (const line of bad) console.log('    !! ' + line)
    for (const line of r.asked) console.log('    ' + line)
    for (const line of r.assumed) console.log('    (질문 없이) ' + line)
  }
  summary.push(sample.id + ' ' + passes + '/' + mine.length)
}
console.log('\n' + summary.join('  ·  '))
process.exit(failed ? 1 : 0)
