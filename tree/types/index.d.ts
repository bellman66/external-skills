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
    /** the node this decision grew out of; its fate is this one's too */
    parent?: string
    /** a decision the model added that the request never raised */
    isExpansion?: boolean
    /** settled by the model without asking, `tag` holding the grounds */
    assumed?: boolean
  }

  /** What the finished work has to satisfy. The user writes these. */
  interface TreeFeed {
    id: string
    text: string
  }

  /** Something the user wants the interview to know, that isn't an answer */
  interface TreeContextItem {
    id: string
    text: string
    /** a round has folded it into the tree; editing it puts it back to pending */
    applied: boolean
    /** the link this row was read off, when an agent fetched it */
    ref?: string
    /** what the link said, laid under the row in the prompt and the handoff */
    body?: string
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
    /** the request the tree grew out of has been read by a round */
    seedApplied: boolean
    /** an applied context item was removed since the last round */
    stale: boolean
    /** the applied context rows sit folded under one line */
    folded: boolean
    /** the context row being edited: an item id, or 'seed' for the request */
    editing: string | null
    /** the last apply came back without a tree */
    applyFailed: boolean
    /** the notice on screen is a failure, drawn in the error color */
    alert: boolean
    /** the decision whose write-in field is open, or null */
    writing: string | null
    /** the decisions a research agent has been sent at */
    probing: string[]
    /** the person put the pane away; it stays away through reloads until a bare /tree */
    hidden: boolean
  }

  interface PluginState {
    tree: {
      nodes: TreeNode[]
      feeding: TreeFeed[]
      /** free-form context the user adds alongside the answers */
      context: TreeContextItem[]
      view: TreeView
      /** answers picked but not yet submitted, by node id */
      draft: Record<string, string>
      seed: string
    }
  }
}
