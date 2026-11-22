// 各主題在總覽頂端的插畫。全部是手寫的 SVG：粗線、平塗，顏色用主題的變數。
// class 以 a- 開頭的是動態效果（定義在 styles.css），使用者關閉動態效果時會全部停下。
import type { ComponentChildren } from 'preact'
import type { ThemeId } from '../themes'

const W = 400
const H = 210

/** 位置用外層的 transform 屬性，動畫用內層的 class，兩者才不會互相蓋掉。 */
function At({ x, y, s = 1, rot = 0, children }: { x: number; y: number; s?: number; rot?: number; children: ComponentChildren }) {
  return <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>{children}</g>
}

function Cloud({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <path class="a-drift" style={`animation-delay:${delay}s`} fill="#fff" d="M0 14a8 8 0 0 1 8-8a12 12 0 0 1 22-2a9 9 0 0 1 12 10z" />
    </At>
  )
}

function Sun({ x, y, fill = 'var(--yellow)' }: { x: number; y: number; fill?: string }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return `M${(Math.cos(a) * 24).toFixed(1)} ${(Math.sin(a) * 24).toFixed(1)}L${(Math.cos(a) * 31).toFixed(1)} ${(Math.sin(a) * 31).toFixed(1)}`
  }).join('')
  return (
    <At x={x} y={y}>
      <path class="a-spin" d={rays} />
      <circle r="16" fill={fill} />
    </At>
  )
}

/** 使用者是否要求減少動態效果。SVG 自帶的路徑動畫不受 CSS 那條規則管，所以要另外判斷。 */
const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** animateMotion 的 path 屬性。Preact 的型別定義漏了它，所以從這裡繞過去。 */
const motionPath = (path: string) => ({ path }) as Record<string, string>

/** 機頭朝右的飛機外形，原點在機身中央。 */
export function PlaneShape() {
  return (
    <g fill="#fff">
      <path d="M-6 -3l-9 -13h7l12 13z" />
      <path d="M-6 3l-9 13h7l12 -13z" />
      <path d="M-21 -2l-6 -9h5l6 9z" />
      <ellipse rx="24" ry="5.5" />
    </g>
  )
}

/**
 * 沿著一條弧線飛的飛機：爬升時機頭朝上、過了頂點朝下（rotate="auto"），後面拖一小段虛線航跡。
 * 用 SVG 的 animateMotion，各家瀏覽器（含 iPhone 的 Safari）都支援。
 * path 是飛行路線；still 是關閉動態效果時飛機停的位置與角度。
 */
function Plane({ path, s = 1, dur = 13, still }: { path: string; s?: number; dur?: number; still: [x: number, y: number, rot: number] }) {
  const body = (
    <g transform={`scale(${s})`}>
      <path class="a-dash" stroke-dasharray="2 8" stroke-width="2.4" d="M-86 0h52" />
      <PlaneShape />
    </g>
  )
  if (reducedMotion()) return <g transform={`translate(${still[0]} ${still[1]}) rotate(${still[2]})`}>{body}</g>
  return (
    <g>
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" {...motionPath(path)} />
      {body}
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
      <path d={arc} stroke-dasharray="3 7" opacity="0.4" />
      <circle cx="8" cy="34" r="3.5" fill="#fff" />
      <circle cx="132" cy="34" r="3.5" fill="var(--accent)" />
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

function Bird({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <At x={x} y={y}>
      <path class="a-float" style={`animation-delay:${delay}s`} stroke-width="2.4" d="M-8 0q4 -6 8 0q4 -6 8 0" />
    </At>
  )
}

function Scene({ sky, ground, children }: { sky: string; ground: string; children: ComponentChildren }) {
  return (
    <svg class="art" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <g fill="none" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
        <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={sky} stroke="none" />
        {children}
        <rect x="-4" y="184" width={W + 8} height="40" fill={ground} />
      </g>
    </svg>
  )
}

function General() {
  return (
    <Scene sky="var(--mizu-l)" ground="var(--yellow-l)">
      <Sun x={330} y={48} />
      <Cloud x={40} y={36} s={1.3} />
      <Cloud x={228} y={92} delay={-6} />
      <Bird x={120} y={52} /><Bird x={146} y={64} delay={-1.2} />
      <path fill="var(--green)" d="M-10 186Q70 110 160 150T410 120V186Z" />
      <path fill="var(--green-l)" d="M-10 186Q110 140 210 168T410 156V186Z" />
      <Plane path="M-70 150Q190 -60 470 120" s={1.4} dur={12} still={[214, 52, -4]} />
      {/* 小樹 */}
      <g fill="var(--green)">
        <path d="M60 184v-14" /><circle cx="60" cy="162" r="10" />
        <path d="M250 184v-10" /><circle cx="250" cy="168" r="8" />
      </g>
      {/* 目的地的圖釘 */}
      <g class="a-bounce">
        <path fill="var(--coral)" d="M318 172c-12-16-18-24-18-33a18 18 0 0 1 36 0c0 9-6 17-18 33z" />
        <circle cx="318" cy="139" r="6" fill="#fff" />
      </g>
    </Scene>
  )
}

function Lantern({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <g class="a-rise" style={`animation-delay:${delay}s`}>
        <path fill="var(--coral)" d="M-7 -8h14l-2 16h-10z" />
        <path d="M-3 12h6" />
      </g>
    </At>
  )
}

function Thai() {
  return (
    <Scene sky="var(--mizu-l)" ground="var(--yellow-l)">
      <Sun x={336} y={46} />
      <Cloud x={36} y={30} s={1.2} />
      <Plane path="M-60 118Q190 -44 460 96" still={[156, 34, -12]} />
      <path fill="var(--green)" d="M-10 186L96 86L176 150L252 72L340 148L410 108V186Z" />
      <path fill="var(--green-l)" d="M-10 186Q120 132 224 168T410 150V186Z" />
      {/* 山頂的佛塔 */}
      <g fill="var(--yellow)">
        <path d="M252 46v-14" />
        <path d="M241 68q11 -34 22 0z" />
        <rect x="237" y="68" width="30" height="7" rx="2" />
      </g>
      <path class="a-twinkle" fill="#fff" stroke-width="2" d="M276 40l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2l5 -2z" />
      {/* 天燈 */}
      <Lantern x={69} y={86} />
      <Lantern x={306} y={104} s={0.9} delay={-2.5} />
      <Lantern x={379} y={80} s={0.7} delay={-4} />
      <Lantern x={206} y={112} s={0.6} delay={-1.2} />
      {/* 大象 */}
      <g fill="var(--mizu)">
        <path class="a-wag" d="M74 152q-9 4 -7 16" fill="none" />
        <rect x="86" y="168" width="11" height="20" rx="3" />
        <rect x="102" y="168" width="11" height="20" rx="3" />
        <rect x="122" y="168" width="11" height="20" rx="3" />
        <rect x="137" y="168" width="11" height="20" rx="3" />
        <ellipse cx="112" cy="156" rx="38" ry="24" />
        <path fill="var(--coral)" d="M96 133h30v14h-30z" />
        <circle cx="152" cy="148" r="19" />
        <path class="a-trunk" d="M165 146q16 8 12 32q-2 9 -11 6q-3 -5 2 -7q4 -12 -9 -19z" />
        <ellipse class="a-flap" cx="144" cy="149" rx="9" ry="13" fill="var(--coral-l)" />
        <circle cx="159" cy="144" r="1.6" fill="var(--ink)" />
      </g>
      {/* 雙條車 */}
      <g transform="translate(0 -10)">
        <g class="a-drive">
          <path fill="var(--coral)" d="M352 162h16l8 12v10h-24z" />
          <rect x="278" y="152" width="76" height="32" rx="6" fill="var(--coral)" />
          <rect x="286" y="159" width="14" height="11" rx="2" fill="#fff" />
          <rect x="306" y="159" width="14" height="11" rx="2" fill="#fff" />
          <rect x="326" y="159" width="14" height="11" rx="2" fill="#fff" />
          <circle cx="298" cy="186" r="7" fill="#fff" />
          <circle cx="356" cy="186" r="7" fill="#fff" />
        </g>
      </g>
      {/* 路邊的花 */}
      <g fill="var(--coral-l)" stroke-width="2">
        <circle cx="196" cy="180" r="4" /><circle cx="214" cy="182" r="3" /><circle cx="42" cy="180" r="4" />
      </g>
    </Scene>
  )
}

function Petal({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <At x={x} y={y}>
      <circle class="a-fall" style={`animation-delay:${delay}s`} r="3.4" fill="var(--coral)" stroke="none" />
    </At>
  )
}

function Japan() {
  return (
    <Scene sky="var(--mizu-l)" ground="var(--green-l)">
      <circle cx="322" cy="50" r="20" fill="var(--coral)" />
      <Cloud x={30} y={44} s={1.2} />
      <Cloud x={212} y={26} delay={-5} />
      {/* 富士山 */}
      <path fill="var(--mizu)" d="M36 186L160 70q10 -8 20 -3q10 -5 20 3L324 186Z" />
      <path fill="#fff" d="M131 97L160 70q10 -8 20 -3q10 -5 20 3L229 97l-13 -9l-12 11l-12 -11l-12 11l-12 -11l-12 11z" />
      {/* 鳥居 */}
      <g fill="var(--coral)">
        <rect x="294" y="122" width="10" height="64" />
        <rect x="346" y="122" width="10" height="64" />
        <rect x="288" y="134" width="74" height="8" />
        <path d="M278 108q47 -10 94 0v12q-47 -8 -94 0z" />
      </g>
      {/* 石燈籠 */}
      <g fill="var(--yellow-l)">
        <rect x="244" y="166" width="8" height="20" /><rect x="238" y="152" width="20" height="14" rx="2" />
        <path d="M234 152l14 -10l14 10z" />
      </g>
      {/* 櫻花樹 */}
      <path d="M72 186q-5 -30 6 -54" stroke-width="5" />
      <g class="a-sway" fill="var(--coral-l)">
        <circle cx="56" cy="124" r="22" />
        <circle cx="92" cy="118" r="20" />
        <circle cx="74" cy="100" r="19" />
      </g>
      <Petal x={110} y={96} delay={0} /><Petal x={132} y={84} delay={-1.6} /><Petal x={40} y={90} delay={-3.1} />
      <Petal x={150} y={110} delay={-4.2} /><Petal x={96} y={70} delay={-2.4} /><Petal x={262} y={70} delay={-0.8} />
    </Scene>
  )
}

function Island() {
  return (
    <Scene sky="var(--mizu-l)" ground="var(--yellow-l)">
      <Sun x={318} y={48} />
      <Cloud x={44} y={28} s={1.2} />
      <Cloud x={196} y={52} delay={-7} />
      <Bird x={236} y={36} /><Bird x={258} y={46} delay={-1} />
      {/* 海 */}
      <rect x="-4" y="128" width={W + 8} height="70" fill="var(--mizu)" />
      <path class="a-wave" stroke="#fff" d="M150 146h22M196 158h16M250 160h18M332 162h22M120 166h14M30 150h18" />
      {/* 帆船 */}
      <g class="a-bob">
        <path fill="#fff" d="M286 132v-46l30 46z" />
        <path fill="var(--yellow)" d="M282 132v-34l-20 34z" />
        <path fill="var(--coral)" d="M254 136h70l-10 14h-50z" />
      </g>
      {/* 沙灘 */}
      <path fill="var(--yellow-l)" d="M-10 214V166q90 -22 190 8q80 22 230 6V214Z" />
      {/* 椰子樹 */}
      <path d="M96 176q10 -46 -4 -82" stroke-width="6" />
      <g class="a-sway" fill="var(--green)">
        <path d="M92 94q-32 -22 -58 -2q30 -4 58 2z" />
        <path d="M92 94q32 -24 60 -4q-32 -4 -60 4z" />
        <path d="M92 94q-14 -36 -46 -36q28 8 46 36z" />
        <path d="M92 94q16 -36 48 -34q-28 8 -48 34z" />
      </g>
      <circle cx="88" cy="98" r="5" fill="var(--coral)" />
      <circle cx="98" cy="100" r="5" fill="var(--coral)" />
      {/* 遮陽傘與海星 */}
      <path d="M352 196v-40" />
      <path fill="var(--coral)" d="M322 160q30 -34 60 0z" />
      <path class="a-twinkle" fill="var(--coral-l)" stroke-width="2" d="M150 174l2.500 5l5.500 0.800l-4 3.800l1 5.400l-5 -2.600l-5 2.600l1 -5.400l-4 -3.800l5.500 -0.800z" />
    </Scene>
  )
}

function City() {
  // 窗戶：每棟樓幾排小方格；lit 那幾格會一閃一閃
  const windows = (x: number, y: number, cols: number, rows: number, lit: number[] = []) => {
    const cells = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        cells.push(
          <path key={i} d={`M${x + c * 11} ${y + r * 14}h5v6h-5z`} stroke-width="1.5"
            fill={lit.includes(i) ? 'var(--yellow)' : '#fff'}
            class={lit.includes(i) ? 'a-twinkle' : ''} style={`animation-delay:${-(i % 5) * 0.7}s`} />,
        )
      }
    }
    return cells
  }
  return (
    <Scene sky="var(--accent-l)" ground="var(--green-l)">
      <circle cx="338" cy="42" r="16" fill="var(--yellow)" />
      <Cloud x={34} y={30} s={1.2} />
      <Cloud x={214} y={20} delay={-6} />
      {/* 摩天輪 */}
      <path d="M288 118L268 186M288 118L308 186" />
      <g class="a-spin slow">
        <circle cx="288" cy="118" r="42" />
        <path d="M246 118h84M288 76v84M258 88l60 60M318 88l-60 60" stroke-width="2" />
        <circle cx="288" cy="76" r="7" fill="var(--coral)" /><circle cx="288" cy="160" r="7" fill="var(--mizu)" />
        <circle cx="246" cy="118" r="7" fill="var(--yellow)" /><circle cx="330" cy="118" r="7" fill="var(--green)" />
        <circle cx="258" cy="88" r="7" fill="var(--mizu)" /><circle cx="318" cy="148" r="7" fill="var(--coral)" />
        <circle cx="318" cy="88" r="7" fill="var(--green)" /><circle cx="258" cy="148" r="7" fill="var(--yellow)" />
      </g>
      <circle cx="288" cy="118" r="6" fill="#fff" />
      {/* 大樓 */}
      <rect x="28" y="96" width="46" height="90" fill="var(--mizu)" />{windows(36, 106, 3, 5, [1, 6, 11])}
      <rect x="80" y="124" width="38" height="62" fill="var(--yellow)" />{windows(88, 134, 2, 3)}
      <path d="M150 62v-18" /><circle class="a-twinkle" cx="150" cy="42" r="3" fill="var(--coral)" stroke-width="2" />
      <rect x="124" y="62" width="52" height="124" fill="var(--coral-l)" />{windows(132, 72, 4, 7, [2, 9, 13, 20, 26])}
      <rect x="182" y="110" width="40" height="76" fill="var(--green)" />{windows(190, 120, 2, 4, [3, 4])}
      <rect x="348" y="104" width="42" height="82" fill="var(--mizu-l)" />{windows(356, 114, 3, 4, [0, 7])}
      {/* 路上的電車 */}
      <g class="a-drive">
        <rect x="196" y="164" width="60" height="22" rx="5" fill="var(--coral)" />
        <path fill="#fff" d="M203 169h12v8h-12zM220 169h12v8h-12zM237 169h12v8h-12z" stroke-width="2" />
      </g>
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
