declare module 'claude-code' {
  interface PluginState {
    'mods': {
      isHidden: boolean
      hiddenPlugins: string[]
    }
  }
}
