# mods

A control band right above the prompt that lists every loaded mod's slash command as a button. One button, one command.

[English](README.md) · [한국어](README.ko.md)

![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-black)
![Requires 2.1.296+](https://img.shields.io/badge/requires-2.1.296%2B-blue)
![Terminal and Desktop](https://img.shields.io/badge/surface-terminal%20%7C%20desktop-lightgrey)
![6 tests](https://img.shields.io/badge/tests-6%20passing-brightgreen)

## What it does

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ [-]
┃        ╭───────────────╮ ╭───────────────╮    /\  /\  ┃
┃  MODS  │ 1: todo /todo │ │ 2: tree /tree │  ~( o.o )  ┃
┃        ╰───────────────╯ ╰───────────────╯    (___)   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
❯ _
```

- Lists only the slash commands mods registered through `$.command.register`. Marketplace plugin skills (`figma:…`, `atlassian:…`), built-ins and `/mods` itself stay off. A mod that registers later redraws the band.
- A pikachu walks the free room right of the boxes (one cell every 0.4 s, turning at the ends). It is a `Client` surface module of the host, so it redraws only its own region, and it stays away when fewer than 13 cells are free. It dims with the rest while Claude is working.
- The whole band wears the same panel frame as the tree and todo panes: a bold border in the accent and a ` MODS ` title block in its first cell, so it is told from the transcript at a glance.
- One rounded box per mod. Each line is one button end to end, so a press anywhere inside the box runs it. The first line reads `1: todo /todo`; a mod's further commands follow as `2: /todo-x`.
- `/mods hide <mod>` takes one mod off the band and `/mods show <mod>` brings it back, across sessions. `cc-plugin-diff` starts hidden.
- A press runs that command with empty arguments and shows the line it returned as a toast. Opening and closing panes is left to each mod's own toggle (`/todo` and the like).
- The first nine buttons get hotkeys `1`–`9`. On a narrow band only the boxes that fit are drawn; the rest is counted as `+N`.
- While Claude is working the boxes and buttons are dimmed. A press still runs; the host decides when.
- Yields while a survey holds the band, and draws nothing when no mod command is there to show.

## Using it

| Action | Meaning |
| --- | --- |
| a digit in an empty prompt | runs that numbered command (the host's survey convention) |
| `ctrl+x tab` then a digit / click | focus the band and press |
| `ctrl+x ctrl+a` / `[-]` | the engine's collapse; the band stays, its content folds |
| `/mods` | hide / show the band; `/mods on` and `/mods off` are explicit |
| `/mods hide <mod>` / `/mods show <mod>` | take one mod off the band / bring it back |

A band hidden with `/mods` stays hidden in later sessions.

## Getting started

```
git clone https://github.com/bellman66/external-skills
claude --plugin-dir ./external-skills/mods
```

## Development

```
claude plugin validate mods
claude plugin test mods
```

## Limits

- The host has no API to list plugins, enable or disable one, or open another plugin's pane. "Active mods" therefore means mods that registered a slash command; a mod with only a status line or hooks is not on the band.
- Commands always run with empty arguments; a command that needs them handles that itself (`/tree` seeds from the last user message).
- The band is drawn on the terminal and desktop surfaces only.

## License

MIT
