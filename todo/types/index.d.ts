export type TodoMode = 'view' | 'add-task' | 'add-item' | 'edit' | 'path'

declare module 'claude-code' {
  interface PluginState {
    'todo': {
      text: string | null
      error: string | null
      path: string
      cursor: string | null
      mode: TodoMode
      pendingDelete: string | null
      showDone: boolean
      collapsed: string[]
      draft: string
    }
  }
}
