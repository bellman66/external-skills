# tree

A decision-tree interview for Claude Code, in a pane.

[English](README.md) · [한국어](README.ko.md)

![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-black)
![Requires 2.1.287+](https://img.shields.io/badge/requires-2.1.287%2B-blue)
![Terminal and Desktop](https://img.shields.io/badge/surface-terminal%20%7C%20desktop-lightgrey)
![89 tests](https://img.shields.io/badge/tests-89%20passing-brightgreen)

- [Why tree](#why-tree)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Using the pane](#using-the-pane)
- [The traffic light](#the-traffic-light)
- [Context and criteria](#context-and-criteria)
- [What it hands over](#what-it-hands-over)
- [What it costs](#what-it-costs)
- [Language](#language)
- [State](#state)
- [Development](#development)
- [Limits](#limits)
- [License](#license)

## Why tree

Before Claude writes anything, the two of you have to agree on what is being
built. That agreement is a tree of decisions, and most of it is not in your
prompt — it is in the branches neither of you has thought to raise yet.

Interviewing for it in chat costs three things:

- **A long opening.** You have to assemble the whole context before the first
  question lands.
- **Drift.** Extra context comes along for the ride; the context that matters
  arrives late.
- **Waiting.** Ask, answer, re-plan, ask again — one decision per round trip.

tree moves that interview into a pane. Questions arrive a **layer** at a time,
you answer them by pressing numbers, and the model is called once per layer
instead of once per question.

## How it works

A layer is the set of decisions whose prerequisites are all settled — every
question that can be asked right now. Decisions inside one layer never depend
on each other, so they can be laid out together and answered in any order.

```
/tree <one line about what to decide>
   │
   ├─ check agent → one model call ► layer 1
   │
   ▼
┌─────────────────────────────────────────────┐
│ ▸ ● storage                    → SQLite     │  pick with number keys
│ ▾ ● retention                               │  nothing is sent yet
│   ╭────────────────────────────────────╮    │
│   │ how long do we keep it?            │    │
│   │ why asked · lifecycle gap          │    │
│   │            ✓ 1: 90 days  ★pick     │    │
│   │              2: forever            │    │
│   ╰────────────────────────────────────╯    │
│ ▸ ● access                                  │
└─────────────────────────────────────────────┘
   │
   ├─ [ Next step ] ─ one model call ────────► layer 2
   │                   · answers settle
   │                   · unanswered ones are held, not lost
   │                   · contradicted decisions reopen
   │                   · decisions whose premise died are dropped
   ▼
  … until nothing is left to ask
   │
   └─ [ Hand to Claude and close ]─────────────────► a work order
```

The reply is a delta — the next layer plus the ids to reopen or strike out —
not a rewrite of the whole tree.

The tree stays as small as the job. A question is asked only when its answer
visibly changes the result **and** the implementer could not pick a sensible
default alone; how to build, verify, branch or store things is left to the
implementer. A simple ask often gets zero to three questions, or none at all —
then the request goes straight over. No layer is padded to a quota (at most
five), the model is told to wrap up from the third round, and the pane stops
asking after four rounds regardless.

## Getting started

```bash
git clone https://github.com/bellman66/external-skills
claude --plugin-dir ./external-skills/tree
```

Then, in the session:

```
/tree add a payments integration
```

The pane comes with the mod: it is up when a session starts or when tree is
turned on in `/plugin`, and gone when the mod is turned off. With no tree yet
the pane comes up bare with a field: type what to decide there and Enter
builds the first step.

A bare `/tree` (the command menu's tree does the same) only shows or hides the
pane: open, it closes; closed, it brings the tree back where it was. A pane put
away with `q`, its × or ctrl+x x stays away through that session's reloads;
`/tree` brings it back.

To keep it around, add the directory as a marketplace and install it as a
plugin, the same as any other Claude Code plugin.

## Using the pane

Questions are listed one title per line, and one of them is open. Press a
title to open it; the one before it folds. **The numbers beside the choices
are the keys** — press `1` to take the first choice, and the next question
still waiting opens by itself. After the last one nothing more opens; **Next
step** lights up instead, so a layer is answered as `1 · 2 · 1 · s`. The
recommendation is marked `★pick`, and what you picked turns a green `✓`.

The pane is drawn with the widgets Claude Code draws its own dialogs with —
a choice as `1: label`, an action as `[ label ]`, the traffic light and the
badges in the theme's status colors. Only the one button to press next is
highlighted, and a line at the bottom says which keys work **right now** —
only `c` while a call is out, Enter and Esc while a field is open, otherwise
Tab, Enter, Esc and the digits.

The pane wears a frame of its own, so it is told from the transcript beside it
at a glance. Its first row is a title band — ` TREE ` in a block of the accent,
`decision-tree interview` beside it, the language button `l: KO` and `q: ×close`
at the right edge — with a rule under it. Docked (144+ columns) the whole body
sits in a bold border in the accent; inline, the host already draws a border,
so only the band is drawn.

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  TREE  decision-tree interview            l: KO q: ×close ┃
┃ ────────────────────────────────────────────────────────── ┃
┃                                                            ┃
┃ ╭────────────────────────────────────────────────────────╮ ┃
┃ │ ●●○○ step 2                               1 of 3 picked │ ┃
┃ ╰────────────────────────────────────────────────────────╯ ┃
```

Each section sits in a rounded card, the way `/context` draws its own. A
card's title is set in the theme's blue, bold, behind a bar — `▍Questions (tree)` —
with a line of air under it to keep it off the content. The summary card on
top is two lines:

```
│ ●●○○ step 2                               1 of 3 picked │
│ ████▓▓░░░░░░░░░░░░▒▒                  █ 2  ▓ 1  ░ 4  ▒ 1 │
```

The first is the step — one dot per round, the ones taken filled — and how
many are picked. The second is a bar split by the traffic light's shares, each
zone in its own shade, `█ ▓ ░ ▒`, with a count per shade beside it. When the
pane is 36 rows or taller, a tree whose 35 leaves take the same shares stands
on the left — any shorter and it would push the first question below the fold,
so the two lines are all there is. A narrow pane drops it the same way.

| Key | Button | What it does |
| :- | :- | :- |
| `a` | expand all | Opens every question at once. Number keys turn off while it is on, since they would collide |
| `p` | pick all recommended | Fills every unanswered question with its recommendation. Leave it on and each new layer arrives pre-filled — then you only press next |
| `s` | **Next step** | Settles the layer and fetches the next one. The button is **highlighted** once nothing is left to pick; with picks missing its label says `1/3 · 2 held`, and sends anyway |
| `w` | Write in | Opens a field on the open question for an answer no choice covers |
| `f` | look in the code | Sends a research subagent at that one decision |
| `m` | **apply context** | Rebuilds the open layer on the request and the whole context, without moving on |
| `r` | **Hand to Claude and close** | Writes the work order and closes the pane |
| `l` | EN / 한국어 | Switches the language pack. Lives on the hint line at the bottom |
| `t` | Try again | Appears when a layer fails to arrive, the first one included |
| `c` | stop waiting | Appears while a call is out. A reply that lands after you stopped is thrown away |

Anything you leave unanswered is **held**, not lost — it is listed above the
questions with the earlier rounds' decisions, one row each: a picked one opens
with a green `Pass`, a held one with a dim `held`. Every row has `ask again`,
which puts that decision back on the open layer, and a held one is also named
in the handoff as something to ask about later.

What the model settled without asking — an implementation default, a fact
it could read off the code — is listed at the top of the questions card,
above the questions, one row each. There is no title: every row opens with a
green **`Pass`**, saying the model settled it on your behalf and moved on.
An `ask` button turns one into a question on the open layer, with a yellow dot — a direction already stands, so it is not an open red. A question the request never raised carries an `added` mark, and a
decision struck or held takes the questions that grew out of it along.

Under an open question's choices sits one line, `w Write in · f look in the
code`. `w` opens a field for an answer no choice covers, and what you write
stays on the card as a `✓ written · …` row, so you can see it was taken. `f`
sends a research subagent at that one decision — the title gets a
`researching` mark, and the findings come back in the conversation. Like the
digits, the two letters are live only one question at a time.

## The traffic light

| | Zone | Meaning |
| :-: | :- | :- |
| 🔴 | unknown | Not decided. Whether it is even needed is open |
| 🟡 | gray | The direction is set; a specific ambiguity remains |
| 🟢 | known | Settled |
| ⚫ | deferred | Held for later, or struck out. Neither blocks finishing |

## Context and criteria

The pane stacks three sections top to bottom: **Context / Questions / Desired
outcome**. Context and desired outcome behave like a todo list — press
**`[ + add ]`** right under the rows, the field opens in its place, Enter
makes it a row, `x` strikes it off. Both can be open at once.

**Context** opens with the request you gave `/tree` as its first row, and
below it holds the things no choice covers — a constraint, a premise,
something you would simply have said in a chat.

> We are locked into one payment provider.

**The request is checked first.** The way grill-me looks at the code before
it asks, the sentence after `/tree` goes as written to an agent with tools. It
reads the memos, docs, issues and code the request points at, and reports what
holds, what does not match, and what only you can answer. That report joins the
context as a `checked: the request` row, and the first layer stands on it. If
the check fails, no tree is guessed: the pane says why. A link you add to the
context yourself is read when the context is applied, as a `read: <link>` row.

Every row carries a `pending` or `applied` badge. While anything is pending,
**apply context** appears beside `[ + add ]`. Press it and the open layer is rebuilt on the
request and the whole context: questions that no longer apply are dropped,
decisions it contradicts reopen. Moving to the next step reads pending rows
too. Once a round has read a row it becomes a standing premise — still
binding, but it no longer keeps knocking the same answer over.

- Applied rows, the request included, **fold on their own** into one
  `▸ N applied` line on the heading's right. Press it to open, again to shut.
- The request and every row can be edited. An edit sends the row back to
  pending and out of the fold. The request cannot be removed.
- Removing an applied row leaves the tree as it is and brings
  **apply context** back.
- Context is locked while an apply is out. If it fails, the tree and the
  badges stay as they were and the button turns into **apply context again**.

**Desired outcome** is what the finished work has to satisfy. Writing one
narrows the questions toward it, and it reaches the handoff as a checklist.
Every row has `edit`, which rewrites it in place as a context row's does.

## What it hands over

Not a list of decisions. A work order the next session can start from without
asking anything again:

```markdown
# Work order

## What this is for
add a payments integration

## Premises — fixed by the user
- we are locked into one payment provider

## Settled decisions

### 1. Integration path → through the gateway
- asked: how should the provider be wired in?
- why it was asked: derived from the single-provider decision
- grounds for this choice: reuses the existing webhook and idempotency work

### 2. Retention → 30 days
- asked: how long do we keep it?
- the user wrote this answer instead of taking a listed choice

## What the result has to satisfy
- [ ] it must roll back without a deploy

## Left open — asked, then held
- Access control — who can see it?

## Struck out — its premise changed
- Currency handling for the old provider

## How to proceed
- The decisions above are already agreed with the user. Take them as given.
- Where a premise and a decision disagree, the premise wins.
- Do not decide the held items now — ask the user when you reach them.
- The struck-out items are out of scope. Do not revive them.
- When the work is done, go through the criteria one by one.
```

**Struck out** is the section that earns its place. Without it the next session
sees no mention of the old provider and helpfully suggests it again.

## What it costs

One model call per layer, not per question. A thirteen-decision interview is
three or four calls, and the reply is the next layer rather than the whole
tree — roughly a tenth of what the per-question shape spends.

The call rides on `$.model.fork`, so the conversation comes from the prompt
cache and only the compact tree snapshot is new. A fork needs the main thread
to have answered at least once, which `/tree` has not, so the first call falls
back to a completion carrying the recent messages itself.

One check agent runs ahead of the first layer, and costs as much time and
tokens as reading what the request points at takes.

Picking choices is free. Nothing is sent until you press next.

## Language

English and Korean, switched with `l` and remembered across sessions. The pack
covers the pane, the command description, failure reasons, **the language the
model writes its questions in**, and the handoff document.

Packs live in one object in `hooks/register.js`. Adding one is adding an entry.

## State

The tree lives in `$.state` — **one session**. `/clear`, `/resume` and
`/branch` reset it, and so does a new `/tree`: the last interview's tree,
context and criteria do not carry into the next one. The language preference lives in `$.store` and does
outlive the session.

## Development

```bash
claude plugin validate ./tree   # hooks and calls the mod makes
cd tree && claude plugin test   # 90 tests, no session or network needed
bun evals/depth.ts --runs 3     # real model: right depth, and only the user's own questions
```

The tests drive the pane the way a person would — press buttons by key, type
into fields, read what got drawn — and stub the model, so they cover layering,
cost behaviour, failure recovery and the handoff without spending a token.

What the model is told lives in one file, `prompts/tree.md`, not in the code.
It says what the tree is, how it grows and what to do once a tree already
stands; every call — the first layer, the next one, a layer rebuilt after the
context changed — sends it alike. Under it the state is stacked as `## `
sections — request, tree, progress, desired outcome,
context, language. A section with nothing in it is left out; how to read each
one is written in `tree.md`. To change what the
interview asks, edit the `.md` and run the eval; the tests only check which
files are stacked in what order.

`tsconfig.json` extends a type declaration Claude Code writes into
`.claude-plugin/types/` when the mod is loaded with `--plugin-dir`. That
directory is generated, so it is not committed; load the mod once and `tsc`
will work.

## Limits

- Panes are drawn in the terminal and the Desktop app. The VS Code extension,
  `claude -p` and cloud sessions run the hooks but show nothing — use the
  `grill-me` skill there instead.
- The tree does not survive `/clear`. Hand it over before you clear.
- Written with Claude Code 2.1.296.

## License

Not decided yet. Until a license file is added, all rights are reserved by the
author.
