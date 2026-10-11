# tree

A decision-tree interview for Claude Code, in a pane.

[English](README.md) · [한국어](README.ko.md)

![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-black)
![Requires 2.1.287+](https://img.shields.io/badge/requires-2.1.287%2B-blue)
![Terminal and Desktop](https://img.shields.io/badge/surface-terminal%20%7C%20desktop-lightgrey)
![44 tests](https://img.shields.io/badge/tests-44%20passing-brightgreen)

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
   ├─ one model call ─────────────► layer 1
   │
   ▼
┌─────────────────────────────────────────────┐
│ ▸ ● storage                    → SQLite     │  pick with number keys
│ ▾ ● retention                               │  nothing is sent yet
│   ╭────────────────────────────────────╮    │
│   │ how long do we keep it?            │    │
│   │ why asked · lifecycle gap          │    │
│   │              ✓ 90 days   ★pick     │    │
│   │              2 forever             │    │
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
   └─ [ Hand to Claude ] ──────────────────► a work order
```

The reply is a delta — the next layer plus the ids to reopen or strike out —
not a rewrite of the whole tree.

## Getting started

```bash
git clone https://github.com/bellman66/external-skills
claude --plugin-dir ./external-skills/tree
```

Then, in the session:

```
/tree add a payments integration
```

Leave the argument off and it takes your last prompt as the seed.

To keep it around, add the directory as a marketplace and install it as a
plugin, the same as any other Claude Code plugin.

## Using the pane

Questions are listed one title per line, and one of them is open. Press a
title to open it; the one before it folds. **The numbers beside the choices
are the keys** — press `1` to take the first choice. The recommendation is
marked `★pick`, and what you picked turns a green `✓`.

| Key | Button | What it does |
| :- | :- | :- |
| `a` | expand all | Opens every question at once. Number keys turn off while it is on, since they would collide |
| `p` | pick all recommended | Fills every unanswered question with its recommendation. Leave it on and each new layer arrives pre-filled — then you only press next |
| `s` | **Next step** | Settles the layer and fetches the next one. The frame goes **bold** when nothing is left to pick |
| `m` | **apply notes** | Rebuilds the open layer around a note you just added, without moving on |
| `r` | **Hand to Claude** | Writes the work order and closes the pane |
| `l` | EN / 한국어 | Switches the language pack |
| `t` | Try again | Appears when a layer fails to arrive |
| `c` | stop waiting | Appears while a call is out |

Anything you leave unanswered is **held**, not lost — it closes grey and is
named in the handoff as something to ask about later.

Every question also carries a write-in field for an answer no choice covers,
and a **Look for the answer in the code** button that sends a subagent at that
one decision.

## The traffic light

| | Zone | Meaning |
| :-: | :- | :- |
| 🔴 | unknown | Not decided. Whether it is even needed is open |
| 🟡 | gray | The direction is set; a specific ambiguity remains |
| 🟢 | known | Settled |
| ⚫ | deferred | Held for later, or struck out. Neither blocks finishing |

## Context and criteria

Two lists sit under the questions. Both behave like a todo list — press
**`[ + add ]`**, the field drops in, Enter makes it a row, `x` strikes it off.
Both can be open at once.

**Extended context** is for the thing no choice covers — a constraint, a
premise, something you would simply have said in a chat.

> We are locked into one payment provider.

A note the open layer has not read yet is marked with a yellow `+`, and
**apply notes** appears. Press it and the layer is rebuilt on that premise:
questions that no longer apply are dropped, decisions it contradicts reopen.
Once a round has read it, the note becomes a standing premise — still binding,
but it no longer keeps knocking the same answer over.

**Desired outcome** is what the finished work has to satisfy. Writing one
narrows the questions toward it, and it reaches the handoff as a checklist.

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

Picking choices is free. Nothing is sent until you press next.

## Language

English and Korean, switched with `l` and remembered across sessions. The pack
covers the pane, the command description, failure reasons, **the language the
model writes its questions in**, and the handoff document.

Packs live in one object in `hooks/register.js`. Adding one is adding an entry.

## State

The tree lives in `$.state` — **one session**. `/clear`, `/resume` and
`/branch` reset it. The language preference lives in `$.store` and does
outlive the session.

## Development

```bash
claude plugin validate ./tree   # hooks and calls the mod makes
cd tree && claude plugin test   # 44 tests, no session or network needed
```

The tests drive the pane the way a person would — press buttons by key, type
into fields, read what got drawn — and stub the model, so they cover layering,
cost behaviour, failure recovery and the handoff without spending a token.

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
