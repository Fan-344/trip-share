// 各主題在總覽頂端的主圖。畫法：漸層天空、有光暈的太陽、一層層變淡的遠山、
// 正面看的建築（亮面加一塊暗面，沒有框線）、橘色樹冠的樹，前景是有倒影和波光的水面。
// class 以 a- 開頭的是動態效果（定義在 styles.css），使用者關閉動態效果時會全部停下。
import type { ComponentChildren } from 'preact'
import type { ThemeId } from '../themes'

const W = 400
const H = 260

/** 插畫共用的顏色：每個顏色配一個暗一階的版本，畫建築的暗面。 */
export const C = {
  coral: '#e9755c', coralD: '#cf5f4b',
  peach: '#f6c9a6', peachD: '#eaae8c',
  cream: '#fdf0dc', creamD: '#f1dcc0',
  gold: '#f5c561', goldD: '#e3a94a',
  orange: '#f2a24e', orangeL: '#f8c172',
  pink: '#f4a8b8', pinkL: '#fbd0d8',
  leaf: '#58b09a', leafL: '#7cc7ae',
  lilac: '#cdb7d6', plum: '#a98bb0',
  trunk: '#8a5a4a', glow: '#fbe3a6',
}

/** 使用者是否要求減少動態效果。SVG 自帶的路徑動畫不受 CSS 那條規則管，所以要另外判斷。 */
const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** animateMotion 的 path 屬性。Preact 的型別定義漏了它，所以從這裡繞過去。 */
const motionPath = (path: string) => ({ path }) as Record<string, string>

/** 機頭朝右的飛機外形，原點在機身中央。 */
export function PlaneShape() {
  return (
    <g stroke="none">
      <path fill={C.coralD} d="M-6 -3l-9 -14h7l13 14zM-21 -2l-6 -10h5l7 10z" />
      <ellipse rx="25" ry="6" fill={C.coral} />
      <path fill={C.coralD} d="M-6 3l-9 14h7l13 -14z" />
      <path fill={C.cream} d="M12 -2.500h7q3 1 4 2.500h-11z" />
    </g>
  )
}

/**
 * 航班卡中間的航線：一道弧形虛線，飛機從出發地沿弧線飛到目的地，到了淡出再重來。
 */
export function RouteArc() {
  const arc = 'M8 34Q70 -14 132 34'
  const still = reducedMotion()
  return (
    <svg class="arc" viewBox="0 0 140 42" aria-hidden="true" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d={arc} stroke-dasharray="0.1 6" opacity="0.45" />
      <circle cx="8" cy="34" r="3.5" fill="var(--accent)" stroke="none" />
      <circle cx="132" cy="34" r="3.5" fill={C.coral} stroke="none" />
      {still ? (
        <g transform="translate(70 10) scale(0.5)"><PlaneShape /></g>
      ) : (
        <g>
          <animateMotion dur="3.8s" repeatCount="indefinite" rotate="auto" {...motionPath(arc)} calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.6 1" />
          <animate attributeName="opacity" dur="3.8s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.12;0.86;1" />
          <g transform="scale(0.5)" stroke-width="4"><PlaneShape /></g>
        </g>
      )}
    </svg>
  )
}

/* ---------- 共用的零件 ---------- */

/** 位置和大小放在外層，動畫的 class 放在內層，兩者才不會互相蓋掉。 */
function At({ x, y, s = 1, children }: { x: number; y: number; s?: number; children: ComponentChildren }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>{children}</g>
}

/** 整張圖的外框與漸層天空。id 是這張圖的漸層名稱前綴，同一頁有兩張圖時不會互相打架。 */
function Scene({ id, sky, children }: { id: string; sky: string[]; children: ComponentChildren }) {
  return (
    <svg class="art" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          {sky.map((c, i) => <stop key={i} offset={i / (sky.length - 1)} stop-color={c} />)}
        </linearGradient>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stop-color="#fff" stop-opacity="0.8" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={`url(#${id}s)`} />
      {children}
    </svg>
  )
}

function Sun({ id, x, y, r, fill = '#fff3d0' }: { id: string; x: number; y: number; r: number; fill?: string }) {
  return (
    <g class="a-float slow">
      <circle cx={x} cy={y} r={r * 2.6} fill={`url(#${id}g)`} />
      <circle cx={x} cy={y} r={r} fill={fill} />
    </g>
  )
}

function Cloud({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <path class="a-drift" style={`animation-delay:${delay}s`} fill="#fff" opacity="0.75" d="M0 14a8 8 0 0 1 8-8a12 12 0 0 1 22-2a9 9 0 0 1 12 10z" />
    </At>
  )
}

function Bird({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <At x={x} y={y}>
      <path class="a-float" style={`animation-delay:${delay}s`} fill="none" stroke={C.plum} stroke-width="1.6" stroke-linecap="round" d="M-6 0q3 -5 6 0q3 -5 6 0" />
    </At>
  )
}

/**
 * 水面：從 y 往下到畫面底，漸層上色；land 會上下顛倒再畫一次當倒影，最上面是幾道波光。
 * land 是函式不是現成的圖形，因為同一份圖形不能放在兩個地方。
 */
function Water({ id, y, top, bottom, land }: { id: string; y: number; top: string; bottom: string; land?: () => ComponentChildren }) {
  const streaks: [number, number, number][] = [[24, 12, 56], [150, 24, 84], [276, 9, 64], [84, 40, 46], [300, 46, 76], [190, 54, 40]]
  return (
    <g>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={top} /><stop offset="1" stop-color={bottom} /></linearGradient>
        <clipPath id={`${id}c`}><rect x="-4" y={y} width={W + 8} height={H - y + 4} /></clipPath>
      </defs>
      <rect x="-4" y={y} width={W + 8} height={H - y + 4} fill={`url(#${id}w)`} />
      {land && <g clip-path={`url(#${id}c)`}><g transform={`translate(0 ${2 * y}) scale(1 -1)`} opacity="0.26">{land()}</g></g>}
      <g class="a-wave" fill="#fff" opacity="0.5">
        {streaks.filter(([, dy]) => y + dy < H - 4).map(([x, dy, w]) => <rect key={x} x={x} y={y + dy} width={w} height="2.6" rx="1.3" />)}
      </g>
    </g>
  )
}

/** 樹：彎彎的樹幹加三團樹冠，上面兩塊亮面。原點在樹根。 */
export function Tree({ x, y, s = 1, fill = C.orange, light = C.orangeL }: { x: number; y: number; s?: number; fill?: string; light?: string }) {
  return (
    <At x={x} y={y} s={s}>
      <path fill="none" stroke={C.trunk} stroke-width="3" stroke-linecap="round" d="M0 0q-3 -14 2 -26M1 -14q8 -4 12 -12M0 -18q-8 -3 -11 -10" />
      <g class="a-sway">
        <ellipse cx="-12" cy="-32" rx="13" ry="9" fill={fill} />
        <ellipse cx="12" cy="-30" rx="14" ry="10" fill={fill} />
        <ellipse cx="1" cy="-42" rx="16" ry="11" fill={fill} />
        <ellipse cx="-3" cy="-45" rx="9" ry="5" fill={light} />
        <ellipse cx="14" cy="-33" rx="7" ry="4" fill={light} />
      </g>
    </At>
  )
}

/** 針葉樹。原點在樹根。 */
export function Pine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <rect x="-1.5" y="-6" width="3" height="6" fill={C.trunk} />
      <path fill={C.leaf} d="M-10 -6L0 -24L10 -6zM-8 -16L0 -32L8 -16zM-6 -26L0 -40L6 -26z" />
      <path fill={C.leafL} d="M0 -24L-10 -6H0zM0 -32L-8 -16H0zM0 -40L-6 -26H0z" />
    </At>
  )
}

/** 一串小旗：從 a 拉到 b，中間垂下 sag。 */
function Flags({ a, b, sag, n }: { a: [number, number]; b: [number, number]; sag: number; n: number }) {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2 + sag
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * a[0] + 2 * t * (1 - t) * mx + t * t * b[0],
    (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * my + t * t * b[1],
  ]
  const fills = [C.coral, C.gold, C.cream]
  return (
    <g>
      <path fill="none" stroke={C.trunk} stroke-width="1" d={`M${a[0]} ${a[1]}Q${mx} ${my} ${b[0]} ${b[1]}`} />
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = at((i + 1) / (n + 1))
        return <path key={i} fill={fills[i % 3]} d={`M${(x - 3).toFixed(1)} ${y.toFixed(1)}h6l-3 7z`} />
      })}
    </g>
  )
}


function Twinkle({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return <At x={x} y={y}><circle class="a-twinkle" style={`animation-delay:${delay}s`} r="1.7" fill="#fff" /></At>
}

/** 路燈：一根細桿加一顆亮著的燈。底部在 (x, y)。 */
function Lamp({ x, y, h = 16 }: { x: number; y: number; h?: number }) {
  return (
    <g>
      <rect x={x - 0.6} y={y - h} width="1.2" height={h} fill={C.trunk} />
      <circle cx={x} cy={y - h} r="2.4" fill={C.glow} />
    </g>
  )
}


/* ---------- 泰北 ---------- */




/** 尖頂的山形屋頂：屋簷兩端上翹的金色尾飾、瓦片的橫紋、山牆中央的紋飾，右半邊是暗面。 */
function Gable({ base, half, h }: { base: number; half: number; h: number }) {
  const k = half
  return (
    <g>
      <path fill={C.coral} d={`M${-k} ${base}q${k * 0.6} ${-h * 0.12} ${k} ${-h}q${k * 0.4} ${h * 0.88} ${k} ${h}z`} />
      <path fill={C.coralD} d={`M0 ${base}v${-h}q${k * 0.4} ${h * 0.88} ${k} ${h}z`} />
      <path fill="none" stroke="#fff" stroke-width="0.8" opacity="0.4" d={`M${-k * 0.5} ${base - h * 0.3}h${k}M${-k * 0.22} ${base - h * 0.58}h${k * 0.44}`} />
      <path fill={C.gold} d={`M0 ${base - h * 0.8}l${k * 0.13} ${h * 0.46}h${-k * 0.26}z`} />
      <path fill={C.gold} d={`M${-k - 4} ${base + 1}q4 -1 6 -6l2 6h${2 * k - 8}l2 -6q2 5 6 6v2h${-(2 * k + 8)}z`} />
      <path fill={C.gold} d={`M${-k - 4} ${base + 1}q-4 -6 0 -11q1 5 5 7zM${k + 4} ${base + 1}q4 -6 0 -11q-1 5 -5 7z`} />
    </g>
  )
}

/** 三重屋頂的佛寺，正面。原點在地面正中。 */
export function Wat() {
  return (
    <g>
      {/* 兩層台基，上層一排方格紋 */}
      <rect x="-56" y="-5" width="112" height="5" rx="1" fill={C.creamD} />
      <rect x="-50" y="-13" width="100" height="8" fill={C.cream} />
      <g fill={C.peachD}>{[-44, -34, -24, 24, 34, 44].map((x) => <rect key={x} x={x - 2.5} y="-11" width="5" height="4" />)}</g>
      {/* 正中的階梯和兩側的金色扶手 */}
      <path fill={C.creamD} d="M-10 0h20l-3 -13h-14z" />
      <path fill="none" stroke={C.cream} stroke-width="0.8" d="M-9 -3.500h18M-8 -7h16M-7.500 -10h15" />
      <path fill={C.gold} d="M-13 0q-1 -8 3 -13h2l-2 13zM13 0q1 -8 -3 -13h-2l2 13z" />
      {/* 牆、屋簷下的陰影 */}
      <rect x="-42" y="-48" width="84" height="35" fill={C.peach} />
      <rect x="6" y="-48" width="36" height="35" fill={C.peachD} />
      <rect x="-42" y="-48" width="84" height="3" fill={C.coralD} opacity="0.45" />
      {/* 柱子：柱頭一圈金 */}
      {[-39, -21, 17, 35].map((x) => (
        <g key={x}>
          <rect x={x} y="-48" width="4" height="35" fill={C.cream} />
          <rect x={x - 0.5} y="-44" width="5" height="2" fill={C.gold} />
          <rect x={x - 0.5} y="-15" width="5" height="2" fill={C.creamD} />
        </g>
      ))}
      {/* 尖拱的門：金色門楣、門裡透出的光 */}
      <path fill={C.gold} d="M-11 -13v-19q0 -9 11 -14q11 5 11 14v19z" />
      <path fill={C.coralD} d="M-8 -13v-18a8 8 0 0 1 16 0v18z" />
      <path fill={C.glow} d="M-4.500 -13v-17a4.500 4.500 0 0 1 9 0v17z" />
      {/* 兩扇格子窗 */}
      {[-30, 26].map((x) => (
        <g key={x}>
          <path fill={C.gold} d={`M${x - 5} -19v-11q0 -5 5 -7q5 2 5 7v11z`} />
          <path fill={C.coralD} d={`M${x - 3.5} -20v-10a3.500 3.500 0 0 1 7 0v10z`} />
          <path fill="none" stroke={C.gold} stroke-width="0.7" d={`M${x} -33v13M${x - 3.5} -26h7`} />
        </g>
      ))}
      <Gable base={-48} half={52} h={25} />
      <Gable base={-65} half={39} h={23} />
      <Gable base={-81} half={27} h={23} />
      <path fill="none" stroke={C.gold} stroke-width="2" stroke-linecap="round" d="M0 -104v-14" />
      <circle cx="0" cy="-105" r="2.8" fill={C.gold} /><circle cx="0" cy="-111" r="1.8" fill={C.gold} />
    </g>
  )
}

/** 金色的鐘形佛塔：三層塔基、塔身的佛龕和橫紋、一圈圈的相輪。原點在地面正中。 */
function Chedi() {
  return (
    <g>
      <rect x="-22" y="-5" width="44" height="5" fill={C.creamD} />
      <rect x="-18" y="-11" width="36" height="6" fill={C.cream} />
      <rect x="-15" y="-16" width="30" height="5" fill={C.gold} /><rect x="0" y="-16" width="15" height="5" fill={C.goldD} />
      <path fill={C.gold} d="M-13 -16q0 -20 13 -26q13 6 13 26z" />
      <path fill={C.goldD} d="M0 -42q13 6 13 26H0z" />
      <path fill={C.cream} d="M-3 -16v-7a3 3 0 0 1 6 0v7z" />
      <path fill="none" stroke="#fff" stroke-width="0.8" opacity="0.45" d="M-11 -25h22M-8 -33h16" />
      <rect x="-6" y="-47" width="12" height="5" rx="1" fill={C.gold} />
      <rect x="-4.500" y="-51" width="9" height="3" rx="1" fill={C.goldD} />
      <rect x="-3.500" y="-55" width="7" height="3" rx="1" fill={C.gold} />
      <path fill={C.gold} d="M-3 -55L0 -80L3 -55z" /><path fill={C.goldD} d="M0 -80L3 -55H0z" />
      <circle cx="0" cy="-81" r="1.6" fill={C.gold} />
    </g>
  )
}

/** 往上飄的天燈。 */
function SkyLantern({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <g class="a-rise" style={`animation-delay:${delay}s`}>
        <circle r="13" cy="-4" fill="#fff" opacity="0.28" />
        <path fill={C.glow} d="M-6 6q-3 -14 6 -16q9 2 6 16z" />
        <ellipse cx="0" cy="6" rx="6" ry="1.6" fill={C.orange} />
      </g>
    </At>
  )
}

/** 漂在水上的水燈。 */
function Krathong({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <At x={x} y={y}>
      <g class="a-bob" style={`animation-delay:${delay}s`}>
        <path fill={C.pink} d="M-8 0q2 -6 8 -3q6 -3 8 3q-8 4 -16 0z" />
        <path fill={C.glow} d="M-1.5 -3q1.5 -6 3 0z" />
      </g>
    </At>
  )
}

function Thai() {
  const land = () => (
    <g>
      <path fill="#f0c9a0" d="M-4 198v-12q64 -8 124 -6t140 -2t144 4v16z" />
      {/* 主角是一座佛寺，旁邊一座佛塔，中間拉一串小旗；兩側各一組樹 */}
      <At x={172} y={188} s={1.3}><Wat /></At>
      <At x={296} y={188} s={1.05}><Chedi /></At>
      <Flags a={[232, 128]} b={[294, 112]} sag={14} n={5} />
      <Tree x={44} y={188} s={1.15} />
      <Tree x={78} y={190} s={0.7} fill={C.gold} light="#fbdc8f" />
      <Tree x={358} y={189} s={1.0} fill={C.coral} light="#f29a84" />
    </g>
  )
  return (
    <Scene id="th" sky={['#fbd3bd', '#f8c1b2', '#f6dcc6', '#d6ecde']}>
      <Sun id="th" x={96} y={66} r={24} />
      <Cloud x={160} y={28} s={1.2} />
      <path fill="#e6bcc6" d="M-4 198V130Q50 96 96 118Q140 70 196 112Q240 86 290 120Q340 98 404 126V198z" />
      {/* 山頂上的金色佛塔 */}
      <At x={372} y={118} s={0.36}><Chedi /></At>
      <path fill="#dba6aa" d="M-4 198V162Q70 128 140 154Q210 122 280 158Q340 140 404 160V198z" />
      {/* 天燈從右邊的佛塔後面一路往左上飄，越遠越小 */}
      <SkyLantern x={346} y={120} s={1} /><SkyLantern x={312} y={74} s={0.8} delay={-2.5} />
      <SkyLantern x={262} y={46} s={0.6} delay={-4} /><SkyLantern x={60} y={62} s={0.5} delay={-1.2} />
      <SkyLantern x={22} y={110} s={0.7} delay={-5.5} />
      {land()}
      <Water id="th" y={198} top="#9cd6cd" bottom="#d3efe3" land={land} />
      <Krathong x={70} y={230} /><Krathong x={318} y={222} delay={-1.5} />
    </Scene>
  )
}

/* ---------- 日本 ---------- */





/** 五重塔，正面：每層有屋簷下的陰影、兩扇窗、一圈欄杆，屋瓦上一道亮線。原點在地面正中。 */
function Pagoda() {
  return (
    <g>
      <rect x="-28" y="-4" width="56" height="4" fill={C.creamD} />
      <path fill={C.creamD} d="M-6 0h12l-2 -4h-8z" />
      {[0, 1, 2, 3, 4].map((i) => {
        const w = 30 - i * 4
        const top = -4 - i * 20 - 14
        return (
          <g key={i}>
            <rect x={-w * 0.55} y={top} width={w * 1.1} height="14" fill={C.cream} />
            <rect x={w * 0.1} y={top} width={w * 0.45} height="14" fill={C.creamD} />
            <rect x={-w * 0.55} y={top} width={w * 1.1} height="2.5" fill={C.coralD} opacity="0.4" />
            <rect x="-2" y={top + 5} width="4" height="9" fill={C.coralD} />
            <rect x={-w * 0.4} y={top + 5} width="3" height="4" fill={C.coralD} /><rect x={w * 0.4 - 3} y={top + 5} width="3" height="4" fill={C.coralD} />
            <path fill="none" stroke={C.coral} stroke-width="0.9" d={`M${-w * 0.75} ${top + 11}h${w * 1.5}M${-w * 0.75} ${top + 11}v3M${w * 0.75} ${top + 11}v3M${-w * 0.38} ${top + 11}v3M${w * 0.38} ${top + 11}v3`} />
            <path fill={C.coral} d={`M${-w - 4} ${top}q4 -1 7 -6h${2 * w - 6}q3 5 7 6z`} />
            <path fill={C.coralD} d={`M0 ${top}v-6h${w - 3}q3 5 7 6z`} />
            <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.45" d={`M${-w + 3} ${top - 3}h${2 * w - 6}`} />
            <path fill={C.gold} d={`M${-w - 4} ${top}q-2 -4 1 -6q0 3 2 5zM${w + 4} ${top}q2 -4 -1 -6q0 3 -2 5z`} />
          </g>
        )
      })}
      <path fill="none" stroke={C.gold} stroke-width="2" stroke-linecap="round" d="M0 -104v-18" />
      <path fill={C.gold} d="M-4 -106h8v2h-8zM-3.500 -111h7v2h-7zM-3 -116h6v2h-6z" />
    </g>
  )
}

/** 鳥居：笠木兩端上翹、中央一塊匾額、柱腳有礎石。原點在柱腳正中。 */
export function Torii() {
  return (
    <g>
      <rect x="-21" y="-4" width="11" height="4" rx="1" fill={C.trunk} /><rect x="10" y="-4" width="11" height="4" rx="1" fill={C.trunk} />
      <path fill={C.coral} d="M-18.500 -4l1 -42h4l1 42z" /><path fill={C.coralD} d="M12.500 -4l1 -42h4l1 42z" />
      <rect x="-24" y="-36" width="48" height="4" fill={C.coral} /><rect x="0" y="-36" width="24" height="4" fill={C.coralD} />
      <rect x="-3" y="-46" width="6" height="10" fill={C.gold} />
      <rect x="-26" y="-48" width="52" height="4" fill={C.coral} />
      <path fill={C.coralD} d="M-31 -49q31 -5 62 0l2 -6q-33 -6 -66 0z" />
      <path fill={C.trunk} d="M-33 -55q33 -6 66 0l0.500 -2q-33.500 -6 -67 0z" />
    </g>
  )
}

function Petal({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <At x={x} y={y}>
      <ellipse class="a-fall" style={`animation-delay:${delay}s`} rx="3" ry="1.8" fill={C.pinkL} />
    </At>
  )
}

function Japan() {
  const land = () => (
    <g>
      <path fill="#f3cdb4" d="M-4 202v-10q104 -8 204 -4t204 -2v16z" />
      {/* 主角是左邊的五重塔，兩旁各一棵櫻花；右岸只留一棵，讓鳥居和富士山透氣 */}
      <At x={92} y={192} s={1.3}><Pagoda /></At>
      <Tree x={30} y={192} s={0.9} fill={C.pink} light={C.pinkL} />
      <Tree x={152} y={192} s={1.1} fill={C.pink} light={C.pinkL} />
      <Tree x={362} y={192} s={1.1} fill={C.pink} light={C.pinkL} />
    </g>
  )
  return (
    <Scene id="jp" sky={['#fbcfcb', '#fbe1d2', '#fdf0df', '#dcefe6']}>
      <Sun id="jp" x={214} y={84} r={42} fill="#f0907f" />
      <Cloud x={30} y={40} s={1.2} /><Cloud x={310} y={30} delay={-5} />
      <path fill="#bba6cb" d="M70 202L190 80q24 -16 48 0L358 202z" />
      <path fill="#a892bd" d="M214 72q14 0 24 8L358 202H214z" />
      <path fill={C.cream} d="M190 80q24 -16 48 0l20 22q-12 -8 -22 2q-10 -12 -22 0q-10 -12 -22 -2q-10 -6 -22 0z" />
      {/* 山壁上幾道往下的雪痕 */}
      <path fill="none" stroke={C.cream} stroke-width="1.6" stroke-linecap="round" opacity="0.55" d="M186 106l-8 22M202 110l-3 30M228 110l4 28M244 108l9 20" />
      {/* 山腳兩側的丘陵和幾道橫雲 */}
      <path fill="#ecc6cd" d="M-4 202V170Q40 148 90 162Q130 156 160 202zM270 202Q300 152 340 164Q372 150 404 166V202z" />
      <g fill="#fff" opacity="0.65">
        <rect x="14" y="126" width="96" height="7" rx="3.5" /><rect x="50" y="137" width="64" height="6" rx="3" />
        <rect x="288" y="116" width="100" height="7" rx="3.5" /><rect x="304" y="127" width="60" height="6" rx="3" />
      </g>
      <ellipse cx="200" cy="176" rx="190" ry="12" fill="#fff" opacity="0.45" />
      <Bird x={318} y={66} /><Bird x={338} y={78} delay={-1.2} />
      {land()}
      <Water id="jp" y={200} top="#a6d8d5" bottom="#def2e9" land={land} />
      {/* 立在水裡的鳥居 */}
      <At x={262} y={240} s={1.2}><Torii /></At>
      <ellipse cx="262" cy="241" rx="38" ry="3.5" fill="#fff" opacity="0.5" />
      <Petal x={70} y={40} delay={0} /><Petal x={150} y={20} delay={-2} /><Petal x={230} y={50} delay={-4} />
      <Petal x={320} y={30} delay={-1} /><Petal x={380} y={70} delay={-3} /><Petal x={110} y={90} delay={-5} />
    </Scene>
  )
}

/* ---------- 海島 ---------- */

/** 椰子樹。原點在樹根。 */
export function Palm({ flip = false }: { flip?: boolean }) {
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined}>
      <path fill="none" stroke={C.trunk} stroke-width="5" stroke-linecap="round" d="M0 0q-6 -30 6 -62" />
      {/* 樹幹上一節一節的紋 */}
      <path fill="none" stroke="#fff" stroke-width="1" opacity="0.3" d="M-4 -10h5M-5 -20h5M-5 -30h5M-4 -40h5M-2 -50h5" />
      <g class="a-sway">
        <path fill={C.leaf} d="M6 -62q-22 -16 -42 -2q22 -6 42 2zM6 -62q20 -18 42 -6q-22 -4 -42 6zM6 -62q-14 -26 -36 -24q20 6 36 24z" />
        <path fill={C.leafL} d="M6 -62q12 -26 34 -26q-18 8 -34 26zM6 -62q-3 -24 -2 -38q9 14 2 38z" />
        <circle cx="3" cy="-60" r="3" fill={C.trunk} /><circle cx="9" cy="-59" r="3" fill={C.trunk} />
      </g>
    </g>
  )
}



/** 水上屋：茅草屋頂的紋路、一扇亮著的窗、門廊欄杆、斜撐的木樁、下到水面的梯子。原點在水面正中。 */
function Bungalow() {
  return (
    <g>
      <path fill="none" stroke={C.trunk} stroke-width="2" d="M-13 0v-12M13 0v-12M0 0v-12" />
      <path fill="none" stroke={C.trunk} stroke-width="1" opacity="0.6" d="M-13 -4L0 -12L13 -4" />
      <rect x="-21" y="-15" width="42" height="3.500" fill="#c98f6b" />
      <path fill="none" stroke="#c98f6b" stroke-width="1" d="M-21 -21h8M13 -21h8M-21 -21v6M-17 -21v6M17 -21v6M21 -21v6" />
      <rect x="-12" y="-30" width="24" height="15" fill={C.cream} /><rect x="2" y="-30" width="10" height="15" fill={C.creamD} />
      <rect x="-12" y="-30" width="24" height="2" fill={C.goldD} opacity="0.5" />
      <rect x="-3" y="-26" width="6" height="11" rx="1" fill={C.coralD} />
      <rect x="-10" y="-26" width="5" height="5" fill={C.glow} /><rect x="5.500" y="-26" width="4.500" height="5" fill={C.glow} />
      <path fill={C.gold} d="M-23 -29L0 -51L23 -29z" /><path fill={C.goldD} d="M0 -51L23 -29H0z" />
      <path fill="none" stroke={C.goldD} stroke-width="0.8" d="M-15 -36h14M-9 -42h8" />
      <path fill="none" stroke={C.gold} stroke-width="0.8" d="M1 -36h14M1 -42h8" />
      <path fill="none" stroke="#c98f6b" stroke-width="1" d="M5 -12v12M9 -12v12M5 -8h4M5 -4h4" />
    </g>
  )
}

function Sailboat() {
  return (
    <g class="a-bob">
      <path fill={C.cream} d="M2 -4v-46l28 46z" />
      <path fill={C.coral} d="M-2 -4v-34l-18 34z" />
      <path fill={C.trunk} d="M-26 0h56l-7 9h-42z" />
    </g>
  )
}

function Island() {
  const land = () => (
    <g>
      <path fill="#a9d8c6" d="M-4 152q24 -16 54 -8q22 -4 40 8z" />
      <path fill="#8fc9b4" d="M150 152q30 -30 62 -8q24 -18 52 4q10 -4 20 4z" />
      <Tree x={196} y={140} s={0.45} fill={C.leaf} light={C.leafL} />
    </g>
  )
  return (
    <Scene id="is" sky={['#fddfa8', '#fbe8c6', '#d9f0e4', '#a6ded8']}>
      <Sun id="is" x={96} y={68} r={26} fill="#fff6dc" />
      <Cloud x={210} y={40} s={1.3} />
      <Bird x={230} y={86} /><Bird x={250} y={98} delay={-1.2} />
      {land()}
      <Water id="is" y={152} top="#78ccc5" bottom="#c3ecdf" land={land} />
      <At x={166} y={176} s={0.75}><Sailboat /></At>
      {/* 水上屋和棧道：站在水裡，所以畫在水面之後 */}
      <g fill="#c98f6b">
        <rect x="262" y="176" width="146" height="2.500" />
        {[300, 324, 372, 396].map((x) => <rect key={x} x={x} y="178" width="1.6" height="12" />)}
      </g>
      <At x={270} y={198} s={1.45}><Bungalow /></At>
      <At x={348} y={196} s={1.1}><Bungalow /></At>
      {/* 前景的沙灘 */}
      <path fill="#fbe7c0" d="M-4 264V222Q70 200 150 222Q220 242 300 250Q350 254 404 246V264z" />
      <path fill="#fff" opacity="0.6" d="M-4 226Q70 202 150 224Q220 244 300 252Q350 256 404 248v-3Q350 252 300 248Q220 240 150 220Q70 198 -4 222z" />
      <At x={44} y={236} s={1.25}><Palm /></At>
      <At x={96} y={246} s={0.9}><Palm flip /></At>
    </Scene>
  )
}

/* ---------- 城市 ---------- */

/** 一棟樓：亮面、右邊的暗面、一格格的窗（有些亮著燈）。底部貼在 base。 */
function Building({ x, w, h, fill, shade, base = 198, lit = true }: { x: number; w: number; h: number; fill: string; shade: string; base?: number; lit?: boolean }) {
  const cols = Math.floor((w - 6) / 8)
  const rows = Math.floor((h - (lit ? 22 : 10)) / 11)
  const pad = (w - cols * 8 + 4) / 2
  return (
    <g>
      <rect x={x} y={base - h} width={w} height={h} rx="2" fill={fill} />
      <rect x={x + w * 0.62} y={base - h} width={w * 0.38} height={h} fill={shade} />
      {/* 屋頂的女兒牆；前排的樓底層是店面和遮陽棚 */}
      <rect x={x - 1} y={base - h - 2} width={w + 2} height="3.5" rx="1" fill={shade} />
      {lit && <rect x={x} y={base - 10} width={w} height="10" fill={shade} />}
      {lit && <rect x={x + 3} y={base - 10} width={w - 6} height="3" rx="1" fill={C.cream} />}
      {lit && <rect x={x + w / 2 - 2} y={base - 6} width="4" height="6" fill={C.glow} />}
      {lit && Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        const on = (r * 3 + c * 5 + x) % 4 !== 0
        return <rect key={i} x={x + pad + c * 8} y={base - h + 7 + r * 11} width="4" height="6" rx="1" fill={on ? '#fde9b0' : '#fff'} opacity={on ? 1 : 0.35} />
      })}
    </g>
  )
}

/** 摩天輪。原點在輪心。 */
export function Wheel({ r = 36 }: { r?: number }) {
  const cabins = [C.coral, C.gold, C.cream, C.pink, C.coral, C.gold, C.cream, C.pink]
  return (
    <g>
      <path stroke={C.plum} stroke-width="3" stroke-linecap="round" d={`M0 0L-18 ${r + 16}M0 0L18 ${r + 16}`} />
      <g class="a-spin slow">
        <circle r={r} fill="none" stroke={C.cream} stroke-width="3" />
        {cabins.map((_, i) => {
          const a = (i * Math.PI) / 4
          return <path key={i} stroke={C.cream} stroke-width="1.5" d={`M0 0L${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`} />
        })}
        {cabins.map((fill, i) => {
          const a = (i * Math.PI) / 4
          return <circle key={i} cx={(Math.cos(a) * r).toFixed(1)} cy={(Math.sin(a) * r).toFixed(1)} r="5" fill={fill} />
        })}
      </g>
      <circle r="5" fill={C.coral} />
    </g>
  )
}

function City() {
  const land = () => (
    <g>
      {([[0, 30, 96], [40, 26, 122], [84, 30, 100], [130, 24, 142], [170, 36, 112], [236, 28, 128], [262, 34, 92], [366, 38, 106]] as const).map(([x, w, h]) => (
        <Building key={x} x={x} w={w} h={h} fill="#e4c3d4" shade="#dab5c9" lit={false} />
      ))}
      <At x={332} y={144}><Wheel /></At>
      <Building x={18} w={40} h={72} fill={C.pink} shade="#e892a4" />
      <Building x={62} w={34} h={112} fill={C.lilac} shade="#bba2c6" />
      <Building x={100} w={46} h={86} fill={C.peach} shade={C.peachD} />
      <Building x={150} w={30} h={130} fill={C.coral} shade={C.coralD} />
      {/* 觀景塔 */}
      <path fill={C.cream} d="M203 198L207 66h2L213 198z" />
      <ellipse cx="208" cy="100" rx="13" ry="5" fill={C.coral} /><ellipse cx="208" cy="97" rx="9" ry="3" fill={C.cream} />
      <Building x={226} w={44} h={98} fill="#bfa9cf" shade={C.plum} />
      <Building x={274} w={30} h={64} fill={C.pink} shade="#e892a4" />
      {/* 屋頂的天線和圓頂 */}
      <path stroke={C.trunk} stroke-width="1.2" d="M79 86v-12M165 68v-14M248 100v-10" />
      <g fill={C.coral}><circle cx="79" cy="74" r="1.6" /><circle cx="165" cy="54" r="1.6" /><circle cx="248" cy="90" r="1.6" /></g>
      <path fill={C.peachD} d="M111 112a12 12 0 0 1 24 0z" />
      <Tree x={318} y={198} s={0.5} /><Tree x={382} y={198} s={0.55} fill={C.gold} light="#fbdc8f" />
      {[36, 196, 300].map((x) => <Lamp key={x} x={x} y={198} />)}
      <rect x="-4" y="198" width={W + 8} height="8" fill="#eab59c" />
    </g>
  )
  return (
    <Scene id="ct" sky={['#cbb6dc', '#f1bfbd', '#fbdab6', '#fdeed2']}>
      <Sun id="ct" x={116} y={150} r={32} fill="#fff0d0" />
      <Cloud x={40} y={30} s={1.2} /><Cloud x={250} y={44} delay={-5} />
      <Bird x={300} y={60} /><Bird x={320} y={72} delay={-1.2} />
      {land()}
      <Water id="ct" y={206} top="#a9c6d9" bottom="#e6dcec" land={land} />
      <At x={96} y={238} s={0.45}><Sailboat /></At>
      <Twinkle x={30} y={64} /><Twinkle x={96} y={22} delay={-1} /><Twinkle x={170} y={40} delay={-0.5} />
      <Twinkle x={226} y={18} delay={-1.6} /><Twinkle x={366} y={26} delay={-0.8} /><Twinkle x={388} y={84} delay={-2} />
    </Scene>
  )
}

/* ---------- 通用 ---------- */



/** 熱氣球：一瓣一瓣的氣囊、腰上一圈花紋、頂蓋、藤編的籃子。原點在氣囊中心。 */
export function Balloon({ fill = C.coral, stripe = C.cream }: { fill?: string; stripe?: string }) {
  return (
    <g>
      <path fill={fill} d="M0 -24c16 0 24 12 24 22c0 12 -12 22 -18 30h-12c-6 -8 -18 -18 -18 -30c0 -10 8 -22 24 -22z" />
      <path fill={stripe} d="M0 -24c6 0 9 12 9 22c0 12 -4 22 -6 30h-6c-2 -8 -6 -18 -6 -30c0 -10 3 -22 9 -22z" />
      <path fill={stripe} opacity="0.55" d="M-15.500 -19c-6 5 -8.500 12 -8.500 17c0 10 8 18 14 25c-5 -9 -8 -16 -8 -25c0 -7 1 -12 2.500 -17zM15.500 -19c6 5 8.500 12 8.500 17c0 10 -8 18 -14 25c5 -9 8 -16 8 -25c0 -7 -1 -12 -2.500 -17z" />
      {/* 腰上一圈鋸齒花紋 */}
      <path fill={C.gold} d="M-24 -3l4 4l4 -4l4 4l4 -4l4 4l4 -4l4 4l4 -4l4 4l4 -4l4 4l4 -4v5h-48z" opacity="0.9" />
      <path fill="#000" opacity="0.08" d="M0 -24c16 0 24 12 24 22c0 12 -12 22 -18 30h-6z" />
      <ellipse cx="0" cy="-23.500" rx="5" ry="1.800" fill={C.trunk} opacity="0.5" />
      <rect x="-6" y="28" width="12" height="2.500" rx="1" fill={C.trunk} />
      <path fill="none" stroke={C.trunk} stroke-width="0.9" d="M-5 30l2 7M5 30l-2 7M0 30v7" />
      <rect x="-4.500" y="37" width="9" height="7" rx="1.500" fill="#c98f6b" />
      <path fill="none" stroke={C.trunk} stroke-width="0.7" d="M-4.500 39.500h9M-4.500 42h9" />
    </g>
  )
}

/** 小木屋：窗框、門、煙囪冒著的煙、門前一小段籬笆。原點在地面正中。 */
function Cabin() {
  return (
    <g>
      <g fill="#fff" opacity="0.7"><circle class="a-rise" cx="8.500" cy="-40" r="3" /><circle class="a-rise" style="animation-delay:-3s" cx="10" cy="-46" r="4" /></g>
      <rect x="6" y="-34" width="5" height="12" fill={C.coralD} />
      <rect x="-15" y="-17" width="30" height="17" fill={C.cream} />
      <rect x="2" y="-17" width="13" height="17" fill={C.creamD} />
      <path fill={C.coral} d="M-20 -16L0 -34L20 -16z" /><path fill={C.coralD} d="M0 -34L20 -16H0z" />
      <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.4" d="M-12 -21h11M-6 -27h5" />
      <rect x="-10" y="-12" width="7" height="7" fill={C.glow} />
      <path fill="none" stroke={C.cream} stroke-width="0.8" d="M-6.500 -12v7M-10 -8.500h7" />
      <rect x="5" y="-11" width="6" height="11" rx="1" fill={C.coralD} /><circle cx="9.500" cy="-5" r="0.700" fill={C.gold} />
      <path fill="none" stroke={C.cream} stroke-width="1.2" d="M-30 -5h13M17 -5h13M-28 0v-8M-23 0v-8M-18 0v-8M19 0v-8M24 0v-8M29 0v-8" />
    </g>
  )
}

function Float({ x, y, s, delay, children }: { x: number; y: number; s: number; delay: number; children: ComponentChildren }) {
  return <At x={x} y={y} s={s}><g class="a-float slow" style={`animation-delay:${delay}s`}>{children}</g></At>
}

function General() {
  const land = () => (
    <g>
      <path fill="#8fcaa8" d="M-4 214V184Q60 160 130 180Q200 196 270 176Q340 160 404 182V214z" />
      <path fill={C.cream} opacity="0.9" d="M236 214q-30 -10 -8 -20q20 -8 60 -10l2 4q-40 2 -50 10q-18 8 10 16z" />
      <At x={312} y={184} s={1.25}><Cabin /></At>
      <Pine x={258} y={184} s={1.1} /><Pine x={274} y={188} s={0.75} /><Pine x={368} y={186} s={1.2} />
      <Tree x={36} y={188} s={1.0} /><Tree x={66} y={190} s={0.65} fill={C.coral} light="#f29a84" />
    </g>
  )
  return (
    <Scene id="ge" sky={['#fbd6b4', '#fbe5ca', '#e3f0de', '#bfe3da']}>
      <Sun id="ge" x={330} y={64} r={26} />
      <Cloud x={150} y={26} s={1.2} />
      <path fill="#d2bcdb" d="M-4 214V128L52 70l38 44l52 -72l62 86l40 -42l58 62l52 -32l50 36V214z" />
      <path fill="#c2a9cf" d="M52 70l38 44l-22 26zM142 42l62 86l-34 30zM244 86l58 62l-44 24z" />
      <path fill={C.cream} d="M142 42l-18 25q10 6 18 -2q10 8 20 4zM52 70l-14 15q8 4 14 -2q8 6 14 2zM244 86l-12 13q6 4 12 -1q7 5 12 2z" />
      <path fill="#eab5a8" d="M-4 214V164Q60 130 120 158Q190 120 260 160Q330 136 404 162V214z" />
      <Float x={92} y={84} s={1.6} delay={0}><Balloon /></Float>
      <Float x={212} y={56} s={0.95} delay={-1.8}><Balloon fill={C.leaf} stripe={C.cream} /></Float>
      <Float x={276} y={118} s={0.55} delay={-3}><Balloon fill={C.plum} stripe={C.cream} /></Float>
      <Bird x={160} y={110} /><Bird x={180} y={122} delay={-1.2} />
      {land()}
      <Water id="ge" y={212} top="#8fd0c8" bottom="#d3efe3" land={land} />
      <At x={150} y={240} s={0.5}><Sailboat /></At>
    </Scene>
  )
}

export function Art({ theme }: { theme: ThemeId }) {
  switch (theme) {
    case 'thai': return <Thai />
    case 'japan': return <Japan />
    case 'island': return <Island />
    case 'city': return <City />
    default: return <General />
  }
}
