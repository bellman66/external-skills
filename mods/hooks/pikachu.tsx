import type { ClientModule } from 'claude-code'

/**
 * 띠의 빈 자리를 걸어 다니는 피카츄. 그리기 스레드의 서피스 모듈이라 `$` 가 없고,
 * 자기 타이머로 위치만 바꿔 자기 영역만 다시 그린다 — 띠 전체는 건드리지 않는다.
 * 양 끝에 닿으면 돌아서고, 한 걸음마다 발을 바꾼다. 꼬리는 가는 방향의 반대쪽.
 *
 * 영역 폭은 훅이 `columns` 로 못 박아 준다. 줄마다 정확히 그 폭만큼만 그려야 영역이
 * 내용을 따라 자라며 옆의 버튼을 밀어내는 일이 없다 — 벽은 그 폭이지 영역의 실측이 아니다.
 */
type Props = { dim: boolean; columns: number }
type State = { x: number; dir: 1 | -1; step: number }

// 세 줄 모두 정확히 9칸: 귀 `  /\  /\ `, 얼굴 `~( o.o ) `, 발 `  (___)  `
const SPRITE_W = 9
const STEP_MS = 400

// 타이머는 첫 호출의 props 를 붙들고 있으므로, 벽은 마지막으로 그린 폭에서 읽는다
let columns = 0

const Pikachu: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  columns = Math.max(SPRITE_W, props.columns)
  if (surface.state === undefined) {
    surface.setState({ x: 0, dir: 1, step: 0 })
    surface.every(STEP_MS, () => {
      const s = surface.state ?? { x: 0, dir: 1 as const, step: 0 }
      const max = columns - SPRITE_W
      let dir = s.dir
      let x = s.x + dir
      if (x > max || x < 0) {
        dir = dir === 1 ? -1 : 1
        x = Math.min(max, Math.max(0, s.x + dir))
      }
      surface.setState({ x, dir, step: s.step + 1 })
    })
  }
  const s = surface.state ?? { x: 0, dir: 1 as const, step: 0 }
  const x = Math.min(s.x, columns - SPRITE_W)
  const dim = props.dim
  const left = ' '.repeat(x)
  const right = ' '.repeat(columns - SPRITE_W - x)
  const tail = s.dir === 1 ? '~' : ' '
  const tailR = s.dir === 1 ? ' ' : '~'
  const feet = s.step % 2 === 0 ? '  (___)  ' : '  (_ _)  '
  // 노란 몸, 빨간 볼. 색이 안 나오는 테마에서도 모양만으로 읽히게 ASCII 만 쓴다.
  return (
    <Box flexDirection="column" width={columns} marginTop={Math.max(0, Math.floor((surface.rows - 3) / 2))}>
      <Text color="yellow" dimColor={dim}>{left + '  /\\  /\\ ' + right}</Text>
      <Box flexDirection="row">
        <Text>{left}</Text>
        <Text color="yellow" dimColor={dim}>{tail}</Text>
        <Text color="red" dimColor={dim}>{'('}</Text>
        <Text color="yellow" dimColor={dim}>{' o.o '}</Text>
        <Text color="red" dimColor={dim}>{')'}</Text>
        <Text color="yellow" dimColor={dim}>{tailR}</Text>
        <Text>{right}</Text>
      </Box>
      <Text color="yellow" dimColor={dim}>{left + feet + right}</Text>
    </Box>
  )
}

export default Pikachu
