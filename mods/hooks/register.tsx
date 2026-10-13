import { atom, read, update } from 'claude-code'
import type { CommandInfo, EngineInterface, Register } from 'claude-code'

const SELF = 'mods'
const MAX_HOTKEYS = 9
// 패널 프레임과 제목 블록의 색. tree·todo 창과 같은 강조색이라 세 mod 가 한 벌로 보인다.
const PANEL_COLOR = 'claude'
// 피카츄(9칸)가 걸어 다니려면 적어도 이만큼은 비어 있어야 한다
const PIKACHU_MIN = 13
/** 띠에 올리지 않는 mod. `/mods hide <mod>` 로 더하고 `/mods show <mod>` 로 뺀다. */
const DEFAULT_HIDDEN_PLUGINS = ['cc-plugin-diff']

const hiddenAtom = atom({ plugin: 'mods', key: 'isHidden' } as const, false)
const hiddenPluginsAtom = atom({ plugin: 'mods', key: 'hiddenPlugins' } as const, DEFAULT_HIDDEN_PLUGINS)

type Engine = EngineInterface

type ModGroup = { plugin: string; commands: CommandInfo[] }

/**
 * 띠에 올릴 명령: mod 가 `$.command.register` 로 등록한 것만. 마켓플레이스
 * 플러그인의 스킬·명령은 `figma:figma-use` 처럼 플러그인 이름이 콜론으로
 * 앞에 붙으므로 뺀다. 자기 /mods 도 뺀다. mod 별로 묶어 등록 순서대로 돌려준다.
 */
async function modGroups($: Engine): Promise<ModGroup[]> {
  const all = await $.command.list()
  const hidden = await read($, hiddenPluginsAtom)
  const groups: ModGroup[] = []
  for (const c of all) {
    if (c.source !== 'plugin' || c.name === SELF || c.name.includes(':')) continue
    const plugin = c.plugin ?? c.name
    if (hidden.includes(plugin)) continue
    const group = groups.find(g => g.plugin === plugin)
    if (group) group.commands.push(c)
    else groups.push({ plugin, commands: [c] })
  }
  return groups
}

/** 상자 하나의 가로 칸: 테두리 2 + 안쪽 여백 2 + 가장 긴 줄 (`1: todo /todo`). */
function boxCells(group: ModGroup, firstHotkey: number): number {
  let widest = 0
  group.commands.forEach((c, i) => {
    const hk = firstHotkey + i < MAX_HOTKEYS ? 3 : 0
    const name = i === 0 ? group.plugin.length + 1 : 0
    widest = Math.max(widest, hk + name + c.name.length + 1)
  })
  return widest + 4
}

async function setHiddenPlugins($: Engine, list: string[]): Promise<void> {
  await $.store.set('hiddenPlugins', list)
  await update($, hiddenPluginsAtom, () => list)
}

async function runCommand($: Engine, name: string): Promise<void> {
  try {
    const result = await $.command.run({ command: name, args: '' })
    if (result.text !== undefined && result.text.trim() !== '') $.ui.toast(`/${name}: ${result.text.trim()}`)
  } catch (error) {
    $.ui.toast(`/${name}: ${String(error instanceof Error ? error.message : error)}`)
  }
}

async function setHidden($: Engine, isHidden: boolean): Promise<void> {
  await $.store.set('hidden', isHidden)
  await update($, hiddenAtom, () => isHidden)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('hidden')
    await update($, hiddenAtom, () => stored === true)
    const plugins = await $.store.get('hiddenPlugins')
    await update($, hiddenPluginsAtom, () => (Array.isArray(plugins) ? plugins.filter(p => typeof p === 'string') : DEFAULT_HIDDEN_PLUGINS))
    await $.command.register({ name: SELF, description: 'mod 명령 띠를 켜고 끕니다 (on / off). 끈 상태는 다음 세션에도 유지됩니다' })
    return next(e)
  })

  // /mods 는 토글, /mods on · /mods off 는 명시, /mods hide <mod> · /mods show <mod> 는 mod 하나를 띠에서 빼고 넣기
  on('command.run', { command: SELF }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const [verb, target] = arg.split(/\s+/, 2)
    if ((verb === 'hide' || verb === 'show') && target !== undefined && target !== '') {
      const current = await read($, hiddenPluginsAtom)
      const next = verb === 'hide' ? [...current.filter(p => p !== target), target] : current.filter(p => p !== target)
      await setHiddenPlugins($, next)
      return { text: verb === 'hide' ? `${target} 을(를) 띠에서 뺐습니다. /mods show ${target} 로 되돌립니다.` : `${target} 을(를) 띠에 다시 올립니다.` }
    }
    const isHidden = await read($, hiddenAtom)
    const hide = arg === 'on' ? false : arg === 'off' ? true : !isHidden
    await setHidden($, hide)
    return { text: hide ? 'mod 띠를 숨겼습니다. /mods 로 다시 보입니다.' : 'mod 띠를 보입니다. 비운 프롬프트에서 숫자, 또는 ctrl+x tab 뒤 숫자로 누릅니다.' }
  })

  // 다른 mod 가 명령을 등록하면 띠를 다시 그린다 (뒤에 로드되는 mod 도 잡힌다)
  on('command.register', async ($, e, next) => {
    const result = await next(e)
    $.ui.invalidate('ui.render')
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenAtom))) return next(e)
    const groups = await modGroups($)
    if (groups.length === 0) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    // 서피스 모듈은 terminal·desktop 만 그린다
    const Client = 'Client' in els ? els.Client : undefined
    const dim = e.props.isWorking
    // 패널 프레임: 띠 전체를 강조색의 굵은 테두리(2칸)와 여백(2칸)으로 두르고, 첫 칸에
    // ` MODS ` 제목 블록을 세운다. 상자들은 그 오른쪽에 남은 폭 안에서 늘어선다.
    const title = ' MODS '
    const room = Math.max(20, e.props.bodyColumns - 4 - title.length - 1)

    // mod 마다 둥근 상자 하나: 첫 줄은 mod 이름, 그 아래 줄마다 명령 버튼.
    // 띠 폭에 들어가는 상자까지만 그리고 나머지는 `+N` 으로 센다.
    const boxes: JSX.Element[] = []
    let used = 0
    let hotkeyNo = 0
    let cut = 0
    // 그린 상자 중 가장 높은 것의 줄 수: 피카츄 영역의 높이
    let rows = 3
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i]!
      const width = boxCells(g, hotkeyNo)
      const need = width + (i > 0 ? 1 : 0)
      const reserve = i < groups.length - 1 ? 4 : 0
      // 첫 상자는 띠가 아무리 좁아도 그린다
      if (cut > 0 || (i > 0 && used + need > room - reserve)) {
        cut += 1
        continue
      }
      used += need
      rows = Math.max(rows, g.commands.length + 2)
      // 줄 하나가 통째로 버튼이라 상자 안 어디를 눌러도 실행된다.
      // 첫 줄은 `1: todo /todo`, 같은 mod 의 다음 명령은 `2: /todo-x`
      const buttons = g.commands.map((c, j) => {
        const hotkey = hotkeyNo < MAX_HOTKEYS ? String(hotkeyNo + 1) : undefined
        hotkeyNo += 1
        return (
          <Button key={`cmd:${c.name}`} plain dimColor={dim} hotkey={hotkey} onPress={() => void runCommand($, c.name)}>
            {j === 0 ? `${g.plugin} ` : ''}
            <Text dimColor>{`/${c.name}`}</Text>
          </Button>
        )
      })
      boxes.push(
        <Box flexDirection="column" borderStyle="round" borderDimColor={dim} borderColor={dim ? undefined : 'suggestion'} paddingX={1}>
          {buttons}
        </Box>,
      )
    }

    // 상자들 오른쪽에 남는 자리에서 피카츄가 걸어 다닌다. 서피스 모듈(Client)이라 자기
    // 타이머로 자기 영역만 다시 그린다. 상자가 잘려 `+N` 이 서거나 자리가 좁으면 안 그린다.
    // 영역 폭은 남는 자리로 못 박는다: 폭이 내용을 따라 자라면 벽에 닿은 피카츄가 상자를 민다.
    const free = room - used - 1
    const pikachu = cut === 0 && free >= PIKACHU_MIN && Client !== undefined && (
      <Client key="pikachu" module="./pikachu.tsx" props={{ dim, columns: free }} width={free} height={rows} />
    )

    return (
      <Box flexDirection="row" columnGap={1} alignItems="center" borderStyle="bold" borderColor={dim ? undefined : PANEL_COLOR} borderDimColor={dim} paddingX={1}>
        <Text inverse bold dimColor={dim} color={PANEL_COLOR}>{title}</Text>
        {boxes}
        {cut > 0 && <Text dimColor>{`+${cut}`}</Text>}
        {pikachu}
      </Box>
    )
  })
}
