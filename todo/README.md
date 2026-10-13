# todo

A live tree pane for TODO.md inside Claude Code: check, add, edit and delete in place, written straight back to the file.

[English](README.md) · [한국어](README.ko.md)

![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-black)
![Requires 2.1.296+](https://img.shields.io/badge/requires-2.1.296%2B-blue)
![Terminal and Desktop](https://img.shields.io/badge/surface-terminal%20%7C%20desktop-lightgrey)
![14 tests](https://img.shields.io/badge/tests-14%20passing-brightgreen)

## What it does

- Draws a markdown TODO file (`## section → ### item → - [ ] task`) as a `tree`-style pane.
- `✓ + ✎ ×` at the end of each row completes, adds, edits or deletes; on the selected row the buttons drop to a line of their own (`x: ✓완료  a: +하위  e: ✎수정  d: ×삭제`) so they stay visible in a narrow pane. The entry box puts `×취소  ✓저장` on a line above the field, and text wider than the field is shown whole, wrapped, under it. `Esc` drops an open field or an armed delete. A first delete press lights only that button as `×진짜 삭제`; a second press deletes. Every change is written to the file at once. Untouched lines are preserved byte for byte.
- Completing an item (###) moves it to the end of the `## 완료` (done) section with `(완료 YYYY-MM-DD)` appended; `↩` brings it back.
- Polls the file every 2 s, so outside edits show up. When a pane write collides with an outside edit, the file wins.
- At session start, the open items are appended to the system prompt so "item 2 is done" works without reading the file.

## The panel frame

The pane wears a frame of its own, so it is told from the transcript beside it at a
glance. Its first row is a title band — ` TODO ` in a block of the accent, what the
panel is for beside it, `n/m 완료` and `q: ×닫기` at the right edge — with a rule under
it. Docked (144+ columns) the whole body sits in a bold border in the accent; inline,
the host already draws a border, so only the band is drawn. The dim rounded boxes
inside are the sections.

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  TODO  할 일 목록             0/6 완료 q: ×닫기 ┃
┃ ────────────────────────────────────────────── ┃
┃                                                ┃
┃ ╭────────────────────────────────────────────╮ ┃
┃ │ ░░░░░░░░░░░░░░░  남은 작업 6                │ ┃
┃ │ ~/workspace/memos/TODO.md          p: 경로 │ ┃
┃ ╰────────────────────────────────────────────╯ ┃
┃ ╭────────────────────────────────────────────╮ ┃
┃ │ § 진행 중                      6/6 남음  + │ ┃
┃ │ ├── ▾ 3. 민감정보 Enum 분리   1/1  ✓ + ✎ × │ ┃
┃ ╰────────────────────────────────────────────╯ ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

## Getting started

```
git clone https://github.com/bellman66/external-skills
claude --plugin-dir ./external-skills/todo
```

The pane opens by itself at 144+ columns; `/todo` opens it on a narrower terminal.
`/todo` toggles the pane (`/todo on` / `/todo off` to be explicit). Close it with `/todo` or `ctrl+x x` and it stays closed in later sessions until you open it again.
Default file: `~/workspace/memos/TODO.md`. Change it with `p` in the header; the choice persists across sessions.

## Keys

| Key | Action |
| --- | --- |
| `ctrl+x tab` | focus the pane |
| header `×닫기` / `q` / `/todo` | Close the pane (stays closed next session) |
| `Tab` / `Shift+Tab` / click | select a row — one row per Tab, the row-end buttons are skipped |
| `Enter` | toggle a checkbox; fold/unfold an item; show/hide the done section |
| `✓` / `x` | complete an item, check a task, `↩` reopen |
| `+` / `a` | add a task below (`+` / `n` on a section line adds an item) |
| `✎` / `e` | edit the text |
| `×` / `d` | delete, pressed twice |
| done section `×비우기` / `d` | empty the done section, pressed twice |
| `f` `c` `r` `p` | fold all · show done · reload · change path |
| `Esc` | drop the open field or an armed delete/clear |

No errors are shown: an outside edit still lets a press land on its line (found again by its text), a line that is gone just reloads quietly, and a missing file shows `+ 첫 항목 추가` (`n`), whose first add creates it. After add, edit or delete the cursor and focus stay on the new line (the line above, for delete).

## Development

```
claude plugin validate todo
claude plugin test todo
```

## License

MIT
