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

/** 熱氣球：慢慢上下飄。 */
function Balloon({ x, y, s = 1, fill, delay = 0 }: { x: number; y: number; s?: number; fill: string; delay?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <g class="a-float slow" style={`animation-delay:${delay}s`}>
        <path d="M-6 20l1 8M6 20l-1 8" stroke-width="2" />
        <path fill={fill} d="M-16 0a16 16 0 1 1 32 0c0 9 -8 14 -10 20h-12c-2 -6 -10 -11 -10 -20z" />
        <path stroke-width="2" d="M0 -16v36M-8 -14q-5 16 3 34M8 -14q5 16 -3 34" />
        <rect x="-5" y="28" width="10" height="7" rx="1.5" fill="var(--yellow-l)" />
      </g>
    </At>
  )
}

/** 四角星，一閃一閃。 */
function Spark({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <At x={x} y={y} s={s}>
      <path class="a-twinkle" style={`animation-delay:${delay}s`} fill="#fff" stroke-width="2" d="M0 -7l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2l5 -2z" />
    </At>
  )
}

function Flowers({ at, fill = 'var(--coral-l)' }: { at: [number, number, number][]; fill?: string }) {
  return (
    <g fill={fill} stroke-width="2">
      {at.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
    </g>
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
      <Sun x={336} y={46} />
      <Cloud x={40} y={30} s={1.3} />
      <Cloud x={216} y={96} delay={-6} />
      <Bird x={150} y={40} /><Bird x={176} y={52} delay={-1.2} />
      <Plane path="M-70 140Q190 -70 470 110" s={1.05} dur={12} still={[214, 40, -4]} />
      <Balloon x={72} y={96} fill="var(--coral)" />
      <Balloon x={176} y={108} s={0.6} fill="var(--yellow)" delay={-1.8} />
      <path fill="var(--green)" d="M-10 186Q70 110 160 150T410 120V186Z" />
      <path fill="var(--green-l)" d="M-10 186Q110 140 210 168T410 156V186Z" />
      {/* 小樹 */}
      <g fill="var(--green)">
        <path d="M40 184v-14" /><circle cx="40" cy="162" r="10" />
        <path d="M250 184v-10" /><circle cx="250" cy="168" r="8" />
        <path d="M372 184v-16" /><circle cx="372" cy="160" r="11" />
      </g>
      {/* 路標 */}
      <path d="M226 186v-40" />
      <path fill="var(--yellow)" d="M214 146h20l5 5l-5 5h-20z" />
      <path fill="#fff" d="M238 160h-20l-5 5l5 5h20z" />
      {/* 載著行李的小車 */}
      <g class="a-drive">
        <rect x="124" y="150" width="22" height="9" rx="2" fill="var(--yellow)" />
        <rect x="150" y="153" width="12" height="6" rx="2" fill="var(--mizu)" />
        <path fill="var(--coral)" d="M110 180v-12q0 -9 9 -9h44q8 0 12 8l5 13z" />
        <path fill="#fff" d="M122 164h14v8h-14zM142 164h13l4 8h-17z" stroke-width="2" />
        <circle cx="126" cy="182" r="7" fill="#fff" /><circle cx="164" cy="182" r="7" fill="#fff" />
      </g>
      <Flowers at={[[70, 180, 4], [84, 182, 3], [282, 180, 4], [196, 182, 3]]} />
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
      <Spark x={276} y={47} />
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
      <Flowers at={[[196, 180, 4], [214, 182, 3], [42, 180, 4]]} />
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
      <circle cx="326" cy="46" r="20" fill="var(--coral)" />
      <Cloud x={24} y={40} s={1.2} />
      <Cloud x={206} y={22} delay={-5} />
      <Bird x={250} y={58} /><Bird x={272} y={48} delay={-1.4} />
      <Plane path="M-60 104Q170 -50 460 70" s={0.9} dur={14} still={[120, 30, -14]} />
      {/* 富士山 */}
      <path fill="var(--mizu)" d="M36 186L160 70q10 -8 20 -3q10 -5 20 3L324 186Z" />
      <path fill="#fff" d="M131 97L160 70q10 -8 20 -3q10 -5 20 3L229 97l-13 -9l-12 11l-12 -11l-12 11l-12 -11l-12 11z" />
      {/* 山腳的五重塔 */}
      <g fill="var(--coral)">
        <path d="M222 100v-10" />
        <rect x="216" y="104" width="12" height="80" fill="var(--yellow-l)" />
        <path d="M206 108l16 -10l16 10zM204 128l18 -10l18 10zM202 148l20 -10l20 10zM200 168l22 -10l22 10z" />
      </g>
      {/* 新幹線：從左邊開進來，穿過畫面 */}
      <g class="a-pass">
        <path fill="#fff" d="M-170 182v-16q0 -8 8 -8h96q26 2 44 24z" />
        <path fill="var(--mizu)" d="M-170 172h134l8 6h-142z" stroke-width="2" />
        <path fill="var(--mizu-l)" stroke-width="2" d="M-160 162h14v6h-14zM-140 162h14v6h-14zM-120 162h14v6h-14zM-100 162h14v6h-14zM-78 162h16l8 6h-24z" />
      </g>
      {/* 鯉魚旗 */}
      <path d="M258 186v-84" />
      <g stroke-width="2">
        <path class="a-flag" fill="var(--coral)" d="M258 104h20l6 5l-6 5h-20z" />
        <path class="a-flag" style="animation-delay:-0.4s" fill="#fff" d="M258 120h18l5 5l-5 5h-18z" />
        <path class="a-flag" style="animation-delay:-0.8s" fill="var(--yellow)" d="M258 136h15l4 4l-4 4h-15z" />
      </g>
      {/* 鳥居 */}
      <g fill="var(--coral)">
        <rect x="306" y="122" width="10" height="64" />
        <rect x="358" y="122" width="10" height="64" />
        <rect x="300" y="134" width="74" height="8" />
        <path d="M290 108q47 -10 94 0v12q-47 -8 -94 0z" />
      </g>
      {/* 石燈籠 */}
      <g fill="var(--yellow-l)">
        <rect x="140" y="166" width="8" height="20" /><rect x="134" y="152" width="20" height="14" rx="2" />
        <path d="M130 152l14 -10l14 10z" />
        <circle class="a-twinkle" cx="144" cy="159" r="3" fill="var(--yellow)" stroke-width="1.5" />
      </g>
      {/* 櫻花樹 */}
      <path d="M72 186q-5 -30 6 -54" stroke-width="5" />
      <g class="a-sway" fill="var(--coral-l)">
        <circle cx="56" cy="124" r="22" />
        <circle cx="92" cy="118" r="20" />
        <circle cx="74" cy="100" r="19" />
      </g>
      <Petal x={110} y={96} delay={0} /><Petal x={132} y={84} delay={-1.6} /><Petal x={40} y={90} delay={-3.1} />
      <Petal x={150} y={110} delay={-4.2} /><Petal x={96} y={70} delay={-2.4} /><Petal x={186} y={120} delay={-0.8} />
      <Flowers at={[[24, 180, 4], [108, 182, 3], [340, 182, 3]]} />
    </Scene>
  )
}

function Island() {
  const still = reducedMotion()
  return (
    <Scene sky="var(--mizu-l)" ground="var(--yellow-l)">
      <Sun x={326} y={44} />
      <Cloud x={44} y={24} s={1.2} />
      <Cloud x={186} y={66} delay={-7} />
      <Bird x={236} y={40} /><Bird x={258} y={50} delay={-1} />
      <Plane path="M-60 96Q180 -40 460 60" s={0.9} dur={14} still={[150, 28, -10]} />
      {/* 遠方的小島與燈塔 */}
      <path fill="var(--green)" d="M330 130q26 -22 60 -6l14 6z" />
      <path fill="#fff" d="M364 122l3 -26h8l3 26z" />
      <path fill="var(--coral)" d="M366 96h10v-7h-10z" />
      <circle class="a-twinkle" cx="371" cy="92" r="2.4" fill="var(--yellow)" stroke-width="1.5" />
      {/* 海 */}
      <rect x="-4" y="128" width={W + 8} height="70" fill="var(--mizu)" />
      <path class="a-wave" stroke="#fff" d="M150 146h22M196 158h16M250 160h18M332 150h22M120 166h14M30 150h18" />
      {/* 跳出水面的海豚 */}
      {!still && (
        <g opacity="0">
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" {...motionPath('M168 150q26 -52 52 0')} keyPoints="0;1;1" keyTimes="0;0.3;1" calcMode="linear" />
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.04;0.26;0.3;1" />
          <path fill="var(--mizu-l)" d="M-16 2q8 -12 24 -8q6 2 10 6q-6 -1 -10 2q-12 4 -24 0z" />
          <path fill="var(--mizu-l)" d="M-2 -6q2 -7 8 -8q-2 5 0 9z" />
          <path fill="var(--mizu-l)" d="M-16 2l-7 -5l1 6l-2 5z" />
        </g>
      )}
      {/* 帆船 */}
      <g class="a-bob">
        <path fill="#fff" d="M286 132v-46l30 46z" />
        <path fill="var(--yellow)" d="M282 132v-34l-20 34z" />
        <path fill="var(--coral)" d="M254 136h70l-10 14h-50z" />
      </g>
      {/* 沙灘 */}
      <path fill="var(--yellow-l)" d="M-10 214V166q90 -22 190 0q90 16 230 -2V214Z" />
      {/* 沙堡 */}
      <g fill="var(--yellow)">
        <path d="M186 164v-12" /><path class="a-flag" fill="var(--coral)" stroke-width="2" d="M186 152h10l-3 4l3 4h-10z" />
        <path d="M166 186v-14h6v-6h6v6h4v-8h8v8h4v-6h6v6h6v14z" />
      </g>
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
      {/* 海灘球 */}
      <g class="a-bounce">
        <circle cx="42" cy="170" r="10" fill="#fff" />
        <path fill="var(--coral)" stroke-width="2" d="M42 160a10 10 0 0 1 8.700 5l-8.700 5z" />
        <path fill="var(--mizu)" stroke-width="2" d="M42 180a10 10 0 0 1 -8.700 -5l8.700 -5z" />
      </g>
      {/* 橫著走的螃蟹 */}
      <g class="a-drive fast">
        <path stroke-width="2" d="M240 176l-7 -4M240 180l-8 1M262 176l7 -4M262 180l8 1" />
        <ellipse cx="251" cy="177" rx="10" ry="7" fill="var(--coral)" />
        <circle cx="236" cy="168" r="3.4" fill="var(--coral)" stroke-width="2" /><circle cx="266" cy="168" r="3.4" fill="var(--coral)" stroke-width="2" />
        <circle cx="247" cy="174" r="1.2" fill="var(--ink)" /><circle cx="255" cy="174" r="1.2" fill="var(--ink)" />
      </g>
      {/* 遮陽傘與海星 */}
      <path d="M352 196v-40" />
      <path fill="var(--coral)" d="M322 160q30 -34 60 0z" />
      <path class="a-twinkle" fill="var(--coral-l)" stroke-width="2" d="M140 172l2.500 5l5.500 0.800l-4 3.800l1 5.400l-5 -2.600l-5 2.600l1 -5.400l-4 -3.800l5.500 -0.800z" />
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
      <circle cx="344" cy="38" r="16" fill="var(--yellow)" />
      <Cloud x={30} y={26} s={1.2} />
      <Cloud x={196} y={14} delay={-6} />
      <Spark x={104} y={40} s={0.8} /><Spark x={306} y={66} s={0.7} delay={-1.2} />
      <Plane path="M-60 92Q200 -46 460 64" s={0.85} dur={15} still={[130, 30, -10]} />
      <Balloon x={98} y={72} s={0.75} fill="var(--coral)" />
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
      {/* 行道樹與路燈 */}
      <g fill="var(--green)">
        <path d="M12 186v-16" /><circle cx="12" cy="162" r="10" />
        <path d="M238 186v-12" /><circle cx="238" cy="168" r="8" />
      </g>
      <path d="M336 186v-34q0 -6 -8 -6" /><circle class="a-twinkle" cx="326" cy="148" r="3.500" fill="var(--yellow)" stroke-width="2" />
      {/* 路上的電車：來回 */}
      <g class="a-drive">
        <path d="M218 164l8 -10h8" stroke-width="2" />
        <rect x="196" y="164" width="60" height="22" rx="5" fill="var(--coral)" />
        <path fill="#fff" d="M203 169h12v8h-12zM220 169h12v8h-12zM237 169h12v8h-12z" stroke-width="2" />
      </g>
      {/* 計程車：從左邊開進來，穿過畫面 */}
      <g class="a-pass fast">
        <path fill="var(--yellow)" d="M-70 184v-9q0 -4 4 -4h8l5 -8h20l7 8h8q5 0 5 5v8z" />
        <path fill="#fff" stroke-width="2" d="M-51 171l3 -5h15l4 5z" />
        <rect x="-44" y="159" width="8" height="4" rx="1" fill="#fff" stroke-width="1.5" />
        <circle cx="-56" cy="185" r="5" fill="#fff" /><circle cx="-26" cy="185" r="5" fill="#fff" />
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
