declare module 'claude-code' {
  /** One choice offered on a node. */
  interface TreeOption {
    id: string
    label: string
    detail: string
    /** the recommendation, marked with a star rather than in the label text */
    isPick: boolean
  }

  /** One decision in the tree. */
  interface TreeNode {
    id: string
    /** which round this decision became askable in */
    layer: number
    title: string
    /** red / yellow / green / grey on the pane's traffic light */
    zone: 'unknown' | 'gray' | 'known' | 'deferred'
    /** why this node is in the tree at all, e.g. "구독.삭제·해지 칸 비었음" */
    tag: string
    question: string
    options: TreeOption[]
    /** set once the node is settled */
    answer: string
    /** struck off because the premise it belonged to changed */
    dropped?: boolean
  }

  /** What the finished work has to satisfy. The user writes these. */
  interface TreeFeed {
    id: string
    text: string
  }

  /** Something the user wants the interview to know, that isn't an answer */
  interface TreeNote {
    id: string
    text: string
    /** the layer it was written in; once a round has read it, it is a premise */
    layer: number
  }

  interface TreeView {
    /** the layer being answered right now */
    layer: number
    busy: boolean
    notice: string
    /** true once a round came back with no further decisions */
    isComplete: boolean
    /** one decision open at a time, or every one of them */
    expanded: 'one' | 'all'
    /** the decision open in 'one' mode */
    focusId: string | null
    /** fill each new layer with its recommendations as it opens */
    auto: boolean
    /** which language pack the pane and the prompts use */
    lang: 'ko' | 'en'
    /** which lists have their field open — any number of them at once */
    adding: string[]
  }

  interface PluginState {
    tree: {
      nodes: TreeNode[]
      feeding: TreeFeed[]
      /** free-form context the user adds alongside the answers */
      notes: TreeNote[]
      view: TreeView
      /** answers picked but not yet submitted, by node id */
      draft: Record<string, string>
      seed: string
    }
  }
}
