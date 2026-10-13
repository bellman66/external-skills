// TODO.md 파서·직렬화·조작: 순수 함수만 있다. 줄의 원문(raw)을 보존해
// 바꾸지 않은 줄은 글자 하나 다르지 않게 다시 써진다.
//
// 구조: 머리(head) → ## 섹션 → ### 항목 → 체크박스(task)·메모(note) 줄

export type LineKind = 'task' | 'note' | 'blank' | 'other'
export type Line = { raw: string; kind: LineKind; done: boolean; text: string }
export type Item = { heading: string; title: string; lines: Line[] }
export type Section = { heading: string; title: string; lead: string[]; items: Item[] }
export type Doc = { head: string[]; sections: Section[] }

export type Node =
  | { kind: 'section'; id: string; si: number; title: string; isDone: boolean; open: number; total: number }
  | { kind: 'item'; id: string; si: number; ii: number; title: string; isDone: boolean; open: number; total: number }
  | { kind: 'task'; id: string; si: number; ii: number; li: number; text: string; done: boolean }
  | { kind: 'note'; id: string; si: number; ii: number; li: number; text: string }

export type OpResult = { doc: Doc; error?: undefined } | { error: string; doc?: undefined }

const TASK = /^(\s*)[-*] \[( |x|X)\] (.*)$/
const NOTE = /^(\s*)[-*] (.*)$/
const SECTION = /^## (.*)$/
const ITEM = /^### (.*)$/
const DONE_TITLE = /완료|done/i
const DONE_SUFFIX = /\s*\(완료 [^)]*\)\s*$/

export function parseLine(raw: string): Line {
  const t = TASK.exec(raw)
  if (t) return { raw, kind: 'task', done: t[2] !== ' ', text: t[3] ?? '' }
  const n = NOTE.exec(raw)
  if (n) return { raw, kind: 'note', done: false, text: n[2] ?? '' }
  if (raw.trim() === '') return { raw, kind: 'blank', done: false, text: '' }
  return { raw, kind: 'other', done: false, text: raw }
}

export function parse(text: string): Doc {
  const doc: Doc = { head: [], sections: [] }
  let section: Section | null = null
  let item: Item | null = null
  for (const raw of text.split('\n')) {
    const s = SECTION.exec(raw)
    if (s) {
      section = { heading: raw, title: (s[1] ?? '').trim(), lead: [], items: [] }
      doc.sections.push(section)
      item = null
      continue
    }
    const i = section ? ITEM.exec(raw) : null
    if (section && i) {
      item = { heading: raw, title: (i[1] ?? '').trim(), lines: [] }
      section.items.push(item)
      continue
    }
    if (item) item.lines.push(parseLine(raw))
    else if (section) section.lead.push(raw)
    else doc.head.push(raw)
  }
  return doc
}

export function serialize(doc: Doc): string {
  const out: string[] = [...doc.head]
  for (const s of doc.sections) {
    out.push(s.heading, ...s.lead)
    for (const it of s.items) out.push(it.heading, ...it.lines.map(l => l.raw))
  }
  return out.join('\n')
}

export const isDoneSection = (s: Section): boolean => DONE_TITLE.test(s.title)

function countItem(it: Item): { open: number; total: number } {
  const tasks = it.lines.filter(l => l.kind === 'task')
  return { open: tasks.filter(l => !l.done).length, total: tasks.length }
}

/** 트리를 위에서 아래로 편 목록. 완료 섹션은 showDone이 꺼져 있으면 제목만 낸다. */
export function flatten(doc: Doc, showDone: boolean): Node[] {
  const nodes: Node[] = []
  doc.sections.forEach((s, si) => {
    const isDone = isDoneSection(s)
    const counts = s.items.map(countItem)
    nodes.push({
      kind: 'section',
      id: `${si}`,
      si,
      title: s.title,
      isDone,
      open: isDone ? s.items.length : counts.reduce((n, c) => n + c.open, 0),
      total: isDone ? s.items.length : counts.reduce((n, c) => n + c.total, 0),
    })
    if (isDone && !showDone) return
    s.items.forEach((it, ii) => {
      const c = counts[ii] ?? { open: 0, total: 0 }
      nodes.push({ kind: 'item', id: `${si}/${ii}`, si, ii, title: it.title, isDone, ...c })
      it.lines.forEach((l, li) => {
        if (l.kind === 'task') nodes.push({ kind: 'task', id: `${si}/${ii}/${li}`, si, ii, li, text: l.text, done: l.done })
        else if (l.kind === 'note') nodes.push({ kind: 'note', id: `${si}/${ii}/${li}`, si, ii, li, text: l.text })
      })
    })
  })
  return nodes
}

export function findNode(doc: Doc, id: string | null): Node | undefined {
  if (id === null) return undefined
  return flatten(doc, true).find(n => n.id === id)
}

/** 커서 밑 노드의 원문. 파일이 밖에서 바뀌었는지 비교하는 데 쓴다. */
export function rawOf(doc: Doc, node: Node): string | undefined {
  const s = doc.sections[node.si]
  if (!s) return undefined
  if (node.kind === 'section') return s.heading
  const it = s.items[node.ii]
  if (!it) return undefined
  if (node.kind === 'item') return it.heading
  return it.lines[node.li]?.raw
}

function cloneDoc(doc: Doc): Doc {
  return {
    head: [...doc.head],
    sections: doc.sections.map(s => ({
      ...s,
      lead: [...s.lead],
      items: s.items.map(it => ({ ...it, lines: it.lines.map(l => ({ ...l })) })),
    })),
  }
}

const blank = (): Line => ({ raw: '', kind: 'blank', done: false, text: '' })
const MISSING = { error: '항목을 찾을 수 없습니다. 파일이 바뀌었을 수 있습니다.' } as const

function endsBlank(it: Item): void {
  if (it.lines.length === 0 || it.lines[it.lines.length - 1]?.kind !== 'blank') it.lines.push(blank())
}

export function toggleTask(doc: Doc, si: number, ii: number, li: number): OpResult {
  const d = cloneDoc(doc)
  const line = d.sections[si]?.items[ii]?.lines[li]
  if (!line || line.kind !== 'task') return MISSING
  const m = TASK.exec(line.raw)
  if (!m) return MISSING
  line.done = !line.done
  line.raw = `${m[1] ?? ''}- [${line.done ? 'x' : ' '}] ${m[3] ?? ''}`
  return { doc: d }
}

/** 항목을 ## 완료 섹션 끝으로 옮기고 제목에 (완료 YYYY-MM-DD)를 붙인다. */
export function completeItem(doc: Doc, si: number, ii: number, date: string): OpResult {
  const d = cloneDoc(doc)
  const s = d.sections[si]
  const it = s?.items[ii]
  if (!s || !it) return MISSING
  if (isDoneSection(s)) return { error: '이미 완료 섹션에 있는 항목입니다.' }
  s.items.splice(ii, 1)
  it.title = `${it.title.replace(DONE_SUFFIX, '')} (완료 ${date})`
  it.heading = `### ${it.title}`
  endsBlank(it)
  let done = d.sections.find(isDoneSection)
  if (!done) {
    const last = d.sections[d.sections.length - 1]
    if (last) {
      const tail = last.items[last.items.length - 1]
      if (tail) endsBlank(tail)
      else if (last.lead[last.lead.length - 1] !== '') last.lead.push('')
    }
    done = { heading: '## 완료', title: '완료', lead: [''], items: [] }
    d.sections.push(done)
  }
  if (done.items.length === 0 && done.lead[done.lead.length - 1] !== '') done.lead.push('')
  done.items.push(it)
  return { doc: d }
}

/** 완료 섹션의 항목을 첫 진행 섹션 끝으로 되돌리고 완료 표식을 뗀다. */
export function reopenItem(doc: Doc, si: number, ii: number): OpResult {
  const d = cloneDoc(doc)
  const s = d.sections[si]
  const it = s?.items[ii]
  if (!s || !it) return MISSING
  if (!isDoneSection(s)) return { error: '완료 섹션의 항목이 아닙니다.' }
  s.items.splice(ii, 1)
  it.title = it.title.replace(DONE_SUFFIX, '')
  it.heading = `### ${it.title}`
  endsBlank(it)
  let open = d.sections.find(x => !isDoneSection(x))
  if (!open) {
    open = { heading: '## 진행 중', title: '진행 중', lead: [''], items: [] }
    d.sections.splice(d.sections.indexOf(s), 0, open)
  }
  open.items.push(it)
  return { doc: d }
}

/** afterLi가 null이면 항목 제목 바로 아래, 아니면 그 줄 바로 아래에 체크박스를 넣는다. */
export function addTask(doc: Doc, si: number, ii: number, afterLi: number | null, text: string): OpResult {
  const d = cloneDoc(doc)
  const it = d.sections[si]?.items[ii]
  if (!it) return MISSING
  const at = afterLi === null ? 0 : Math.min(afterLi + 1, it.lines.length)
  const indent = afterLi === null ? '' : (/^(\s*)/.exec(it.lines[afterLi]?.raw ?? '')?.[1] ?? '')
  it.lines.splice(at, 0, parseLine(`${indent}- [ ] ${text}`))
  return { doc: d }
}

/** afterIi가 null이면 섹션 첫 항목으로, 아니면 그 항목 바로 아래에 ### 항목을 넣는다. */
export function addItem(doc: Doc, si: number, afterIi: number | null, title: string): OpResult {
  const d = cloneDoc(doc)
  const s = d.sections[si]
  if (!s) return MISSING
  const at = afterIi === null ? 0 : Math.min(afterIi + 1, s.items.length)
  if (at === 0) {
    if (s.lead[s.lead.length - 1] !== '') s.lead.push('')
  } else {
    const prev = s.items[at - 1]
    if (prev) endsBlank(prev)
  }
  s.items.splice(at, 0, { heading: `### ${title}`, title, lines: [blank()] })
  return { doc: d }
}

export function removeNode(doc: Doc, node: Node): OpResult {
  const d = cloneDoc(doc)
  const s = d.sections[node.si]
  if (!s) return MISSING
  if (node.kind === 'section') return { error: '섹션은 패널에서 지울 수 없습니다. 파일에서 직접 지우세요.' }
  if (node.kind === 'item') {
    if (!s.items[node.ii]) return MISSING
    s.items.splice(node.ii, 1)
    return { doc: d }
  }
  const it = s.items[node.ii]
  if (!it || !it.lines[node.li]) return MISSING
  it.lines.splice(node.li, 1)
  return { doc: d }
}

/** 완료가 아닌 섹션이 없으면 맨 앞(완료 섹션 앞)에 "## 진행 중" 을 만들어, 그 섹션 번호를 돌려준다. */
export function ensureOpenSection(doc: Doc): { doc: Doc; si: number } {
  const found = doc.sections.findIndex(s => !isDoneSection(s))
  if (found >= 0) return { doc, si: found }
  const d = cloneDoc(doc)
  if (d.head.length > 0 && d.head[d.head.length - 1]?.trim() !== '') d.head.push('')
  d.sections.unshift({ heading: '## 진행 중', title: '진행 중', lead: [''], items: [] })
  return { doc: d, si: 0 }
}

/** 완료 섹션의 항목을 모두 지운다. 섹션 제목은 남겨 다음 완료가 들어갈 자리로 둔다. */
export function clearDone(doc: Doc, si: number): OpResult {
  const d = cloneDoc(doc)
  const s = d.sections[si]
  if (!s) return MISSING
  if (!isDoneSection(s)) return { error: '완료 섹션이 아닙니다.' }
  if (s.items.length === 0) return { error: '완료 섹션이 이미 비어 있습니다.' }
  s.items = []
  // 뒤에 다른 섹션이 오면 빈 줄 하나로 띄워 둔다
  if (si < d.sections.length - 1 && s.lead[s.lead.length - 1]?.trim() !== '') s.lead.push('')
  return { doc: d }
}

/** 세션 시작 시 Claude에게 주입할 요약: 진행 중 섹션의 항목과 미완료 작업만. */
export function summarize(doc: Doc, path: string): string {
  const lines: string[] = [`현재 TODO 파일: ${path}`, '진행 중 항목(미완료 작업만):']
  let any = false
  for (const s of doc.sections) {
    if (isDoneSection(s)) continue
    for (const it of s.items) {
      any = true
      const c = countItem(it)
      lines.push(`- ${it.title} (${c.open}/${c.total} 남음)`)
      for (const l of it.lines) if (l.kind === 'task' && !l.done) lines.push(`  - [ ] ${l.text}`)
    }
  }
  if (!any) lines.push('- (없음)')
  lines.push('사용자가 "N번 끝났어"처럼 말하면 이 파일의 해당 항목을 완료 처리하고, 완료한 항목은 "## 완료" 섹션으로 옮기며 제목 뒤에 (완료 YYYY-MM-DD)를 붙인다.')
  return lines.slice(0, 80).join('\n')
}

// ---- 트리 행 (tree 명령 모양) ----------------------------------------------

export type SectionNode = Extract<Node, { kind: 'section' }>
export type TreeRow =
  | { kind: 'row'; node: Node; prefix: string; hasChildren: boolean; isCollapsed: boolean }
  | { kind: 'spacer'; prefix: string }
export type TreeGroup = { section: SectionNode; rows: TreeRow[] }

/** 접기 상태의 키: 완료 표식을 뗀 항목 제목. 줄이 옮겨져도 유지된다. */
export const itemKey = (title: string): string => title.replace(DONE_SUFFIX, '').trim()

export function tree(doc: Doc, showDone: boolean, collapsed: readonly string[]): TreeGroup[] {
  const groups: TreeGroup[] = []
  const sections = flatten(doc, true).filter((n): n is SectionNode => n.kind === 'section')
  for (const section of sections) {
    const s = doc.sections[section.si]
    if (!s) continue
    const rows: TreeRow[] = []
    if (!(section.isDone && !showDone)) {
      s.items.forEach((it, ii) => {
        const isLast = ii === s.items.length - 1
        const children = it.lines.filter(l => l.kind === 'task' || l.kind === 'note')
        const isCollapsed = collapsed.includes(itemKey(it.title))
        const c = countItem(it)
        rows.push({
          kind: 'row',
          node: { kind: 'item', id: `${section.si}/${ii}`, si: section.si, ii, title: it.title, isDone: section.isDone, ...c },
          prefix: isLast ? '└── ' : '├── ',
          hasChildren: children.length > 0,
          isCollapsed,
        })
        if (!isCollapsed) {
          const stem = isLast ? '    ' : '│   '
          let seen = 0
          it.lines.forEach((l, li) => {
            if (l.kind !== 'task' && l.kind !== 'note') return
            seen += 1
            const branch = seen === children.length ? '└── ' : '├── '
            const node: Node =
              l.kind === 'task'
                ? { kind: 'task', id: `${section.si}/${ii}/${li}`, si: section.si, ii, li, text: l.text, done: l.done }
                : { kind: 'note', id: `${section.si}/${ii}/${li}`, si: section.si, ii, li, text: l.text }
            rows.push({ kind: 'row', node, prefix: stem + branch, hasChildren: false, isCollapsed: false })
          })
        }
        if (!isLast) rows.push({ kind: 'spacer', prefix: '│' })
      })
    }
    groups.push({ section, rows })
  }
  return groups
}

/** 터미널 셀 폭: 한글·CJK·이모지는 2칸. */
export function cells(s: string): number {
  let n = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    n += cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) ? 2 : 1
  }
  return n
}

export function cutCells(s: string, width: number): string {
  if (cells(s) <= width) return s
  let out = ''
  for (const ch of s) {
    if (cells(out + ch) > width - 1) break
    out += ch
  }
  return `${out}…`
}

/** 줄의 글만 바꾼다: 체크박스·들여쓰기·완료 표식은 그대로. */
export function editNode(doc: Doc, node: Node, text: string): OpResult {
  const d = cloneDoc(doc)
  const s = d.sections[node.si]
  if (!s) return MISSING
  if (node.kind === 'section') return { error: '섹션 제목은 파일에서 직접 고치세요.' }
  const it = s.items[node.ii]
  if (!it) return MISSING
  if (node.kind === 'item') {
    const suffix = DONE_SUFFIX.exec(it.title)?.[0]?.trim() ?? ''
    it.title = suffix === '' ? text : `${text} ${suffix}`
    it.heading = `### ${it.title}`
    return { doc: d }
  }
  const line = it.lines[node.li]
  if (!line) return MISSING
  if (line.kind === 'task') {
    const m = TASK.exec(line.raw)
    if (!m) return MISSING
    it.lines[node.li] = parseLine(`${m[1] ?? ''}- [${m[2] ?? ' '}] ${text}`)
    return { doc: d }
  }
  if (line.kind === 'note') {
    const m = NOTE.exec(line.raw)
    if (!m) return MISSING
    it.lines[node.li] = parseLine(`${m[1] ?? ''}- ${text}`)
    return { doc: d }
  }
  return MISSING
}

/** 편집창에 미리 채울 글. */
export function textOf(node: Node): string {
  if (node.kind === 'item') return itemKey(node.title)
  if (node.kind === 'section') return node.title
  return node.text
}
