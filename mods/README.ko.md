# mods

로드된 mod 의 슬래시 명령을 프롬프트 바로 위 띠에 버튼으로 늘어놓는 mod. 버튼 하나가 명령 하나다.

[English](README.md) · [한국어](README.ko.md)

![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-black)
![Requires 2.1.296+](https://img.shields.io/badge/requires-2.1.296%2B-blue)
![Terminal and Desktop](https://img.shields.io/badge/surface-terminal%20%7C%20desktop-lightgrey)
![6 tests](https://img.shields.io/badge/tests-6%20passing-brightgreen)

## 무엇을 하나

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ [-]
┃        ╭───────────────╮ ╭───────────────╮    /\  /\  ┃
┃  MODS  │ 1: todo /todo │ │ 2: tree /tree │  ~( o.o )  ┃
┃        ╰───────────────╯ ╰───────────────╯    (___)   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
❯ _
```

- mod 가 `$.command.register` 로 등록한 슬래시 명령만 올린다. 마켓플레이스 플러그인의 스킬(`figma:…`, `atlassian:…`)과 내장 명령, `/mods` 자신은 뺀다. mod 가 뒤늦게 명령을 등록하면 띠를 다시 그린다.
- 띠 전체는 tree·todo 창과 같은 패널 프레임을 두른다: 강조색의 굵은 테두리와 첫 칸의 ` MODS ` 제목 블록. 옆의 대화·프롬프트와 한눈에 구분된다.
- 상자들 오른쪽에 남는 자리에서 피카츄가 걸어 다닌다(0.4초에 한 칸, 끝에 닿으면 돌아선다). 호스트의 `Client` 서피스 모듈이라 자기 영역만 다시 그리고, 띠가 좁아 자리가 13칸 미만이면 안 나온다. Claude 가 작업 중이면 함께 흐려진다.
- mod 마다 둥근 상자 하나. 줄 하나가 통째로 버튼이라 상자 안 어디를 눌러도 실행된다. 첫 줄은 `1: todo /todo`, 같은 mod 의 다음 명령은 `2: /todo-x` 로 이어진다.
- `/mods hide <mod>` 로 mod 하나를 띠에서 빼고 `/mods show <mod>` 로 되돌린다. 다음 세션에도 유지된다. 처음에는 `cc-plugin-diff` 가 빠져 있다.
- 버튼을 누르면 그 명령을 빈 인자로 실행하고, 명령이 돌려준 한 줄을 toast 로 보여 준다. 창을 열고 닫는 것은 각 mod 의 토글(`/todo` 등)이 한다.
- 앞에서 아홉 개까지 `1`~`9` 단축키가 붙는다. 띠가 좁으면 들어가는 상자까지만 그리고 나머지는 `+N` 으로 센다.
- Claude 가 작업 중이면 상자와 버튼을 흐리게 그린다. 눌러도 되고, 실행 시점은 호스트가 정한다.
- 설문(survey)이 띠를 쓰는 동안은 양보한다. 보일 mod 명령이 없으면 띠를 그리지 않는다.

## 쓰는 법

| 조작 | 뜻 |
| --- | --- |
| 빈 프롬프트에서 숫자 | 그 번호의 명령 실행 (호스트의 설문 규약과 같다) |
| `ctrl+x tab` 뒤 숫자 / 클릭 | 띠에 포커스를 주고 누르기 |
| `ctrl+x ctrl+a` / `[-]` | 엔진의 접기. 띠는 남고 내용만 접힌다 |
| `/mods` | 띠 숨기기/보이기 토글. `/mods on` · `/mods off` 로 명시해도 된다 |
| `/mods hide <mod>` / `/mods show <mod>` | mod 하나를 띠에서 빼기 / 되돌리기 |

`/mods` 로 숨긴 상태는 다음 세션에도 유지된다.

## 시작하기

```
git clone https://github.com/bellman66/external-skills
claude --plugin-dir ./external-skills/mods
```

## 개발

```
claude plugin validate mods
claude plugin test mods
```

## 한계

- 호스트에 플러그인 목록·켜고 끄기·남의 창 열고 닫기 API 가 없다. 그래서 "활성 mod" 는 슬래시 명령을 등록한 mod 로 센다. 상태줄이나 훅만 있는 mod 는 띠에 안 보인다.
- 명령은 항상 빈 인자로 실행된다. 인자가 필요한 명령은 그 mod 가 알아서 처리한다(`/tree` 는 마지막 사용자 메시지를 씨앗으로 쓴다).
- 띠는 terminal 과 desktop 에서만 그려진다.

## 라이선스

MIT
