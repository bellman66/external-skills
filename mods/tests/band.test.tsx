import { expect, mock, test } from 'claude-code/testing'

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

const COMMANDS = [
  { name: 'help', description: 'built in', source: 'builtin' },
  { name: 'todo', description: 'TODO pane', source: 'plugin', plugin: 'todo' },
  { name: 'tree', description: 'tree pane', source: 'plugin', plugin: 'tree' },
  { name: 'mods', description: 'this band', source: 'plugin', plugin: 'mods' },
  // a marketplace plugin's skill: namespaced, not a mod's registration
  { name: 'figma:figma-use', description: 'skill', source: 'plugin', plugin: 'figma' },
  { name: 'commit', description: 'user skill', source: 'user' },
  { name: 'diff', description: 'hidden by default', source: 'plugin', plugin: 'cc-plugin-diff' },
] as const

function serve(on: any, ran: string[], toasts: string[] = []) {
  mock.store(on)
  // what the engine draws where the band passes
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', ($: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: COMMANDS }))
  on('command.run', ($: unknown, e: { command: string }) => {
    ran.push(e.command)
    return { text: `${e.command} ran` }
  })
  on('ui.toast', ($: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
}

test('the band lists every mod command as a numbered button, and a press runs that command', async ($, on) => {
  const ran: string[] = []
  const toasts: string[] = []
  serve(on, ran, toasts)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'mods', surface, component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
    expect(await ui.find({ key: 'cmd:todo' })).toBeDefined()
    expect(await ui.find({ key: 'cmd:tree' })).toBeDefined()
    // built-ins and the band's own command stay off the band
    expect(await ui.find({ key: 'cmd:help' })).toBeUndefined()
    expect(await ui.find({ key: 'cmd:mods' })).toBeUndefined()
    expect(await ui.find({ key: 'cmd:figma:figma-use' })).toBeUndefined()
    expect(await ui.find({ key: 'cmd:commit' })).toBeUndefined()
    expect(await ui.find({ key: 'cmd:diff' })).toBeUndefined()
    // the whole line is the button: the mod's name and its command
    expect(await ui.find({ key: 'cmd:todo', text: /todo.*\/todo/ })).toBeDefined()

    await ui.press({ key: 'cmd:todo' })
    expect(ran[ran.length - 1]).toBe('todo')
    expect(toasts[toasts.length - 1]).toContain('todo ran')
    await ui.unmount()
  }
})

test('the band yields to a survey, and /mods hides it across a restart until /mods on', async ($, on) => {
  const ran: string[] = []
  serve(on, ran)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  let ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, hasSurvey: true }, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:todo' })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'mods', args: '' })
  ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:todo' })).toBeUndefined()
  await ui.unmount()

  // the choice survives a session start
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:todo' })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'mods', args: 'on' })
  ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:todo' })).toBeDefined()
  await ui.unmount()
})

test('the band wears the panel frame: a bold border in the accent and a title block, both dimmed while working', async ($, on) => {
  serve(on, [], [])
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  const idle = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  const frame = (await idle.find({ type: 'Box' })) as { props?: { borderStyle?: string; borderColor?: string; borderDimColor?: boolean } }
  expect(frame.props?.borderStyle).toBe('bold')
  expect(frame.props?.borderColor).toBe('claude')
  expect(frame.props?.borderDimColor).toBe(false)
  expect(await idle.find({ type: 'Text', text: ' MODS ' })).toMatchObject({ props: { inverse: true, color: 'claude', dimColor: false } })
  await idle.unmount()

  const busy = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, isWorking: true }, requestId: 'band' })
  const dimFrame = (await busy.find({ type: 'Box' })) as { props?: { borderDimColor?: boolean } }
  expect(dimFrame.props?.borderDimColor).toBe(true)
  expect(await busy.find({ type: 'Text', text: ' MODS ' })).toMatchObject({ props: { dimColor: true } })
  await busy.unmount()
})

test('a pikachu walks the free room right of the boxes, and stays away when there is none', async ($, on) => {
  serve(on, [], [])
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  for (const surface of ['terminal', 'desktop'] as const) {
    const wide = await $.ui.mount({ plugin: 'mods', surface, component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
    // 영역 폭은 남는 자리로 못 박히고, 모듈에도 같은 수가 벽으로 전해진다
    const found = (await wide.find({ type: 'Client', key: 'pikachu' })) as { props?: { width?: number; flexGrow?: number; props?: { columns?: number } } }
    expect(found).toMatchObject({ props: { module: 'hooks/pikachu.tsx', props: { dim: false }, height: 3 } })
    expect(found.props?.width).toBeGreaterThanOrEqual(13)
    expect(found.props?.props?.columns).toBe(found.props?.width)
    expect(found.props?.flexGrow).toBeUndefined()
    await wide.unmount()
  }

  // 작업 중이면 흐리게
  const busy = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, isWorking: true }, requestId: 'band' })
  expect(await busy.find({ type: 'Client', key: 'pikachu' })).toMatchObject({ props: { props: { dim: true } } })
  await busy.unmount()

  // 상자 둘이 꽉 찬 띠에는 자리가 없다
  const tight = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 46 }, requestId: 'band' })
  expect(await tight.find({ key: 'cmd:tree' })).toBeDefined()
  expect(await tight.find({ type: 'Client', key: 'pikachu' })).toBeUndefined()
  await tight.unmount()
})

test('a narrow band keeps the first buttons and counts the rest', async ($, on) => {
  const ran: string[] = []
  serve(on, ran)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  const ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 20 }, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:todo' })).toBeDefined()
  expect(await ui.find({ key: 'cmd:tree' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\+1/ })).toBeDefined()
  await ui.unmount()
})

test('/mods hide takes one mod off the band and /mods show puts it back, across a restart', async ($, on) => {
  const ran: string[] = []
  serve(on, ran)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  await $.command.run({ command: 'mods', args: 'hide tree' })
  let ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:todo' })).toBeDefined()
  expect(await ui.find({ key: 'cmd:tree' })).toBeUndefined()
  await ui.unmount()

  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:tree' })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'mods', args: 'show tree' })
  await $.command.run({ command: 'mods', args: 'show cc-plugin-diff' })
  ui = await $.ui.mount({ plugin: 'mods', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band' })
  expect(await ui.find({ key: 'cmd:tree' })).toBeDefined()
  expect(await ui.find({ key: 'cmd:diff' })).toBeDefined()
  await ui.unmount()
})
