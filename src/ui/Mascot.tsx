// 每個主題一個圓形小圖：首頁的行程卡、選主題的地方用它。
// 用的是總覽主圖（Art.tsx）的同一批零件，縮小後放進圓框裡。
import type { ComponentChildren } from 'preact'
import type { ThemeId } from '../themes'
import { Balloon, BaySands, C, Eiffel, Junk, Palace, Palm, Pine, Shophouse, Torii, Tree, Wat, Wheel } from './Art'

const SUN = '#fff3d0'

const BODY: Record<ThemeId, { bg: string; art: ComponentChildren }> = {
  // 佛寺
  thai: {
    bg: '#f8c8b6',
    art: (
      <g>
        <circle cx="60" cy="20" r="9" fill={SUN} />
        <path fill="#e2b2bc" d="M0 62V40q20 -14 40 -4t40 -6V62z" />
        <g transform="translate(40 62) scale(0.5)"><Wat /></g>
        <rect y="62" width="80" height="18" fill="#9cd6cd" />
      </g>
    ),
  },
  // 富士山與鳥居
  japan: {
    bg: '#fbd6d0',
    art: (
      <g>
        <circle cx="40" cy="28" r="15" fill="#f0907f" />
        <path fill="#bba6cb" d="M4 62L32 30q8 -6 16 0L76 62z" />
        <path fill={C.cream} d="M32 30q8 -6 16 0l6 8q-5 -3 -8 1q-6 -5 -12 0q-3 -4 -8 -1z" />
        <rect y="60" width="80" height="20" fill="#a6d8d5" />
        <g transform="translate(40 72) scale(0.55)"><Torii /></g>
      </g>
    ),
  },
  // 宮殿樓閣
  korea: {
    bg: '#f6c6c2',
    art: (
      <g>
        <circle cx="16" cy="18" r="8" fill={SUN} />
        <path fill="#cdb9d3" d="M0 62V40q20 -16 40 -4t40 -8V62z" />
        <g transform="translate(40 62) scale(0.4)"><Palace /></g>
        <rect y="62" width="80" height="18" fill="#9fd3cc" />
      </g>
    ),
  },
  // 紅帆船
  hongkong: {
    bg: '#eab8b4',
    art: (
      <g>
        <circle cx="62" cy="18" r="8" fill={SUN} />
        <path fill="#b9a3c4" d="M0 56V38q20 -18 40 -6t40 -6V56z" />
        <rect y="54" width="80" height="26" fill="#9fc0d6" />
        <g transform="translate(40 66) scale(0.55)"><Junk /></g>
      </g>
    ),
  },
  // 老街店屋
  vietnam: {
    bg: '#f9cfae',
    art: (
      <g>
        <circle cx="62" cy="16" r="8" fill={SUN} />
        <g transform="translate(6 64) scale(0.62)"><Shophouse w={54} h={64} /></g>
        <g transform="translate(42 64) scale(0.62)"><Shophouse w={54} h={52} fill="#f3b78f" shade="#e6a078" /></g>
        <rect y="64" width="80" height="16" fill="#9cd3cb" />
      </g>
    ),
  },
  // 海灣邊的飯店
  singapore: {
    bg: '#f7c9c0',
    art: (
      <g>
        <circle cx="14" cy="16" r="8" fill={SUN} />
        <g transform="translate(40 64) scale(0.44)"><BaySands /></g>
        <rect y="64" width="80" height="16" fill="#9fd0d6" />
      </g>
    ),
  },
  // 鐵塔
  europe: {
    bg: '#f3cdd4',
    art: (
      <g>
        <circle cx="62" cy="18" r="8" fill={SUN} />
        <rect x="6" y="46" width="22" height="22" fill={C.cream} /><rect x="52" y="42" width="24" height="26" fill={C.cream} />
        <g transform="translate(40 68) scale(0.4)"><Eiffel /></g>
        <rect y="68" width="80" height="12" fill="#a6cdd6" />
      </g>
    ),
  },
  // 椰子樹與海
  island: {
    bg: '#fde6b8',
    art: (
      <g>
        <circle cx="58" cy="22" r="10" fill={SUN} />
        <rect y="46" width="80" height="34" fill="#78ccc5" />
        <path fill="#fbe7c0" d="M0 80V66q24 -10 50 0q16 6 30 2V80z" />
        <g transform="translate(26 70) scale(0.7)"><Palm /></g>
      </g>
    ),
  },
  // 高樓與摩天輪
  city: {
    bg: '#dcc4de',
    art: (
      <g>
        <circle cx="20" cy="40" r="12" fill={SUN} />
        <g transform="translate(56 38) scale(0.5)"><Wheel /></g>
        <rect x="10" y="34" width="14" height="32" rx="1" fill={C.pink} />
        <rect x="26" y="20" width="12" height="46" rx="1" fill={C.coral} />
        <rect x="33" y="20" width="5" height="46" fill={C.coralD} />
        <rect x="40" y="42" width="14" height="24" rx="1" fill={C.peach} />
        <rect y="66" width="80" height="14" fill="#a9c6d9" />
      </g>
    ),
  },
  // 熱氣球與山
  general: {
    bg: '#fbdcbc',
    art: (
      <g>
        <path fill="#d2bcdb" d="M0 70V46l18 -18l14 16l16 -22l32 30V70z" />
        <path fill="#8fcaa8" d="M0 80V62q20 -8 40 -2t40 -4V80z" />
        <Pine x={14} y={66} s={0.5} /><Pine x={66} y={64} s={0.6} />
        <g transform="translate(46 28) scale(0.55)"><Balloon /></g>
      </g>
    ),
  },
}

let seq = 0

export function Mascot({ theme, size = 36 }: { theme: ThemeId; size?: number }) {
  const m = BODY[theme] ?? BODY.general
  // 圖案超出圓形的部分要裁掉；同一頁會畫很多個，每個的裁切框要有自己的名字。
  const id = `mc${seq++}`
  return (
    <svg class="mascot" viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
      <clipPath id={id}><circle cx="40" cy="40" r="40" /></clipPath>
      <g clip-path={`url(#${id})`}>
        <rect width="80" height="80" fill={m.bg} />
        {m.art}
      </g>
    </svg>
  )
}

/** 頁尾的山丘和幾棵樹：每個主題共用。 */
export function Hills() {
  return (
    <svg class="hills" viewBox="0 0 300 70" aria-hidden="true">
      <circle cx="150" cy="40" r="14" fill={C.gold} opacity="0.7" />
      <path fill="#f3cdb4" d="M0 70V52q40 -18 80 -8t70 4t80 -10t70 6V70z" />
      <path fill="#ecd9c6" d="M0 70V62q60 -12 120 -4t180 -6V70z" />
      <Tree x={64} y={52} s={0.7} />
      <Tree x={92} y={56} s={0.45} fill={C.gold} light="#fbdc8f" />
      <Tree x={232} y={50} s={0.6} fill={C.coral} light="#f29a84" />
      <Pine x={258} y={54} s={0.6} />
    </svg>
  )
}
