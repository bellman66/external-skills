import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TodoMode } from '../types'
import {
  addItem,
  addTask,
  cells,
  clearDone,
  completeItem,
  cutCells,
  editNode,
  ensureOpenSection,
  findNode,
  flatten,
  itemKey,
  parse,
  rawOf,
  removeNode,
  reopenItem,
  serialize,
  summarize,
  textOf,
  toggleTask,
  tree,
  type Doc,
  type Node,
  type OpResult,
  type TreeGroup,
  type TreeRow,
} from './todo-md'

const PANE = 'todo'
// 패널 프레임과 제목 띠의 색. 옆의 대화나 안쪽의 흐린 상자와 한눈에 구분되게 강조색을 쓴다.
const PANEL_COLOR = 'claude'
const DEFAULT_PATH = '/Users/youn/workspace/memos/TODO.md'
// 파일이 없을 때 첫 추가가 만드는 뼈대
const NEW_FILE = '# TODO\n\n## 진행 중\n\n## 완료\n'
const POLL_MS = 2000

const textAtom = atom({ plugin: 'todo', key: 'text' } as const, null)
const errorAtom = atom({ plugin: 'todo', key: 'error' } as const, null)
const pathAtom = atom({ plugin: 'todo', key: 'path' } as const, DEFAULT_PATH)
const cursorAtom = atom({ plugin: 'todo', key: 'cursor' } as const, null)
const modeAtom = atom({ plugin: 'todo', key: 'mode' } as const, 'view')
const pendingAtom = atom({ plugin: 'todo', key: 'pendingDelete' } as const, null)
const showDoneAtom = atom({ plugin: 'todo', key: 'showDone' } as const, false)
const collapsedAtom = atom({ plugin: 'todo', key: 'collapsed' } as const, [])
// 입력창에 지금 들어 있는 글. 위의 저장 버튼과, 폭을 넘는 글을 접어 보이는 데 쓴다
const draftAtom = atom({ plugin: 'todo', key: 'draft' } as const, '')

type Engine = EngineInterface

// 모듈 변수: 핫 리로드 때 초기화된다. session.start가 다시 채운다.
let lastMtime = -1
let contextText = ''
// 입력 중이거나 삭제를 한 번 누른 상태에서 패널이 키보드를 쥐었는지. 쥔 뒤 놓으면(Esc) 원래대로 돌린다.
let heldKeys = false
// 포커스 링이 마지막으로 놓인 요소. 고른 행에서 Tab 을 눌렀는지 가리는 데 쓴다
let lastRing: string | undefined

// ---- 파일 ------------------------------------------------------------------

async function load($: Engine): Promise<Doc | null> {
  const path = await read($, pathAtom)
  try {
    const content = await $.fs.read(path)
    const stat = await $.fs.stat(path)
    lastMtime = stat.mtimeMs
    await update($, textAtom, () => content)
    await update($, errorAtom, () => null)
    return parse(content)
  } catch {
    lastMtime = -1
    await update($, textAtom, () => null)
    // 오류로 보이지 않는다: 그리는 쪽이 '첫 항목을 추가하면 만들어진다'는 빈 상태로 보인다
    await update($, errorAtom, () => 'missing')
    return null
  }
}

async function poll($: Engine): Promise<void> {
  const path = await read($, pathAtom)
  try {
    const stat = await $.fs.stat(path)
    if (stat.mtimeMs !== lastMtime) await load($)
  } catch {
    if (lastMtime !== -1) await load($)
  }
}

/**
 * 쓰기 직전에 파일을 다시 읽어 그 위에 op 를 적용한다. 밖에서 바뀐 파일도 대상 줄만
 * 그대로면 그대로 반영된다. 할 수 없는 조작은 오류로 보이지 않고, 파일을 다시 읽어
 * 지금 모습을 보여 주는 것으로 끝난다. 파일이 없으면 뼈대 위에 적용해 새로 만든다.
 */
async function mutate($: Engine, op: (doc: Doc) => OpResult): Promise<boolean> {
  const path = await read($, pathAtom)
  let fresh: string
  try {
    fresh = await $.fs.read(path)
  } catch {
    fresh = NEW_FILE
  }
  const result = op(parse(fresh))
  if (result.error !== undefined) {
    await load($)
    return false
  }
  const out = serialize(result.doc)
  try {
    await $.fs.write(path, out)
  } catch {
    await load($)
    return false
  }
  try {
    lastMtime = (await $.fs.stat(path)).mtimeMs
  } catch {
    lastMtime = -1
  }
  await update($, textAtom, () => out)
  await update($, errorAtom, () => null)
  return true
}

async function today($: Engine): Promise<string> {
  const d = new Date(await $.clock.now())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

async function cursorNode($: Engine): Promise<Node | undefined> {
  const content = await read($, textAtom)
  const id = await read($, cursorAtom)
  if (content === null) return undefined
  return findNode(parse(content), id)
}

/** 패널이 본 줄을 최신 파일에서 찾는다: 같은 자리에 같은 원문이면 그 줄, 밀렸으면 같은 원문이 하나뿐일 때 그 줄. */
function locate(doc: Doc, node: Node, raw: string | undefined): Node | undefined {
  if (raw === undefined) return undefined
  const same = findNode(doc, node.id)
  if (same && same.kind === node.kind && rawOf(doc, same) === raw) return same
  const hits = flatten(doc, true).filter(n => n.kind === node.kind && rawOf(doc, n) === raw)
  return hits.length === 1 ? hits[0] : undefined
}

/** 노드를 커서로 삼고, 그 줄을 최신 파일에서 찾아 op 를 적용한다. 못 찾으면 조용히 다시 읽기만 한다. */
async function applyTo($: Engine, node: Node, op: (node: Node, doc: Doc) => OpResult): Promise<boolean> {
  await update($, cursorAtom, () => node.id)
  const content = await read($, textAtom)
  if (content === null) return false
  const expectedRaw = rawOf(parse(content), node)
  return mutate($, doc => {
    const now = locate(doc, node, expectedRaw)
    return now ? op(now, doc) : { error: 'gone' }
  })
}

/** 고른 행으로 포커스 링을 되돌린다. 패널이 키보드를 쥐고 있지 않으면(Esc 뒤) 조용히 아무 일도 없다. */
function focusRow($: Engine, id: string | null): void {
  if (id === null) return
  $.clock.after(60, () => {
    void $.ui.focus({ requestId: PANE, key: `row:${id}` }).catch(() => undefined)
  })
}

/** 지금 그려진 행의 id 를 위에서부터. 메모 줄은 고른 항목의 것만 그려진다. */
async function visibleRows($: Engine): Promise<string[]> {
  const content = await read($, textAtom)
  if (content === null) return []
  const doc = parse(content)
  const cur = findNode(doc, await read($, cursorAtom))
  const openItem = cur && cur.kind !== 'section' ? `${cur.si}/${cur.ii}` : null
  const groups = tree(doc, await read($, showDoneAtom), await read($, collapsedAtom))
  return groups.flatMap(g => [
    g.section.id,
    ...g.rows.flatMap(r => (r.kind === 'spacer' || (r.node.kind === 'note' && `${r.node.si}/${r.node.ii}` !== openItem) ? [] : [r.node.id])),
  ])
}

/** 보이는 행 순서에서 id 바로 앞 행. 지운 뒤 커서가 갈 자리다(앞 행의 id 는 지워도 그대로다). */
async function rowBefore($: Engine, id: string): Promise<string | null> {
  const ids = await visibleRows($)
  const at = ids.indexOf(id)
  return at > 0 ? (ids[at - 1] ?? null) : null
}

async function rowAfter($: Engine, id: string): Promise<string | null> {
  const ids = await visibleRows($)
  const at = ids.indexOf(id)
  return at >= 0 ? (ids[at + 1] ?? null) : null
}

async function clearPending($: Engine): Promise<void> {
  if ((await read($, pendingAtom)) !== null) await update($, pendingAtom, () => null)
}

// ---- 조작 ------------------------------------------------------------------

/** 체크박스는 토글, 항목은 완료/되돌리기, 완료 섹션 제목은 펼치기/접기. */
async function completeOrToggle($: Engine, node: Node): Promise<void> {
  await clearPending($)
  if (node.kind === 'task') {
    await applyTo($, node, (n, doc) => (n.kind === 'task' ? toggleTask(doc, n.si, n.ii, n.li) : { error: '체크박스가 아닙니다' }))
  } else if (node.kind === 'item') {
    const date = await today($)
    await applyTo($, node, (n, doc) =>
      n.kind === 'item' ? (n.isDone ? reopenItem(doc, n.si, n.ii) : completeItem(doc, n.si, n.ii, date)) : { error: '항목이 아닙니다' },
    )
  } else if (node.kind === 'section' && node.isDone) {
    await update($, showDoneAtom, v => !v)
  }
}

async function toggleCollapse($: Engine, title: string): Promise<void> {
  const key = itemKey(title)
  await update($, collapsedAtom, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
}

/** 펼쳐진 항목이 하나라도 있으면 전부 접고, 아니면 전부 편다. */
async function foldAll($: Engine): Promise<void> {
  const content = await read($, textAtom)
  if (content === null) return
  const keys = parse(content).sections.flatMap(s => s.items.map(it => itemKey(it.title)))
  const collapsed = await read($, collapsedAtom)
  const anyOpen = keys.some(k => !collapsed.includes(k))
  await update($, collapsedAtom, () => (anyOpen ? keys : []))
}

/** 행 Enter/클릭: 커서를 두고, 체크박스는 토글, 항목은 접기/펼치기, 완료 섹션은 펼치기/접기. */
async function pressRow($: Engine, node: Node): Promise<void> {
  await update($, cursorAtom, () => node.id)
  await clearPending($)
  if (node.kind === 'task') await completeOrToggle($, node)
  else if (node.kind === 'item') await toggleCollapse($, node.title)
  else if (node.kind === 'section' && node.isDone) await update($, showDoneAtom, v => !v)
}

async function deleteNode($: Engine, node: Node): Promise<void> {
  await update($, cursorAtom, () => node.id)
  const pending = await read($, pendingAtom)
  if (pending === node.id) {
    await update($, pendingAtom, () => null)
    const prev = await rowBefore($, node.id)
    const ok = await applyTo($, node, (n, doc) => removeNode(doc, n))
    if (ok) {
      await update($, cursorAtom, () => prev)
      focusRow($, prev)
    }
    return
  }
  await update($, pendingAtom, () => node.id)
}

/** 완료 섹션 비우기. 삭제처럼 두 번 눌러야 지운다. */
async function clearDoneSection($: Engine, node: Node): Promise<void> {
  await update($, cursorAtom, () => node.id)
  const key = `clear:${node.id}`
  if ((await read($, pendingAtom)) === key) {
    await update($, pendingAtom, () => null)
    await applyTo($, node, (n, doc) => clearDone(doc, n.si))
    return
  }
  await update($, pendingAtom, () => key)
}

async function enterMode($: Engine, mode: TodoMode, node?: Node): Promise<void> {
  await clearPending($)
  if (node) await update($, cursorAtom, () => node.id)
  const target = node ?? (await cursorNode($))
  // 그 행에서 할 수 없는 조작은 버튼부터 그리지 않는다. 여기 닿아도 조용히 아무 일도 없다
  if ((mode === 'add-task' || mode === 'edit') && (!target || target.kind === 'section')) return
  const initial = mode === 'path' ? await read($, pathAtom) : mode === 'edit' && target ? textOf(target) : ''
  await update($, draftAtom, () => initial)
  await update($, modeAtom, () => mode)
  $.clock.after(60, () => {
    void $.ui.focus({ requestId: PANE, key: 'entry' }).catch(() => undefined)
  })
}

/** 입력·한 번 누른 삭제를 모두 거두고 보기 상태로 돌아간다. 취소 버튼과 Esc 가 쓴다. */
async function leaveMode($: Engine): Promise<void> {
  await update($, modeAtom, () => 'view')
  await clearPending($)
  focusRow($, await read($, cursorAtom))
}

/** 파일이 없거나 열린 섹션이 없을 때의 '첫 항목 추가': 트리 아래 입력창을 연다. */
async function startFirstItem($: Engine): Promise<void> {
  await update($, cursorAtom, () => null)
  await enterMode($, 'add-item')
}

/** 패널을 닫고 다음 세션에도 자동으로 띄우지 않는다. /todo 로 다시 연다. */
async function closePane($: Engine): Promise<void> {
  await $.store.set('autoOpen', false)
  await $.ui.close({ id: PANE })
  $.ui.toast('todo: 패널을 닫았습니다. /todo 로 다시 엽니다.')
}

async function toggleShowDone($: Engine): Promise<void> {
  await update($, showDoneAtom, v => !v)
}

/** 위의 저장 버튼: Enter 없이 필드의 지금 글로 제출한다. */
async function saveDraft($: Engine, mode: TodoMode): Promise<void> {
  await submitEntry($, mode, await read($, draftAtom))
}

function isDoneAt(doc: Doc, si: number): boolean {
  const n = findNode(doc, `${si}`)
  return n?.kind === 'section' && n.isDone
}

async function submitEntry($: Engine, mode: TodoMode, value: string): Promise<void> {
  const text = value.trim()
  await update($, modeAtom, () => 'view')
  const node = await cursorNode($)
  if (text === '') {
    focusRow($, node?.id ?? null)
    return
  }
  if (mode === 'path') {
    const home = (await $.env.get('HOME')) ?? ''
    const path = text.startsWith('~/') ? `${home}${text.slice(1)}` : text
    await $.store.set('path', path)
    await update($, pathAtom, () => path)
    await update($, cursorAtom, () => null)
    const doc = await load($)
    contextText = doc ? summarize(doc, path) : ''
    return
  }
  // 새로 생긴 줄(또는 고친 줄)에 커서와 포커스를 둔다
  let landed: string | null = null
  if (mode === 'add-item') {
    // 완료 섹션 안에서 연 추가는 열린 섹션 맨 앞으로 간다
    const content = await read($, textAtom)
    const inDone = node !== undefined && content !== null && isDoneAt(parse(content), node.si)
    const anchor = inDone ? undefined : node
    const ok = anchor
      ? await applyTo($, anchor, (n, doc) => {
          const r = n.kind === 'section' ? addItem(doc, n.si, null, text) : addItem(doc, n.si, n.ii, text)
          landed = n.kind === 'section' ? `${n.si}/0` : `${n.si}/${n.ii + 1}`
          return r
        })
      : await mutate($, doc => {
          const open = ensureOpenSection(doc)
          landed = `${open.si}/0`
          return addItem(open.doc, open.si, null, text)
        })
    if (!ok) landed = null
  } else if (mode === 'add-task' && node) {
    if (node.kind === 'item') await update($, collapsedAtom, list => list.filter(k => k !== itemKey(node.title)))
    const ok = await applyTo($, node, (n, doc) => {
      if (n.kind === 'item') {
        landed = `${n.si}/${n.ii}/0`
        return addTask(doc, n.si, n.ii, null, text)
      }
      if (n.kind === 'task' || n.kind === 'note') {
        landed = `${n.si}/${n.ii}/${n.li + 1}`
        return addTask(doc, n.si, n.ii, n.li, text)
      }
      return { error: 'section' }
    })
    if (!ok) landed = null
  } else if (mode === 'edit' && node) {
    const ok = await applyTo($, node, (n, doc) => editNode(doc, n, text))
    landed = ok ? node.id : null
  }
  if (landed !== null) await update($, cursorAtom, () => landed)
  focusRow($, landed ?? node?.id ?? null)
}

// ---- 등록 ------------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('path')
    const path = typeof stored === 'string' && stored !== '' ? stored : DEFAULT_PATH
    await update($, pathAtom, () => path)
    await update($, modeAtom, () => 'view')
    await update($, pendingAtom, () => null)
    const doc = await load($)
    contextText = doc ? summarize(doc, path) : ''

    await $.command.register({ name: 'todo', description: 'TODO 패널을 열고 닫습니다 (on / off). 닫아 두면 다음 세션에도 뜨지 않습니다' })

    // 사람이 닫아 둔 패널(ctrl+x x 또는 /todo)은 다시 켤 때까지 자동으로 띄우지 않는다.
    if (e.isInteractive && (await $.store.get('autoOpen')) !== false) {
      const opened = await $.ui.open({ id: PANE, title: 'TODO' })
      if (!opened.isPlaced) $.ui.toast('todo: 터미널이 좁아 패널이 대기 중입니다. /todo 로 열 수 있습니다')
    }

    $.clock.every(POLL_MS, () => {
      void poll($)
    })

    return next(e)
  })

  // /todo 는 토글, /todo on · /todo off 는 명시. 닫으면 다음 세션에도 자동으로 뜨지 않는다.
  on('command.run', { command: 'todo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    const wantOpen = arg === 'on' ? true : arg === 'off' ? false : !isOpen
    await $.store.set('autoOpen', wantOpen)
    if (!wantOpen) {
      if (isOpen) await $.ui.close({ id: PANE })
      return { text: 'TODO 패널을 닫았습니다. 다음 세션에도 뜨지 않습니다. /todo 로 다시 엽니다.' }
    }
    // 여는 동안 파일이 바뀌었을 수 있으니 열 때마다 다시 읽는다
    const doc = await load($)
    contextText = doc ? summarize(doc, await read($, pathAtom)) : ''
    await $.ui.open({ id: PANE, title: 'TODO', focus: true })
    return { text: 'TODO 패널을 열었습니다. Tab 으로 행을 고르고, 행 밑의 버튼이나 단축키로 조작합니다. /todo 로 닫습니다.' }
  })

  // ctrl+x x 나 닫기 표시로 닫은 것도 기억한다.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await $.store.set('autoOpen', false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (contextText === '') return result
    return { sections: [...result.sections, { id: 'todo:todo', text: contextText, scope: 'session' }] }
  })

  // Tab 한 번에 한 행. 고르지 않은 행 끝의 작은 버튼(✓ + ✎ ×)에 링이 오면 그 행 자체에 내려놓고,
  // 고른 행에서 Tab 해 그 밑의 이름 있는 버튼(단축키·클릭용)에 오면 다음 행으로 건너뛴다.
  // 커서가 다른 행으로 가면 한 번 누른 삭제는 거둔다
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    let element = e.element
    const cursor = await read($, cursorAtom)
    if (e.origin.kind === 'person' && element !== undefined && element.startsWith('act:')) {
      const id = element.split(':').slice(2).join(':')
      if (id !== '' && id !== cursor) element = `row:${id}`
      else if (id !== '' && id === cursor && lastRing === `row:${cursor}`) {
        const after = await rowAfter($, cursor)
        if (after !== null) element = `row:${after}`
      }
    }
    if (element !== undefined && element.startsWith('row:')) {
      const id = element.slice(4)
      if (id !== cursor) {
        await clearPending($)
        await update($, cursorAtom, () => id)
      }
    }
    const result = await (element === e.element ? next(e) : next({ ...e, element }))
    if (result.deny === undefined) lastRing = element
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const content = await read($, textAtom)
    const error = await read($, errorAtom)
    const path = await read($, pathAtom)
    const cursor = await read($, cursorAtom)
    const mode = await read($, modeAtom)
    const pending = await read($, pendingAtom)
    const showDone = await read($, showDoneAtom)
    const collapsed = await read($, collapsedAtom)
    const draft = mode === 'view' ? '' : await read($, draftAtom)

    // 패널 프레임: 도킹이면 굵은 테두리(2칸)와 여백(2칸)을 두르고, 인라인이면 호스트가
    // 이미 테두리를 그리므로 제목 띠만 그린다. 안쪽 상자는 다시 테두리 2칸 + 여백 2칸.
    const framed = e.props.placement !== 'inline'
    const panelW = Math.max(24, e.props.bodyColumns - (framed ? 4 : 0))
    const inner = Math.max(16, panelW - 4)
    const home = path.startsWith('/Users/') ? path.replace(/^\/Users\/[^/]+/, '~') : path
    const dir = home.slice(0, home.lastIndexOf('/') + 1)
    const file = home.slice(home.lastIndexOf('/') + 1)

    const doc = content === null ? null : parse(content)
    const groups = doc ? tree(doc, showDone, collapsed) : []
    const openCount = groups.filter(g => !g.section.isDone).reduce((n, g) => n + g.section.open, 0)
    const totalCount = groups.filter(g => !g.section.isDone).reduce((n, g) => n + g.section.total, 0)
    const selected = doc ? findNode(doc, cursor) : undefined
    // 메모 줄은 고른 항목(또는 그 밑 줄)에서만 보인다
    const selectedItem = selected && selected.kind !== 'section' ? `${selected.si}/${selected.ii}` : null

    // Esc 는 훅에 오지 않고 키보드만 프롬프트로 돌려준다. 입력·삭제 대기 중에 쥐고 있던
    // 키보드를 놓으면 그게 Esc(또는 밖을 누름)이므로, 다음 틱에 원래 상태로 돌린다
    const isDirty = mode !== 'view' || pending !== null
    if (!isDirty) heldKeys = false
    else if (e.props.isFocused) heldKeys = true
    else if (heldKeys) {
      heldKeys = false
      $.clock.after(1, () => void leaveMode($))
    }

    if (e.surface === 'mobile') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>TODO {openCount}/{totalCount} 남음</Text>
          <Text dimColor>{cutCells(home, inner)}</Text>
          {groups.map(g => [
            <Text bold>{sectionLabel(g, showDone)}</Text>,
            ...g.rows.map(r => <Text dimColor={r.kind === 'spacer' || r.node.kind === 'note'}>{cutCells(rowText(r, collapsed), inner)}</Text>),
          ])}
        </Box>
      )
    }

    const { Box, Text, Button, Input } = $.ui.resolve(e)

    // ---- 입력창: 대상 행 바로 아래에 뜬다. 첫 줄은 이름과 취소·저장, 둘째 줄은 필드.
    // 필드는 한 줄이라 폭을 넘는 글은 잘리므로, 그때는 필드 밑에 글 전체를 접어서 보여 준다 ----
    const entryFor = (stem: string) => {
      if (mode === 'view') return null
      const label = mode === 'path' ? '파일 경로' : mode === 'add-item' ? '새 항목' : mode === 'edit' ? '수정' : '새 하위 작업'
      const value = mode === 'path' ? path : mode === 'edit' && selected ? textOf(selected) : ''
      const submitWord = mode === 'path' ? '변경' : mode === 'edit' ? '저장' : '추가'
      // 필드 폭: 줄기, 테두리·여백 4칸, 필드 옆의 '⏎' 를 뺀 나머지. 제출 이름은 위의 버튼이 보이므로
      // 필드 옆에는 비워 둔다(길면 호스트가 그 이름을 두 줄로 접는다)
      const fieldRoom = inner - cells(stem) - 4 - 3
      return (
        <Box flexDirection="row">
          <Box flexShrink={0}>
            <Text dimColor>{stem}</Text>
          </Box>
          <Box flexDirection="column" borderStyle="round" borderColor="permission" paddingX={1} flexGrow={1} flexShrink={1}>
            <Box flexDirection="row" columnGap={2}>
              <Text bold color="permission">{label}</Text>
              <Box flexGrow={1} />
              <Button key="cancel" plain dimColor label="×취소" onPress={() => void leaveMode($)} />
              <Button key="save" plain label={`✓${submitWord}`} onPress={() => void saveDraft($, mode)} />
            </Box>
            <Input
              key="entry"
              autoFocus
              placeholder={mode === 'path' ? path : '비우고 Enter 또는 Esc 로 취소'}
              value={value}
              submitLabel=""
              onInput={(v: string) => void update($, draftAtom, () => v)}
              onSubmit={(v: string) => void submitEntry($, mode, v)}
            />
            {cells(draft) > fieldRoom && (
              <Text dimColor wrap="wrap">
                {draft}
              </Text>
            )}
          </Box>
        </Box>
      )
    }

    // ---- 헤더 ----
    const barWidth = Math.max(8, Math.min(30, inner - 16))
    const filled = totalCount === 0 ? 0 : Math.round(((totalCount - openCount) / totalCount) * barWidth)
    // ---- 패널 띠: 첫 줄에 mod 이름을 강조색 블록으로, 옆에 용도, 오른쪽 끝에 패널 전체 조작 ----
    const band = (
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text inverse bold color={PANEL_COLOR}>{' TODO '}</Text>
          <Text dimColor>{'할 일 목록'}</Text>
          <Box flexGrow={1} />
          <Text dimColor>{`${totalCount - openCount}/${totalCount} 완료`}</Text>
          <Button key="act:close" plain dimColor hotkey="q" label="×닫기" onPress={() => void closePane($)} />
        </Box>
        <Text color={PANEL_COLOR} dimColor>{'─'.repeat(panelW)}</Text>
      </Box>
    )
    const header = (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box flexDirection="row">
          <Text color="success">{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
          <Text dimColor>{`  남은 작업 ${openCount}`}</Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Box flexDirection="row">
            <Text dimColor>{cutCells(dir, Math.max(4, inner - file.length - 10))}</Text>
            <Text bold>{file}</Text>
          </Box>
          <Button key="act:path" plain dimColor hotkey="p" label="경로" onPress={() => void enterMode($, 'path')} />
        </Box>
        {mode === 'path' && entryFor('')}
        <Box flexDirection="row" columnGap={2} marginTop={1}>
          <Button key="act:fold" plain dimColor hotkey="f" label="접기/펼치기" onPress={() => void foldAll($)} />
          <Button key="act:done" plain dimColor hotkey="c" label={showDone ? '완료 숨기기' : '완료 보기'} onPress={() => void toggleShowDone($)} />
          <Button key="act:reload" plain dimColor hotkey="r" label="새로고침" onPress={() => void load($)} />
        </Box>
      </Box>
    )

    // ---- 행 버튼. 다른 행은 오른쪽 끝에 한 글자씩, 커서 행은 단축키가 붙어 길어지므로
    // 행 밑의 한 줄로 내려 폭이 좁아도 삭제까지 다 보이게 한다 ----
    const controlsFor = (node: Node, isCur: boolean) => {
      const hk = (k: string) => (isCur ? k : undefined)
      const named: Record<string, string> = { complete: '완료', 'add-item': '항목', 'add-task': '하위', edit: '수정', delete: '삭제' }
      const b = (key: string, glyph: string, hotkey: string | undefined, onPress: () => void, dim = true) =>
        // 한 번 누른 삭제는 그 버튼만 '진짜 삭제'로 밝힌다. 한 번 더 누르면 지운다
        key === 'delete' && pending === node.id ? (
          <Button key={`act:${key}:${node.id}`} plain hotkey={hotkey} onPress={onPress}>
            <Text inverse bold color="error">{' ×진짜 삭제 '}</Text>
          </Button>
        ) : (
          <Button
            key={`act:${key}:${node.id}`}
            plain
            dimColor={dim}
            hotkey={hotkey}
            label={isCur && node.kind !== 'section' ? `${glyph}${named[key]}` : glyph}
            onPress={onPress}
          />
        )
      const list: JSX.Element[] = []
      if (node.kind === 'section') {
        if (!node.isDone) list.push(b('add-item', '+', hk('n'), () => void enterMode($, 'add-item', node), !isCur))
        // 완료 섹션은 통째로 비우는 버튼 하나. 접혀 있어도 보이고, 한 번 누르면 '진짜 비우기'로 밝힌다
        else if (node.total > 0)
          list.push(
            pending === `clear:${node.id}` ? (
              <Button key={`act:clear:${node.id}`} plain hotkey={hk('d')} onPress={() => void clearDoneSection($, node)}>
                <Text inverse bold color="error">{` ×진짜 비우기(${node.total}) `}</Text>
              </Button>
            ) : (
              <Button key={`act:clear:${node.id}`} plain dimColor={!isCur} hotkey={hk('d')} label="×비우기" onPress={() => void clearDoneSection($, node)} />
            ),
          )
      } else if (node.kind === 'item') {
        list.push(b('complete', node.isDone ? '↩' : '✓', hk('x'), () => void completeOrToggle($, node), node.isDone))
        if (!node.isDone) list.push(b('add-task', '+', hk('a'), () => void enterMode($, 'add-task', node), !isCur))
        list.push(b('edit', '✎', hk('e'), () => void enterMode($, 'edit', node), !isCur))
        list.push(b('delete', '×', hk('d'), () => void deleteNode($, node), !isCur))
      } else {
        if (node.kind === 'task') list.push(b('complete', node.done ? '↩' : '✓', hk('x'), () => void completeOrToggle($, node), !isCur))
        list.push(b('add-task', '+', hk('a'), () => void enterMode($, 'add-task', node), !isCur))
        list.push(b('edit', '✎', hk('e'), () => void enterMode($, 'edit', node), !isCur))
        list.push(b('delete', '×', hk('d'), () => void deleteNode($, node), !isCur))
      }
      if (isCur && node.kind !== 'section') {
        return (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {list}
          </Box>
        )
      }
      return (
        <Box flexDirection="row" columnGap={1} flexShrink={0}>
          {list}
        </Box>
      )
    }

    // ---- 트리 ----
    const sections = groups.map(g => {
      const secId = g.section.id
      const isSecCur = cursor === secId
      const title = (
        <Box flexDirection="row" justifyContent="space-between">
          <Button key={`row:${secId}`} plain onPress={() => void pressRow($, g.section)}>
            <Text bold color={isSecCur ? 'suggestion' : undefined}>
              {cutCells(sectionLabel(g, showDone), inner - (g.section.isDone && g.section.total > 0 ? 26 : 16))}
            </Text>
          </Button>
          <Box flexDirection="row" columnGap={2} flexShrink={0}>
            <Text dimColor>{sectionSuffix(g)}</Text>
            {controlsFor(g.section, isSecCur)}
          </Box>
        </Box>
      )
      const rows = g.rows.flatMap(r => {
        if (r.kind === 'spacer') return [<Text dimColor>{r.prefix}</Text>]
        const node = r.node
        if (node.kind === 'note' && `${node.si}/${node.ii}` !== selectedItem) return []
        const isCur = cursor === node.id
        const dimRow = (node.kind === 'item' && node.isDone) || (node.kind === 'task' && node.done) || node.kind === 'note'
        const glyph =
          node.kind === 'item'
            ? node.isDone
              ? '✔ '
              : r.hasChildren
                ? r.isCollapsed
                  ? '▸ '
                  : '▾ '
                : '· '
            : node.kind === 'task'
              ? node.done
                ? '[x] '
                : '[ ] '
              : '  '
        const body = node.kind === 'item' || node.kind === 'section' ? node.title : node.text
        const right = node.kind === 'item' && !node.isDone ? `${node.open}/${node.total}` : ''
        // 다른 행의 버튼 4개는 7칸 + 간격 2칸. 커서 행은 버튼이 밑줄로 내려가 그만큼 글이 넓다
        const controlsWidth = isCur ? 0 : 9
        const room = inner - cells(r.prefix) - cells(glyph) - (right === '' ? 0 : cells(right) + 2) - controlsWidth
        const stem = r.prefix.replace(/[├└]── $/, m => (m.startsWith('└') ? '    ' : '│   '))
        const out: JSX.Element[] = [
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row" flexShrink={1}>
              {/* 트리 줄기는 버튼 밖, 줄지 않는 상자에 둬서 글이 길어도 줄기가 깨지지 않는다 */}
              <Box flexShrink={0}>
                <Text dimColor>{r.prefix}</Text>
              </Box>
              <Button key={`row:${node.id}`} plain dimColor={dimRow} onPress={() => void pressRow($, node)}>
                <Text
                  bold={node.kind === 'item' && !node.isDone}
                  strikethrough={node.kind === 'task' && node.done}
                  inverse={isCur}
                  color={isCur ? 'suggestion' : undefined}
                >
                  {glyph}
                  {cutCells(body, Math.max(6, room))}
                </Text>
              </Button>
            </Box>
            <Box flexDirection="row" columnGap={2} flexShrink={0}>
              <Text dimColor>{right}</Text>
              {!isCur && controlsFor(node, isCur)}
            </Box>
          </Box>,
        ]
        if (isCur && mode === 'view') {
          out.push(
            <Box flexDirection="row">
              <Text dimColor>{stem}</Text>
              {controlsFor(node, isCur)}
            </Box>,
          )
        }
        if (isCur && mode !== 'view' && mode !== 'path') {
          const e2 = entryFor(stem)
          if (e2) out.push(e2)
        }
        return out
      })
      const sectionEntry = isSecCur && mode === 'add-item' ? entryFor('') : null
      return (
        <Box flexDirection="column" borderStyle="round" borderDimColor={!isSecCur} borderColor={g.section.isDone ? undefined : 'success'} paddingX={1} paddingY={rows.length > 0 ? 1 : 0} marginTop={1} rowGap={rows.length > 0 ? 1 : 0}>
          {title}
          {sectionEntry}
          {rows.length > 0 && <Box flexDirection="column">{rows}</Box>}
        </Box>
      )
    })

    // 파일이 없거나 열린 섹션이 없으면 오류 대신, 첫 항목을 추가하는 자리를 보여 준다
    const needsStarter = !groups.some(g => !g.section.isDone)
    const starter = (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginTop={1}>
        <Text dimColor wrap="wrap">
          {error !== null ? '아직 할 일 파일이 없어요. 첫 항목을 추가하면 이 경로에 만들어집니다.' : '진행 중인 할 일이 없어요.'}
        </Text>
        {mode !== 'add-item' && <Button key="act:first" plain hotkey="n" label="+ 첫 항목 추가" onPress={() => void startFirstItem($)} />}
      </Box>
    )

    // 커서가 없는데 항목 추가 모드면 트리 아래에 입력창
    const looseEntry = mode === 'add-item' && !selected ? entryFor('') : null

    // 도킹이면 패널 전체를 강조색의 굵은 테두리로 두른다
    const frameProps = framed ? { borderStyle: 'bold', borderColor: PANEL_COLOR, paddingX: 1 } : {}
    return (
      <Box flexDirection="column" {...frameProps}>
        {band}
        {header}
        {needsStarter && starter}
        {sections}
        {looseEntry}
        <Text dimColor>
          {e.props.isFocused ? '고른 행 밑의 버튼이나 단축키 x a e d(두 번) · n 항목 · f c r p · Esc 원래대로 · q 닫기' : 'ctrl+x tab 포커스 · Tab 행 이동 · Enter 체크/접기 · 행 끝 ✓ + ✎ × 클릭'}
        </Text>
      </Box>
    )
  })
}

// ---- 그리기 보조 (순수) -------------------------------------------------------

function sectionLabel(g: TreeGroup, showDone: boolean): string {
  const s = g.section
  if (s.isDone) return `${showDone ? '▾' : '▸'} ${s.title}`
  return `§ ${s.title}`
}

function sectionSuffix(g: TreeGroup): string {
  const s = g.section
  return s.isDone ? `${s.total}개` : `${s.open}/${s.total} 남음`
}

function rowText(r: TreeRow, collapsed: readonly string[]): string {
  if (r.kind === 'spacer') return r.prefix
  const n = r.node
  if (n.kind === 'item') {
    const glyph = n.isDone ? '✔' : collapsed.includes(itemKey(n.title)) ? '▸' : '▾'
    return `${r.prefix}${glyph} ${n.title}${n.isDone ? '' : `  ${n.open}/${n.total}`}`
  }
  if (n.kind === 'task') return `${r.prefix}${n.done ? '[x]' : '[ ]'} ${n.text}`
  if (n.kind === 'note') return `${r.prefix}${n.text}`
  return `${r.prefix}${n.title}`
}
