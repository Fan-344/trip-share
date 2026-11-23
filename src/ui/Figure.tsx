// 成員的小人。沒有五官，只用色塊；面向右邊，原點在腳底正中，站著大約 25 高。
// 角色決定手上的東西和動作，階段決定身邊的行李，packed 是自己的清單勾完了沒。
import type { Look, Stage } from '../avatar'

const TRUNK = '#8a5a4a'
const GOLD = '#f5c561'
const CORAL = '#e9755c'
const PINK = '#f4a8b8'
const CREAM = '#fdf0dc'
const SEA = '#6fa9bf'

/** 清單勾完了：行李上冒一顆閃爍的小星星。 */
function Star({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path class="a-twinkle" fill={GOLD} d="M0 -4.500l1.300 3.200l3.200 1.300l-3.200 1.300L0 4.500l-1.300 -3.200l-3.200 -1.300l3.200 -1.300z" />
    </g>
  )
}


/** 頭髮分兩層：後面那層畫在頭之前（長髮、馬尾），前面那層蓋在頭上。 */
function HairBack({ look }: { look: Look }) {
  const c = look.hairColor
  if (look.hair === 'long') return <path fill={c} d="M-4.400 -13.500v-9a4.400 4.400 0 0 1 8.800 0v9z" />
  if (look.hair === 'pony') return <path fill={c} d="M-2.500 -23.500q-6 0.500 -5.500 8q2.500 -2 3.500 -5.500z" />
  if (look.hair === 'bun') return <circle cx="-0.500" cy="-26.800" r="2.300" fill={c} />
  return null
}

function HairFront({ look }: { look: Look }) {
  const c = look.hairColor
  if (look.hair === 'bob') return <path fill={c} d="M-4.200 -18.500v-3.500a4.200 4.200 0 0 1 8.400 0v3.500h-1.600v-3q-2.600 -1.400 -5.200 0v3z" />
  return <path fill={c} d="M-3.700 -21.800a3.700 3.700 0 0 1 7.400 0q-3.700 -1.800 -7.400 0z" />
}

/** 角色手上的東西和手的動作。 */
function Hands({ look, stage }: { look: Look; stage: Stage }) {
  const arm = { fill: 'none', stroke: look.coat, 'stroke-width': 2.4, 'stroke-linecap': 'round' } as const
  switch (look.job) {
    case 'guide':
      return (
        <g class="a-hi">
          <path {...arm} d="M3 -16l5 -8" />
          <path fill="none" stroke={TRUNK} stroke-width="0.9" stroke-linecap="round" d="M8 -24v-10" />
          <path fill={CORAL} d="M8 -34l8.500 3l-8.500 3z" />
        </g>
      )
    case 'shopper':
      return (
        <g>
          <path {...arm} d="M3 -16l3 6" />
          <g class="a-dangle">
            <path fill="none" stroke={TRUNK} stroke-width="0.8" d="M4.500 -10q1.500 -3.500 3 0" />
            <path fill={PINK} d="M3 -10h6l1 8.500h-8z" />
          </g>
        </g>
      )
    case 'photo':
      return (
        <g class="a-cam">
          <path {...arm} d="M3 -16l4 -3" />
          <rect x="5" y="-23" width="6.500" height="4.800" rx="1.200" fill={SEA} /><circle cx="9" cy="-20.600" r="1.400" fill={CREAM} />
          <circle class="a-flash" cx="11.500" cy="-23.500" r="3" fill="#fff" />
        </g>
      )
    case 'cheer':
      return <path {...arm} d="M3 -16l4.500 -8M-3 -16l-4.500 -8" />
    default:
      return null
  }
}

/**
 * 廢人：整個人躺平，頭枕著枕頭、一腳翹著，手舉著手機在臉上方滑，頭上飄著睡意。
 * 手機是深色機身配亮的螢幕，放在白底上也看得到。原點在身體正下方的地面。
 */
function Lying({ look }: { look: Look }) {
  return (
    <g>
      {/* 飄上去的兩個 z */}
      <g fill="none" stroke="#b9a9a4" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <path class="a-rise" d="M-17 -15h3l-3 3h3" />
        <path class="a-rise" style="animation-delay:-3.500s" d="M-13 -21h2.200l-2.200 2.200h2.200" />
      </g>
      <rect x="-16.500" y="-5.500" width="9" height="5.500" rx="2.500" fill={PINK} />
      {/* 腿：一條平放、一條膝蓋彎起來 */}
      <rect x="4" y="-3.400" width="12" height="2.800" rx="1.400" fill={TRUNK} />
      <path class="a-knee" fill="none" stroke={TRUNK} stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round" d="M5 -4.500l4.500 -6l4 6.500" />
      {/* 身體：躺著的上衣，隨呼吸起伏 */}
      <rect class="a-belly" x="-7.500" y="-7.500" width="13.500" height="7" rx="3.500" fill={look.coat} />
      {/* 頭：整顆轉 90 度枕在枕頭上 */}
      <g transform="translate(-10.500 -6.500) rotate(-90) translate(0 21.500)">
        <HairBack look={look} />
        <circle cx="0" cy="-21.500" r="3.300" fill={look.skin} />
        <HairFront look={look} />
      </g>
      {/* 舉著手機的手：偶爾滑一下 */}
      <g class="a-scroll">
        <path fill="none" stroke={look.coat} stroke-width="2.400" stroke-linecap="round" d="M-3.500 -7l-2.500 -7.500" />
        <rect x="-10" y="-18.500" width="6.500" height="4.200" rx="1" fill={TRUNK} />
        <rect x="-9.200" y="-17.800" width="4.900" height="2.800" rx="0.500" fill="#8fe0d6" />
      </g>
    </g>
  )
}

/**
 * 小人本體。walk 是腿前後擺（進度條上用）；luggage 設成 false 就不畫身邊的行李。
 * 廢人是坐著的，其他角色站著；氣氛擔當整個人會跳。
 */
export function FigureBody({ look, stage, packed, walk = false, luggage = true }: { look: Look; stage: Stage; packed: boolean; walk?: boolean; luggage?: boolean }) {
  const lazy = look.job === 'lazy'
  const upper = (
    <g>
      {stage === 'trip' && !lazy && <rect x="-7.500" y="-18" width="4.500" height="9" rx="2.200" fill={SEA} />}
      <HairBack look={look} />
      <path fill={look.coat} d="M-3.500 -18h7l1.500 11h-10z" />
      <circle cx="0" cy="-21.500" r="3.300" fill={look.skin} />
      <HairFront look={look} />
      <Hands look={look} stage={stage} />
    </g>
  )
  return (
    <g>
      {luggage && <Luggage stage={stage} packed={packed} color={look.bag} />}
      <g class={look.job === 'cheer' ? 'a-bounce' : lazy ? '' : 'a-breathe'}>
        {lazy ? (
          <g>
            <Lying look={look} />
          </g>
        ) : (
          <g>
            {/* 走路時前後甩的那隻手 */}
            {walk && <path class="arm" fill="none" stroke={look.coat} stroke-width="2.2" stroke-linecap="round" d="M-2.500 -16v6.500" />}
            <g fill={TRUNK}>
              <rect class={walk ? 'leg' : undefined} x="-3" y="-8" width="2.400" height="8" rx="1.200" />
              <rect class={walk ? 'leg alt' : undefined} x="0.600" y="-8" width="2.400" height="8" rx="1.200" />
            </g>
            {upper}
          </g>
        )}
      </g>
    </g>
  )
}

/** 單獨一個小人的圖，給一般畫面用（成員名單、選角色的預覽、進度條）。 */
export function Figure({ look, stage = 'plan', packed = false, size = 44, walk = false, luggage = true, cls = '' }: {
  look: Look; stage?: Stage; packed?: boolean; size?: number; walk?: boolean; luggage?: boolean; cls?: string
}) {
  return (
    <svg class={`figure ${cls}`} viewBox="-22 -38 44 40" width={size * 1.1} height={size} aria-hidden="true">
      <FigureBody look={look} stage={stage} packed={packed} walk={walk} luggage={luggage} />
    </svg>
  )
}

/* ---------- 行李 ---------- */

/** 把顏色調暗一點，畫行李箱上的溝紋和邊條。 */
const darker = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.round(v * 0.8).toString(16).padStart(2, '0')
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`
}

interface BagProps { c: string; packed: boolean }

/** 立著的行李箱：拉桿、兩道溝紋、兩個輪子。底部正中在 (x, 0)。沒收好的話袖子夾在外面。 */
function Upright({ x, w, h, c, packed }: BagProps & { x: number; w: number; h: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path fill="none" stroke={TRUNK} stroke-width="1.2" stroke-linejoin="round" d={`M${-w * 0.22} ${-h - 1}v-5h${w * 0.44}v5`} />
      {!packed && <path fill={PINK} d={`M${-w / 2 + 1} ${-h * 0.55}l-4 1.500l0.500 3l3.500 -1z`} />}
      <rect x={-w / 2} y={-h - 1.500} width={w} height={h} rx="3" fill={c} />
      <path fill="none" stroke={darker(c)} stroke-width="1" stroke-linecap="round" d={`M${-w * 0.2} ${-h + 2}v${h - 6}M${w * 0.2} ${-h + 2}v${h - 6}`} />
      <circle cx={-w * 0.3} cy="-1.300" r="1.500" fill={TRUNK} /><circle cx={w * 0.3} cy="-1.300" r="1.500" fill={TRUNK} />
    </g>
  )
}

/** 平放的小箱子：側邊一個提把、中間一條邊。底部正中在 (x, y)，rot 是歪幾度。 */
function Flat({ x, y, w, h, rot, c, packed }: BagProps & { x: number; y: number; w: number; h: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {!packed && <path fill={PINK} d={`M${-w / 2 + 1} ${-h * 0.5}l-3.500 0.800l0.500 2.500l3 -0.800z`} />}
      <rect x={-w / 2} y={-h} width={w} height={h} rx="2" fill={c} />
      <rect x={-w / 2} y={-h * 0.58} width={w} height="1" fill={darker(c)} />
      <rect x={w / 2} y={-h * 0.78} width="1.800" height={h * 0.56} rx="0.900" fill={TRUNK} />
    </g>
  )
}

/** 圓筒形的旅行袋：上面一條提帶、中間一道束帶。底部正中在 (x, 0)。 */
function Duffel({ x, w, h, c, packed }: BagProps & { x: number; w: number; h: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path fill="none" stroke={TRUNK} stroke-width="1.200" stroke-linecap="round" d={`M${-w * 0.25} ${-h + 1}q${w * 0.25} ${-h * 0.95} ${w * 0.5} 0`} />
      {!packed && <path fill={PINK} d={`M${w * 0.22} ${-h + 0.500}q2 -3.500 4.500 -1.500l-1 2.500z`} />}
      <rect x={-w / 2} y={-h} width={w} height={h} rx={h / 2} fill={c} />
      <rect x={-w * 0.1} y={-h} width={w * 0.2} height={h} fill={darker(c)} />
    </g>
  )
}

/** 小人身邊的一個行李箱（選角色的預覽用）：畫在左後方。出發一週前和旅行中不畫。 */
function Luggage({ stage, packed, color }: { stage: Stage; packed: boolean; color: string }) {
  if (stage !== 'pack' && stage !== 'go') return null
  return <Upright x={-12} w={10} h={12} c={color} packed={packed} />
}

/**
 * 全團的行李，畫成一張完整的圖：幾個人就有幾件，一到五件各有自己的擺法，不是把同一個箱子疊起來。
 * 每件的顏色是那個人選的行李箱顏色（自己的是最大的那個）。
 * 沒勾完清單的人，那一件的衣角會夾在外面；全部的人都勾完了，上面冒一顆星星。
 * 出發一週前還沒有行李，什麼都不畫。
 */
export function Pile({ cast, stage, size = 40 }: { cast: { look: Look; packed: boolean }[]; stage: Stage; size?: number }) {
  const n = Math.min(cast.length, 5)
  if (stage === 'plan' || n === 0) return null
  const bag = (i: number): BagProps => ({ c: cast[i].look.bag, packed: cast[i].packed })
  const allPacked = cast.slice(0, n).every((m) => m.packed)
  // 每種件數各自的構圖，由後往前畫。
  const art = n === 1 ? (
    // 一件：一個大行李箱
    <Upright x={0} w={17} h={24} {...bag(0)} />
  ) : n === 2 ? (
    // 兩件：大的在後面，小的靠在前面
    <g>
      <Upright x={-6} w={17} h={24} {...bag(0)} />
      <Upright x={8} w={13} h={16} {...bag(1)} />
    </g>
  ) : n === 3 ? (
    // 三件：一大一中並排，前面橫著一個旅行袋
    <g>
      <Upright x={-9} w={17} h={25} {...bag(0)} />
      <Upright x={9} w={14} h={19} {...bag(1)} />
      <Duffel x={1} w={20} h={8} {...bag(2)} />
    </g>
  ) : n === 4 ? (
    // 四件：三件的擺法，再加一個小箱子平放在中的那個上面
    <g>
      <Upright x={-10} w={17} h={25} {...bag(0)} />
      <Upright x={9} w={15} h={18} {...bag(1)} />
      <Flat x={9.500} y={-25.500} w={14} h={6} rot={-4} {...bag(3)} />
      <Duffel x={0} w={20} h={8} {...bag(2)} />
    </g>
  ) : (
    // 五件：四件的擺法，最左邊再靠一個小行李箱
    <g>
      <Upright x={-6} w={17} h={26} {...bag(0)} />
      <Upright x={12} w={15} h={18} {...bag(1)} />
      <Flat x={12.500} y={-25.500} w={14} h={6} rot={-4} {...bag(3)} />
      <g transform="rotate(-7 -21 0)"><Upright x={-21} w={11} h={13} {...bag(4)} /></g>
      <Duffel x={3} w={20} h={8} {...bag(2)} />
    </g>
  )
  return (
    <svg class="figure" viewBox="-32 -46 64 48" width={size * 1.5} height={size * 1.12} aria-hidden="true">
      {art}
      {allPacked && <Star x={n === 1 ? 0 : -6} y={-40} />}
    </svg>
  )
}
