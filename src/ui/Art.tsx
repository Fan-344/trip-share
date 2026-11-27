// 各主題在總覽頂端的主圖。畫法：漸層天空、有光暈的太陽、一層層變淡的遠山、
// 正面看的建築（亮面加一塊暗面，沒有框線）、橘色樹冠的樹，前景是有倒影和波光的水面。
// class 以 a- 開頭的是動態效果（定義在 styles.css），使用者關閉動態效果時會全部停下。
import { createContext, toChildArray, type ComponentChildren } from 'preact'
import { useContext, useLayoutEffect, useRef } from 'preact/hooks'
import type { ThemeId } from '../themes'
import type { WxKind } from '../weather'

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

/**
 * 主圖現在是白天、黃昏還是夜晚（照目的地的當地時間，見 src/time.ts 的 phaseAt）。
 * 每張主圖共用：黃昏在整張圖上蓋一層暖色；夜晚天空變暗、在太陽的位置畫彎月和星星（在所有景物後面），景物整組調暗；
 * 會亮的燈（C.glow 和樓房亮著的窗）另外複製一份畫在暗色層上面，所以燈不會跟著變暗。
 * 其他顏色的東西要在夜裡亮，就加 data-glow：值是入夜後要換成的顏色，"keep" 是照原本的顏色（例如打燈的建築）。
 */
export type Phase = 'day' | 'dusk' | 'night'
const PhaseCtx = createContext<Phase>('day')

/** 會亮的燈的顏色：用這兩種顏色畫的東西，入夜後畫在暗色層上面。 */
const LIGHTS = [C.glow, '#fde9b0']

/** 夜晚的星星：位置固定，散在天空上半部。 */
const STARS: [number, number, number][] = [
  [24, 20, 0], [62, 36, -0.8], [104, 14, -1.6], [138, 44, -0.4], [176, 22, -2], [214, 50, -1.1],
  [250, 16, -0.3], [288, 40, -1.8], [322, 24, -0.9], [360, 46, -1.4], [384, 14, -0.6], [86, 64, -2.2], [196, 74, -0.7], [340, 80, -1.9],
]

/**
 * 把會亮的燈複製到最上層。原本的燈留在原地（會被暗色層蓋暗），複製的那份照它在畫面上的實際位置放上去：
 * - 在水面倒影裡的不複製（倒影本來就淡）。
 * - 燈如果在一個會動的群組裡（例如往上飄的天燈），整個群組一起複製，並對齊動畫的進度，才會跟原本的一起動。
 */
function liftLights(svg: SVGSVGElement, layer: SVGGElement): void {
  layer.replaceChildren()
  const base = svg.getScreenCTM()
  if (!base) return
  const toSvg = base.inverse()
  const done = new Set<Element>()
  const NS = 'http://www.w3.org/2000/svg'
  for (const el of svg.querySelectorAll([...LIGHTS.map((c) => `[fill="${c}"]`), '[data-glow]'].join(','))) {
    if (layer.contains(el) || el.closest('[clip-path], .night-sky')) continue
    // 往上找會動的群組（class 以 a- 開頭）或整組打燈的群組（data-glow="keep"）；有的話整組複製
    const moving = el.parentElement?.closest('[class^="a-"], [class*=" a-"]')
    // 整組打燈只亮幾成（data-lit）時，裡面自己有指定亮燈顏色的（例如窗）另外全亮複製一份
    const own = el.getAttribute('data-glow')
    const group = el.closest('g[data-glow="keep"]')
    const lit = own && own !== 'keep' && group?.hasAttribute('data-lit') ? null : group
    const target = moving && svg.contains(moving) ? moving : lit ?? el
    if (done.has(target)) continue
    done.add(target)
    const parent = target.parentElement as unknown as SVGGraphicsElement | null
    const ctm = parent?.getScreenCTM?.()
    if (!ctm) continue
    const m = toSvg.multiply(ctm)
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`)
    const copy = target.cloneNode(true) as SVGElement
    // 整組打燈的可以用 data-lit 指定亮幾成（0–1），沒寫就是全亮
    const lit2 = copy.getAttribute('data-lit')
    if (lit2) copy.setAttribute('opacity', lit2)
    for (const part of [copy, ...copy.querySelectorAll('[data-glow]')]) {
      const glow = part.getAttribute('data-glow')
      if (glow && glow !== 'keep') {
        part.setAttribute('fill', glow)
        part.removeAttribute('opacity')
      }
    }
    g.appendChild(copy)
    layer.appendChild(g)
    // 讓複製的那份動畫跟原本的同步
    const src = (target as unknown as Element).getAnimations?.({ subtree: true }) ?? []
    const dst = copy.getAnimations?.({ subtree: true }) ?? []
    dst.forEach((a, i) => { if (src[i]) a.currentTime = src[i].currentTime })
  }
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

/** 整張圖的外框與漸層天空。id 是這張圖的漸層名稱前綴，同一頁有兩張圖時不會互相打架。黃昏、夜晚在最上面蓋一層色。 */
function Scene({ id, sky, children }: { id: string; sky: string[]; children: ComponentChildren }) {
  const phase = useContext(PhaseCtx)
  const wx = useContext(WxCtx)
  const gloom = GLOOM[wx]
  const svg = useRef<SVGSVGElement>(null)
  const lights = useRef<SVGGElement>(null)
  useLayoutEffect(() => {
    if (!svg.current || !lights.current) return
    if (phase === 'day') lights.current.replaceChildren()
    else liftLights(svg.current, lights.current)
  }, [phase, id, wx])
  // 月亮出現在這張圖太陽的位置（太陽是 children 裡的 Sun）；被建築擋住就擋住
  const sun = toChildArray(children).find((c) => typeof c === 'object' && c.type === Sun)
  const moon = sun && typeof sun === 'object' ? (sun.props as unknown as { x: number; y: number; r: number }) : null
  return (
    <svg ref={svg} class={`art ${phase}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          {sky.map((c, i) => <stop key={i} offset={i / (sky.length - 1)} stop-color={c} />)}
        </linearGradient>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stop-color="#fff" stop-opacity="0.8" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        {/* 黃昏：上面偏粉紫、下面偏橘；夜晚：上面深藍、下面靛藍 */}
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c77fa0" stop-opacity="0.45" /><stop offset="1" stop-color="#f0a070" stop-opacity="0.3" />
        </linearGradient>
        <linearGradient id={`${id}n`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a3168" stop-opacity="0.82" /><stop offset="0.6" stop-color="#3d4780" stop-opacity="0.66" /><stop offset="1" stop-color="#4a5690" stop-opacity="0.56" />
        </linearGradient>
      </defs>
      <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={`url(#${id}s)`} />
      {/* 陰天以後：天空蓋一層灰、飄著大片的雲（夜晚會跟天空一起變暗） */}
      {gloom && <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={gloom[0]} opacity={gloom[1] + 0.15} />}
      {wx !== 'clear' && <WxClouds kind={wx} />}
      {phase === 'night' ? (
        <>
          {/* 夜晚：天空先變暗，星星和月亮畫在天空上、所有東西後面；景物整組調暗 */}
          <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={`url(#${id}n)`} style="mix-blend-mode:multiply" />
          {!gloom && (
            <g class="night-sky">
              {STARS.map(([x, y, d]) => <Twinkle key={`${x}`} x={x} y={y} delay={d} />)}
              {moon && <Moon id={id} {...moon} />}
            </g>
          )}
          {wx === 'storm' && <Bolts />}
          <filter id={`${id}f`} color-interpolation-filters="sRGB">
            <feColorMatrix values="0.52 0 0 0 0  0 0.54 0 0 0  0 0 0.68 0 0  0 0 0 1 0" />
          </filter>
          <g filter={`url(#${id}f)`}>{children}</g>
        </>
      ) : (
        <>
          {wx === 'storm' && <Bolts />}
          {children}
          {phase === 'dusk' && (
            <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={`url(#${id}d)`} style="mix-blend-mode:multiply" />
          )}
          {/* 陰天以後景物也暗一點（夜晚本來就暗，不再加） */}
          {gloom && <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={gloom[0]} opacity={gloom[1] * 0.6} style="mix-blend-mode:multiply" />}
        </>
      )}
      {wx === 'fog' && <Fog id={id} night={phase === 'night'} />}
      <g ref={lights} class="lights" />
      {/* 雨雪畫在最上面，不放進夜晚調暗的那一層，動起來才不會讓整張圖一直重畫 */}
      {(wx === 'rain' || wx === 'storm' || wx === 'mix') && <Rain n={wx === 'storm' ? 54 : wx === 'mix' ? 22 : 38} heavy={wx === 'storm'} />}
      {(wx === 'snow' || wx === 'mix') && <Snow n={wx === 'mix' ? 18 : 34} />}
      {wx === 'storm' && <rect class="art-flash" x="-4" y="-4" width={W + 8} height={H + 8} fill="#fff" opacity="0" />}
      {wx === 'storm' && <rect class="art-flash late" x="-4" y="-4" width={W + 8} height={H + 8} fill="#fff" opacity="0" />}
    </svg>
  )
}

/* ---------- 天氣 ---------- */

/**
 * 主圖的天氣（跟天氣預報用同一組分類，見 src/weather.ts）。晴天和晴時多雲看得到太陽或月亮；
 * 其餘是陰天：天空和景物蓋一層灰（顏色、濃淡）、太陽月亮星星都不畫，再依天氣加雨、雪、霧、閃電。
 */
const WxCtx = createContext<WxKind>('clear')
const GLOOM: Partial<Record<WxKind, [string, number]>> = {
  cloudy: ['#b7bdcd', 0.4], fog: ['#c9ccd6', 0.45], rain: ['#9aa2b8', 0.5],
  snow: ['#c6cbd8', 0.4], mix: ['#a3aabd', 0.5], storm: ['#79819b', 0.6],
}

/** 天上的雲：晴時多雲是兩朵白雲；陰天以後是一整排灰白的大雲，下雨更灰。 */
function WxClouds({ kind }: { kind: WxKind }) {
  const puff = 'M0 14a8 8 0 0 1 8-8a12 12 0 0 1 22-2a9 9 0 0 1 12 10z'
  if (kind === 'partly') {
    return (
      <g fill="#fff" opacity="0.88">
        {([[-6, 30, 1.7], [86, 8, 2.2], [160, 46, 1.3], [236, 14, 1.9], [330, 40, 1.5], [44, 70, 1.1], [290, 78, 1]] as const).map(([x, y, s], i) => (
          <At key={i} x={x} y={y} s={s}><path class="a-drift" style={`animation-delay:${-i * 1.9}s`} d={puff} /></At>
        ))}
      </g>
    )
  }
  const [back, front] = CEILING[kind] ?? CEILING.cloudy!
  return (
    <g>
      <path class="a-drift" style="animation-delay:-3s" fill={back} d={ceiling(56, [34, 26, 40, 30, 36, 28, 38])} />
      <path class="a-drift" fill={front} d={ceiling(38, [28, 36, 24, 32, 30, 38, 26])} />
    </g>
  )
}

/** 陰天的雲層顏色：[後面那層, 前面那層]。下雨更灰、雷雨最暗、下雪偏白。 */
const CEILING: Partial<Record<WxKind, [string, string]>> = {
  cloudy: ['#d3d6df', '#e9ebf0'], fog: ['#d9dbe2', '#eceef2'],
  rain: ['#aab0bf', '#c5c9d4'], mix: ['#b2b7c5', '#cdd1db'],
  storm: ['#8b91a4', '#a9afbf'], snow: ['#dfe2e9', '#f3f4f7'],
}

/** 蓋住天空頂端的一整片雲：上緣在畫面外，下緣是一個個往下鼓的圓弧。base 是下緣的高度，bumps 是每個圓弧的寬度的一半。 */
function ceiling(base: number, bumps: number[]): string {
  let d = `M-40 -4H440V${base}`
  let x = 440
  for (let i = 0; x > -40; i++) {
    const r = bumps[i % bumps.length]
    x -= r * 2
    d += `A${r} ${r * 0.8} 0 0 1 ${x} ${base}`
  }
  return `${d}V-4z`
}

/** 0 到 1 之間、看起來亂但每次都一樣的數（第 i 顆的第 k 個屬性），雨雪才不會排成規律的格子。 */
function rnd(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 一顆水滴：上面尖、下面圓。原點在圓的中心，高約 8。 */
const DROP = 'M0 -5.500Q2.400 -1.600 2.400 0.600A2.400 2.400 0 0 1 -2.400 0.600Q-2.400 -1.600 0 -5.500z'

/**
 * 雨：一顆顆水滴，順著落下的方向微微斜，用動畫從上往下落（減少動態效果時停在原位）。
 * 每一滴的位置、大小、深淺、落下的速度和起點都不一樣。
 * 動畫放在外層、位置和斜度放在內層，兩個 transform 才不會互相蓋掉。
 */
function Rain({ n, heavy }: { n: number; heavy: boolean }) {
  const base = heavy ? 1.1 : 1.5
  return (
    <g fill="#eef5fb">
      {Array.from({ length: n }, (_, i) => {
        const dur = base * (0.75 + rnd(i, 4) * 0.5)
        const s = 0.85 + rnd(i, 3) * 0.6
        return (
          <g key={i} class="art-rain" style={`animation-duration:${dur.toFixed(2)}s;animation-delay:${(-rnd(i, 5) * dur).toFixed(2)}s`}>
            <path d={DROP} opacity={(0.5 + rnd(i, 6) * 0.4).toFixed(2)}
              transform={`translate(${(rnd(i, 1) * 430 - 10).toFixed(1)} ${(rnd(i, 2) * 270).toFixed(1)}) rotate(15) scale(${s.toFixed(2)})`} />
          </g>
        )
      })}
    </g>
  )
}

/** 雷雨的閃電：天上兩道矮胖、圓角的閃電，跟整張圖的閃光同時亮（錯開時間）。 */
function Bolts() {
  const bolt = 'M9 0h15l-6 14h10L7 42l5 -19H2z'
  return (
    <g fill="#fff3b8" stroke="#fff3b8" stroke-width="2.500" stroke-linejoin="round">
      <At x={286} y={34} s={1.3}><path class="art-bolt" opacity="0" d={bolt} /></At>
      <At x={84} y={44} s={1}><path class="art-bolt late" opacity="0" d={bolt} /></At>
    </g>
  )
}

/** 雪：大小不一的白點，慢慢左右飄著落下；位置、速度、起點都打散。 */
function Snow({ n }: { n: number }) {
  return (
    <g fill="#fff">
      {Array.from({ length: n }, (_, i) => {
        const dur = 7 + rnd(i, 4) * 5
        return (
          <circle key={i} class="art-snow" style={`animation-duration:${dur.toFixed(1)}s;animation-delay:${(-rnd(i, 5) * dur).toFixed(1)}s`}
            cx={rnd(i, 1) * 420 - 10} cy={rnd(i, 2) * 270} r={1.2 + rnd(i, 3) * 1.4} opacity={(0.7 + rnd(i, 6) * 0.3).toFixed(2)} />
        )
      })}
    </g>
  )
}

/**
 * 霧：整片從上往下越來越濃的白紗，地平線一帶最濃，遠處的東西就淡掉；
 * 再加兩條兩端淡掉的細霧帶慢慢飄。
 */
function Fog({ id, night }: { id: string; night: boolean }) {
  const c = night ? '#b9bfd6' : '#f4f4f8'
  return (
    <g opacity={night ? 0.6 : 1}>
      <linearGradient id={`${id}fv`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color={c} stop-opacity="0.1" />
        <stop offset="0.55" stop-color={c} stop-opacity="0.55" />
        <stop offset="0.75" stop-color={c} stop-opacity="0.6" />
        <stop offset="1" stop-color={c} stop-opacity="0.3" />
      </linearGradient>
      <linearGradient id={`${id}fb`}>
        <stop offset="0" stop-color={c} stop-opacity="0" /><stop offset="0.5" stop-color={c} stop-opacity="0.7" /><stop offset="1" stop-color={c} stop-opacity="0" />
      </linearGradient>
      <rect x="-4" y="-4" width={W + 8} height={H + 8} fill={`url(#${id}fv)`} />
      <rect class="a-drift" x="-60" y="176" width="300" height="8" rx="4" fill={`url(#${id}fb)`} />
      <rect class="a-drift" style="animation-delay:-4s" x="170" y="204" width="280" height="7" rx="3.5" fill={`url(#${id}fb)`} />
    </g>
  )
}

/** 彎月：一個圓被右上方另一個圓切掉一塊。夜晚由 Scene 畫在太陽的位置，在所有景物後面。 */
function Moon({ id, x, y, r }: { id: string; x: number; y: number; r: number }) {
  const m = r * 0.7
  return (
    <g class="a-float slow">
      <circle cx={x} cy={y} r={m * 2.6} fill={`url(#${id}g)`} opacity="0.35" />
      <mask id={`${id}m`}>
        <circle cx={x} cy={y} r={m} fill="#fff" />
        <circle cx={x + m * 0.55} cy={y - m * 0.3} r={m * 0.9} fill="#000" />
      </mask>
      <circle cx={x} cy={y} r={m} fill={C.glow} mask={`url(#${id}m)`} />
    </g>
  )
}

/** 太陽；夜晚不畫（換成 Scene 畫的月亮）。 */
function Sun({ id, x, y, r, fill = '#fff3d0' }: { id: string; x: number; y: number; r: number; fill?: string }) {
  const phase = useContext(PhaseCtx)
  const wx = useContext(WxCtx)
  if (phase === 'night' || GLOOM[wx]) return null
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


/* ---------- 會動的人和動物 ---------- */
// 都沒有五官，只用色塊。全部站在原地，只有小動作（搧耳朵、搖尾巴、傘輕輕晃），像一幅會動的畫。預設面向右邊。

const SKIN = '#f1c9a8'

/**
 * 前景的一小塊岸邊：貼著畫面左下角（right 是右下角），上面長幾根草。
 * 離鏡頭最近的角色站在這裡，畫得比遠處的大很多，前後才有距離。
 */
function Bank({ fill, right = false }: { fill: string; right?: boolean }) {
  return (
    <g transform={right ? `translate(${W} 0) scale(-1 1)` : undefined}>
      <path fill={fill} d="M-4 264V232q36 -14 86 -6q40 6 58 38z" />
      <path fill="none" stroke={C.leafL} stroke-width="1.6" stroke-linecap="round" d="M104 246l-2 -7M108 247l1 -8M112 249l4 -6M10 229l-1 -7M14 229l2 -7" />
    </g>
  )
}

/** 把角色放在 (x, y)，腳底貼著那一點；rev 是面向左邊。 */
function Stand({ x, y, s = 1, rev = false, children }: { x: number; y: number; s?: number; rev?: boolean; children: ComponentChildren }) {
  return <g transform={`translate(${x} ${y}) scale(${rev ? -s : s} ${s})`}>{children}</g>
}

/** 停在半空的海鷗：拍著翅膀，上下飄。 */
function Gull({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g class="a-float" style={`animation-delay:${delay}s`}><path class="a-wing" fill="#fff" d="M-9 0q4 -7 9 -2q5 -5 9 2q-5 -3 -9 2q-4 -5 -9 -2z" /></g>
    </g>
  )
}

/** 站著的人。kind：一般、撐傘、穿長裙、戴斗笠。原點在腳底。 */
function Person({ coat, hair = C.trunk, kind = 'plain', wave = false }: { coat: string; hair?: string; kind?: 'plain' | 'umbrella' | 'skirt' | 'hat'; wave?: boolean }) {
  return (
    <g class="a-breathe">
      {kind !== 'skirt' && (
        <g fill={C.trunk}>
          <rect x="-3" y="-8" width="2.4" height="8" rx="1.2" />
          <rect x="0.600" y="-8" width="2.4" height="8" rx="1.2" />
        </g>
      )}
      {kind === 'skirt' ? <path class="a-swish" fill={coat} d="M-3 -15h6l5 14q-8 3 -16 0z" /> : <path fill={coat} d="M-3.500 -18h7l1.500 11h-10z" />}
      {/* 舉起來揮的手 */}
      {wave && <path class="a-hi" fill="none" stroke={coat} stroke-width="2.4" stroke-linecap="round" d="M3 -16l5 -8" />}
      {kind === 'skirt' && <path fill={C.cream} d="M-3.400 -19h6.800l1 5.500h-8.800z" />}
      <circle cx="0" cy="-21.500" r="3.200" fill={SKIN} />
      <path fill={hair} d="M-3.400 -22a3.400 3.400 0 0 1 6.800 0q-3.400 -1.600 -6.800 0z" />
      {kind === 'hat' && <path fill={C.glow} d="M-8 -22.500L0 -28.500L8 -22.500z" />}
      {kind === 'umbrella' && (
        <g>
          <path fill="none" stroke={C.trunk} stroke-width="0.8" d="M4 -12v-22" />
          <g class="a-rock"><path fill={C.coral} d="M-8 -32q12 -12 24 0z" /><path fill={C.coralD} d="M4 -38q12 0 12 6h-12z" /></g>
        </g>
      )}
    </g>
  )
}

/** 小狗：站著搖尾巴。原點在腳底。 */
function Dog({ fill = '#d9a47e' }: { fill?: string }) {
  return (
    <g class="a-breathe">
      <g fill={fill}>
        <rect x="-6" y="-5" width="1.8" height="5" rx="0.9" /><rect x="-3.500" y="-5" width="1.8" height="5" rx="0.9" />
        <rect x="3" y="-5" width="1.8" height="5" rx="0.9" /><rect x="5.500" y="-5" width="1.8" height="5" rx="0.9" />
        <rect x="-7" y="-10" width="15" height="6" rx="3" />
        <circle cx="9" cy="-11" r="3.200" /><rect x="11" y="-11" width="3.500" height="2.200" rx="1" />
        <path class="a-wag" d="M-7 -8q-4 -3 -3 -7q2 3 4 4z" />
      </g>
      <path fill={C.trunk} d="M7.500 -13.500l1.500 -3l1.500 3.500z" />
    </g>
  )
}

/** 停著的腳踏車。原點在車子正下方的地面。 */
function Bike() {
  return (
    <g>
      {[-9, 9].map((x) => (
        <g key={x} transform={`translate(${x} -6)`}>
          <g>
            <circle r="6" fill="none" stroke={C.trunk} stroke-width="1.3" /><path fill="none" stroke={C.trunk} stroke-width="0.6" d="M-6 0h12M0 -6v12" />
          </g>
        </g>
      ))}
      <path fill="none" stroke={C.coral} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M-9 -6l5 -9h9l4 9M-4 -15l5 9l4 -9M5 -15l-1 -4h3M-6 -16h4" />
    </g>
  )
}

/** 大象：站著搧耳朵、擺鼻子和尾巴，背上披一塊毯子。原點在腳底。 */
function Elephant() {
  const body = '#b7a4cc'
  const dark = '#a48fbd'
  return (
    <g class="a-breathe">
      <g fill={dark}><rect x="-13" y="-10" width="5" height="10" rx="2" /><rect x="6" y="-10" width="5" height="10" rx="2" /></g>
      <g fill={body}><rect x="-8" y="-10" width="5" height="10" rx="2" /><rect x="11" y="-10" width="5" height="10" rx="2" /></g>
      <path class="a-swish" fill="none" stroke={dark} stroke-width="1.5" stroke-linecap="round" d="M-16 -18q-4 2 -3 8" />
      <path fill={body} d="M-16 -12q0 -14 14 -15h12q10 0 12 10v8q-2 4 -8 3h-24q-6 0 -6 -6z" />
      <path fill={C.coral} d="M-8 -27h14v7h-14z" /><rect x="-8" y="-21" width="14" height="2" fill={C.gold} />
      <circle cx="19" cy="-22" r="8" fill={body} />
      <path class="a-trunk" fill="none" stroke={body} stroke-width="4" stroke-linecap="round" d="M25 -20q5 6 2 16" />
      <ellipse class="a-flap" cx="14" cy="-22" rx="5" ry="7" fill={C.pink} />
      <circle cx="22" cy="-24" r="1" fill={C.trunk} />
    </g>
  )
}


/** 小螃蟹：橫著來回走。 */
function Crab() {
  return (
    <g class="a-drive fast">
      <path fill="none" stroke={C.coralD} stroke-width="1" stroke-linecap="round" d="M-5 0l-3 3M-3 1l-2 3M5 0l3 3M3 1l2 3M-5 -3l-3 -3M5 -3l3 -3" />
      <ellipse rx="6" ry="4" fill={C.coral} /><circle cx="-8.500" cy="-6.500" r="2" fill={C.coral} /><circle cx="8.500" cy="-6.500" r="2" fill={C.coral} />
    </g>
  )
}


/** 躍出水面的海豚：沿弧線跳一下，隔一陣子再跳。waterY 以下的部分看不到。 */
function Dolphin({ id, path, waterY, dur = 8 }: { id: string; path: string; waterY: number; dur?: number }) {
  if (reducedMotion()) return null
  return (
    <g clip-path={`url(#${id}d)`}>
      <clipPath id={`${id}d`}><rect x="-4" y="-4" width={W + 8} height={waterY + 6} /></clipPath>
      <g>
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" {...motionPath(path)} calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.3;1" />
        <path fill="#7fa9bf" d="M-12 0q8 -8 20 -3q4 -5 6 -5q-1 4 -1 7q-10 6 -21 3l-5 4q0 -4 1 -6z" />
        <path fill="#dceaf0" d="M-6 2q8 2 14 -1q-6 4 -14 1z" />
      </g>
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
          <path fill={C.coralD} data-glow={C.glow} d={`M${x - 3.5} -20v-10a3.500 3.500 0 0 1 7 0v10z`} />
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
      {/* 寺前站著一頭大象，搧著耳朵 */}
      {/* 遠處：寺前兩個小小的僧人，襯出佛寺的大小 */}
      <Stand x={150} y={190} s={0.7}><Person coat={C.orange} /></Stand><Stand x={196} y={190} s={0.7} rev><Person coat={C.orange} /></Stand>
      <Water id="th" y={198} top="#9cd6cd" bottom="#d3efe3" land={land} />
      {/* 前景：岸邊一頭大象，離鏡頭最近所以最大 */}
      <Bank fill="#e9bd92" /><Stand x={60} y={254} s={1.7}><Elephant /></Stand>
      <Krathong x={176} y={238} /><Krathong x={318} y={222} delay={-1.5} />
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
            <rect x="-2" y={top + 5} width="4" height="9" fill={C.coralD} data-glow={C.glow} />
            <rect x={-w * 0.4} y={top + 5} width="3" height="4" fill={C.coralD} data-glow={C.glow} /><rect x={w * 0.4 - 3} y={top + 5} width="3" height="4" fill={C.coralD} data-glow={C.glow} />
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
      {/* 岸邊站著一個撐紅傘的人 */}
      <Stand x={138} y={199} s={0.7}><Person coat="#e98fa3" /></Stand>
      <Water id="jp" y={200} top="#a6d8d5" bottom="#def2e9" land={land} />
      {/* 前景：岸邊一個撐紅傘的人 */}
      <Bank fill="#eec3a8" /><Stand x={56} y={254} s={2.1}><Person coat="#7f8fb5" kind="umbrella" /></Stand>
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
      {/* 遠處有海豚躍出水面 */}
      <Dolphin id="is" path="M64 176Q92 110 120 176" waterY={152} />
      {/* 水上屋和棧道：站在水裡，所以畫在水面之後 */}
      <g fill="#c98f6b">
        <rect x="262" y="176" width="146" height="2.500" />
        {[300, 324, 372, 396].map((x) => <rect key={x} x={x} y="178" width="1.6" height="12" />)}
      </g>
      <At x={270} y={198} s={1.45}><Bungalow /></At>
      <At x={348} y={196} s={1.1}><Bungalow /></At>
      {/* 棧道上的小燈 */}
      {[312, 360, 400].map((x) => <Lamp key={x} x={x} y={176} h={9} />)}
      {/* 前景的沙灘 */}
      <path fill="#fbe7c0" d="M-4 264V222Q70 200 150 222Q220 242 300 250Q350 254 404 246V264z" />
      <path fill="#fff" opacity="0.6" d="M-4 226Q70 202 150 224Q220 244 300 252Q350 256 404 248v-3Q350 252 300 248Q220 240 150 220Q70 198 -4 222z" />
      <At x={44} y={236} s={1.25}><Palm /></At>
      <At x={96} y={246} s={0.9}><Palm flip /></At>
      {/* 沙灘上有人戴著草帽揮手，旁邊一隻小螃蟹 */}
      <Stand x={190} y={250} s={1.9}><Person coat={C.coral} kind="hat" wave /></Stand>
      <At x={256} y={254} s={1.5}><Crab /></At>
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
        // 白天沒亮的窗，晚上也有一半會亮
        const late = !on && (r + c) % 2 === 0
        return <rect key={i} x={x + pad + c * 8} y={base - h + 7 + r * 11} width="4" height="6" rx="1" fill={on ? '#fde9b0' : '#fff'} opacity={on ? 1 : 0.35} data-glow={late ? '#fde9b0' : undefined} />
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
      {/* 河岸上有人牽著狗看風景 */}
      
      <Stand x={282} y={205} s={0.75} rev><Person coat={C.gold} /></Stand><Stand x={150} y={205} s={0.75}><Person coat={C.pink} /></Stand>
      <Water id="ct" y={206} top="#a9c6d9" bottom="#e6dcec" land={land} />
      {/* 前景：對岸有人牽著狗看夜景 */}
      <Bank fill="#dba98f" /><Stand x={48} y={254} s={2}><Person coat={C.leaf} /></Stand><Stand x={88} y={254} s={2}><Dog fill={C.cream} /></Stand>
      <At x={306} y={238} s={0.45}><Sailboat /></At>
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
      {/* 有人停下腳踏車，站在草地上看熱氣球 */}
      <Stand x={286} y={186} s={0.7}><Person coat={C.coral} /></Stand>
      <Water id="ge" y={212} top="#8fd0c8" bottom="#d3efe3" land={land} />
      {/* 前景：湖邊有人停下腳踏車，朝熱氣球揮手 */}
      <Bank fill="#7fbd9a" /><Stand x={40} y={254} s={2}><Bike /></Stand><Stand x={92} y={254} s={2}><Person coat={C.gold} wave /></Stand>
      <At x={226} y={240} s={0.5}><Sailboat /></At>
    </Scene>
  )
}

/* ---------- 韓國 ---------- */

const SLATE = '#6f8093'
const SLATE_D = '#5c6c7f'
const DAN = '#c9584a'
const DAN_D = '#b04a3e'
const JADE = '#5fa39a'

/** 寬屋簷的瓦頂：兩端上翹、一條屋脊、瓦片橫紋，右半邊是暗面。 */
function HipRoof({ base, half, h }: { base: number; half: number; h: number }) {
  const k = half
  return (
    <g>
      <path fill={SLATE} d={`M${-k - 10} ${base}q9 -2 15 ${-h}h${2 * k - 10}q6 ${h - 2} 15 ${h}z`} />
      <path fill={SLATE_D} d={`M0 ${base}v${-h}h${k - 5}q6 ${h - 2} 15 ${h}z`} />
      <rect x={-k + 5} y={base - h - 2} width={2 * k - 10} height="3" rx="1.5" fill={C.cream} />
      <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.3" d={`M${-k} ${base - h * 0.35}h${2 * k}M${-k + 3} ${base - h * 0.7}h${2 * k - 6}`} />
      <path fill={C.cream} d={`M${-k - 10} ${base}q-4 -5 0 -9q1 4 5 6zM${k + 10} ${base}q4 -5 0 -9q-1 4 -5 6z`} />
    </g>
  )
}

/** 兩層樓的宮殿樓閣：一樓一排紅柱、簷下的彩繪、二樓的格子窗。原點在地面正中。 */
export function Palace() {
  return (
    <g>
      <rect x="-62" y="-6" width="124" height="6" fill={C.creamD} />
      <rect x="-56" y="-13" width="112" height="7" fill={C.cream} />
      <path fill={C.creamD} d="M-10 0h20l-3 -13h-14z" />
      <path fill="none" stroke={C.cream} stroke-width="0.8" d="M-9 -4h18M-8 -8h16" />
      <rect x="-50" y="-44" width="100" height="31" fill="#f1d9c4" opacity="0.55" />
      {[-50, -36, -22, -8, 4, 18, 32, 46].map((x) => <rect key={x} x={x} y="-44" width="4" height="31" fill={x > 0 ? DAN_D : DAN} />)}
      <rect x="-54" y="-50" width="108" height="6" fill={JADE} />
      <g fill={C.gold}>{[-45, -30, -15, 0, 15, 30, 45].map((x) => <circle key={x} cx={x} cy="-47" r="1.3" />)}</g>
      <HipRoof base={-50} half={60} h={14} />
      <rect x="-40" y="-84" width="80" height="20" fill={DAN} /><rect x="4" y="-84" width="36" height="20" fill={DAN_D} />
      {[-34, -20, -6, 8, 22].map((x) => (
        <g key={x}>
          <rect x={x} y="-80" width="10" height="12" fill={C.cream} data-glow={C.glow} />
          <path fill="none" stroke={DAN} stroke-width="0.7" d={`M${x + 5} -80v12M${x} -74h10`} />
        </g>
      ))}
      <rect x="-44" y="-90" width="88" height="6" fill={JADE} />
      <g fill={C.gold}>{[-36, -24, -12, 0, 12, 24, 36].map((x) => <circle key={x} cx={x} cy="-87" r="1.3" />)}</g>
      <HipRoof base={-90} half={50} h={18} />
    </g>
  )
}

function Korea() {
  const land = () => (
    <g>
      <path fill="#f1cfb4" d="M-4 200v-10q104 -6 204 -4t204 -2v16z" />
      {/* 主角是池邊的樓閣，兩側是秋天的楓樹 */}
      <At x={200} y={192} s={1.3}><Palace /></At>
      <Tree x={44} y={192} s={1.2} fill={C.coral} light="#f29a84" />
      <Tree x={82} y={193} s={0.75} fill={C.gold} light="#fbdc8f" />
      <Tree x={356} y={192} s={1.15} fill={C.orange} light={C.orangeL} />
    </g>
  )
  return (
    <Scene id="kr" sky={['#f9d2c4', '#f6c6c2', '#f3e0d2', '#d9ebe2']}>
      <Sun id="kr" x={84} y={62} r={22} />
      <Cloud x={262} y={26} s={1.2} />
      <path fill="#cdb9d3" d="M-4 200V136Q40 92 86 120Q120 70 170 112Q220 84 262 118Q310 86 350 116Q380 104 404 120V200z" />
      {/* 山上的塔 */}
      <rect x="326" y="64" width="3" height="36" fill={C.cream} /><ellipse cx="327.500" cy="78" rx="7" ry="3.500" fill={C.coral} />
      <rect x="327" y="50" width="1.200" height="14" fill={C.trunk} />
      <path fill="#e3b5ad" d="M-4 200V168Q70 140 140 160Q210 138 280 164Q340 148 404 166V200z" />
      <Bird x={300} y={56} /><Bird x={282} y={66} delay={-1.2} />
      {land()}
      {/* 兩個穿韓服的人站在池邊 */}
      <Stand x={184} y={199} s={0.7}><Person coat={C.cream} /></Stand>
      <Water id="kr" y={200} top="#9fd3cc" bottom="#d6efe4" land={land} />
      {/* 前景：池邊兩個穿韓服的人，一個揮著手 */}
      <Bank fill="#eac3a6" right /><Stand x={322} y={254} s={2}><Person coat="#e98fa3" kind="skirt" /></Stand><Stand x={356} y={254} s={2} rev><Person coat={JADE} kind="skirt" wave /></Stand>
      {/* 池裡的荷葉 */}
      <g fill={C.leafL}><ellipse cx="60" cy="234" rx="12" ry="3.500" /><ellipse cx="84" cy="242" rx="8" ry="2.500" /></g>
      <circle cx="64" cy="231" r="2.600" fill={C.pink} />
    </Scene>
  )
}

/* ---------- 港澳 ---------- */

/** 紅帆的中式帆船：三面有橫桿的扇形帆。原點在水面正中。 */
export function Junk() {
  const sail = (x: number, w: number, h: number, top: number) => (
    <g>
      <rect x={x + w * 0.45} y={top - 6} width="2" height={-top + 2} fill={C.trunk} />
      <path fill={C.coral} d={`M${x} ${top + h}q${-w * 0.12} ${-h * 0.5} ${w * 0.15} ${-h}h${w * 0.7}q${w * 0.2} ${h * 0.5} ${w * 0.15} ${h}z`} />
      <path fill={C.coralD} d={`M${x + w * 0.5} ${top}h${w * 0.35}q${w * 0.2} ${h * 0.5} ${w * 0.15} ${h}h${-w * 0.5}z`} />
      <path fill="none" stroke={C.cream} stroke-width="0.8" opacity="0.6" d={[0.25, 0.5, 0.75].map((t) => `M${x + w * 0.04} ${top + h * t}h${w * 0.92}`).join('')} />
    </g>
  )
  return (
    <g class="a-bob">
      {sail(-46, 26, 34, -48)}
      {sail(-18, 40, 52, -70)}
      {sail(24, 24, 30, -44)}
      <path fill={C.gold} d="M2 -76l10 3l-10 3z" />
      <path fill={C.trunk} d="M-56 -10q4 2 10 2h88q8 0 14 -8l-6 16q-2 6 -10 6h-76q-10 0 -14 -6z" />
      <rect x="-44" y="-8" width="84" height="2" fill="#c98f6b" />
    </g>
  )
}

function HongKong() {
  const land = () => (
    <g>
      {([[4, 26, 60], [34, 22, 84], [60, 28, 70], [92, 20, 96], [150, 24, 78], [212, 22, 90], [262, 26, 72], [292, 30, 58], [338, 24, 82], [364, 28, 66]] as const).map(([x, w, h]) => (
        <Building key={x} x={x} w={w} h={h} base={178} fill="#dcbccf" shade="#d0adc3" lit={false} />
      ))}
      <Building x={116} w={30} h={120} base={178} fill="#b9a6d0" shade={C.plum} />
      <path fill="#b9a6d0" d="M123 56l8 -24l8 24z" />
      <Building x={236} w={26} h={104} base={178} fill={C.peach} shade={C.peachD} />
      <path fill={C.peachD} d="M236 72l13 -18l13 18z" />
      <Building x={40} w={30} h={66} base={178} fill={C.pink} shade="#e892a4" />
      <Building x={176} w={34} h={84} base={178} fill={C.coral} shade={C.coralD} />
      <Building x={302} w={32} h={74} base={178} fill={C.pink} shade="#e892a4" />
      <rect x="-4" y="178" width={W + 8} height="6" fill="#e3b39c" />
    </g>
  )
  return (
    <Scene id="hk" sky={['#c6b0d8', '#e9b3b7', '#fbd2ad', '#fde9c9']}>
      <Sun id="hk" x={330} y={70} r={22} fill="#fff0d0" />
      <Cloud x={50} y={24} s={1.2} />
      <Twinkle x={110} y={20} /><Twinkle x={200} y={34} delay={-1} /><Twinkle x={270} y={16} delay={-1.8} />
      {/* 後面的山 */}
      <path fill="#b9a3c4" d="M-4 184V124Q60 66 130 96Q190 44 250 100Q320 76 404 122V184z" />
      {land()}
      <Water id="hk" y={184} top="#9fc0d6" bottom="#e6dcea" land={land} />
      {/* 主角是港裡的紅帆船 */}
      <At x={176} y={240} s={1.25}><Junk /></At>
      {/* 海鷗：近的大、遠的小 */}
      <Gull x={62} y={212} s={2.4} /><Gull x={304} y={150} s={1.1} delay={-1} /><Gull x={338} y={128} s={0.6} delay={-2} />
      {/* 兩隻海鷗停在帆船旁的半空 */}
    </Scene>
  )
}

/* ---------- 越南 ---------- */

const OCHRE = '#f2c35f'
const OCHRE_D = '#e0ab45'
const TEAL = '#4f9a8f'
const TILE = '#c9634f'
const TILE_D = '#b05443'

/** 老街的店屋：瓦屋頂、二樓兩扇百葉窗和陽台、一樓的遮陽棚和拱門。原點在左下角。 */
export function Shophouse({ w, h, fill = OCHRE, shade = OCHRE_D }: { w: number; h: number; fill?: string; shade?: string }) {
  return (
    <g>
      <rect x="0" y={-h} width={w} height={h} fill={fill} />
      <rect x={w * 0.6} y={-h} width={w * 0.4} height={h} fill={shade} />
      <path fill={TILE} d={`M-4 ${-h}l5 -12h${w - 2}l5 12z`} />
      <path fill={TILE_D} d={`M${w / 2} ${-h}v-12h${w / 2 - 1}l5 12z`} />
      <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.3" d={`M-1 ${-h - 4}h${w + 2}M1 ${-h - 8}h${w - 2}`} />
      <rect x={w * 0.16} y={-h + 8} width={w * 0.24} height="16" rx="1" fill={TEAL} data-glow={C.glow} />
      <rect x={w * 0.6} y={-h + 8} width={w * 0.24} height="16" rx="1" fill={TEAL} />
      <path fill="none" stroke="#fff" stroke-width="0.6" opacity="0.4" d={`M${w * 0.16} ${-h + 13}h${w * 0.24}M${w * 0.16} ${-h + 18}h${w * 0.24}M${w * 0.6} ${-h + 13}h${w * 0.24}M${w * 0.6} ${-h + 18}h${w * 0.24}`} />
      <rect x="-2" y={-h + 26} width={w + 4} height="2.5" fill={C.cream} />
      <path fill="none" stroke={C.cream} stroke-width="0.8" d={Array.from({ length: Math.floor(w / 6) }, (_, i) => `M${3 + i * 6} ${-h + 28}v5`).join('')} />
      <path fill={C.coral} d={`M-3 -24h${w + 6}l-3 6h${-w}z`} />
      <path fill="#3f7f76" d={`M${w / 2 - 7} 0v-12a7 7 0 0 1 14 0v12z`} />
      <path fill={C.glow} d={`M${w / 2 - 4} 0v-11a4 4 0 0 1 8 0v11z`} />
      {/* 門口兩盞燈籠 */}
      <path fill="none" stroke={C.trunk} stroke-width="0.7" d={`M${w * 0.22} -18v4M${w * 0.78} -18v4`} />
      <ellipse cx={w * 0.22} cy="-10" rx="3.4" ry="4" fill={C.coral} /><ellipse cx={w * 0.78} cy="-10" rx="3.4" ry="4" fill={C.gold} />
    </g>
  )
}


/** 載著燈籠的小木船。原點在水面正中。 */
function Sampan() {
  return (
    <g class="a-bob">
      <path fill="none" stroke={C.trunk} stroke-width="1.4" stroke-linecap="round" d="M-8 -4v-22q14 -4 22 4" />
      <circle cx="14" cy="-16" r="10" fill="#fff" opacity="0.3" /><ellipse cx="14" cy="-16" rx="4.500" ry="5.500" fill={C.glow} />
      <ellipse cx="-24" cy="-6" rx="4.500" ry="5" fill={C.coral} /><ellipse cx="-15" cy="-7" rx="4.500" ry="5" fill={C.gold} /><ellipse cx="2" cy="-6" rx="4.500" ry="5" fill={C.pink} />
      {/* 船尾坐著戴斗笠的船夫，划著槳 */}
      <path class="a-row" fill="none" stroke={C.trunk} stroke-width="1.4" stroke-linecap="round" d="M27 -12l9 17" />
      <path fill={C.cream} d="M19 -5l2 -10h6l2 10z" /><circle cx="24" cy="-17.500" r="3" fill={SKIN} /><path fill={C.glow} d="M16 -18.500l8 -6l8 6z" />
      <path fill={C.trunk} d="M-36 -6q36 10 72 0l-9 9q-27 6 -54 0z" />
    </g>
  )
}

function Vietnam() {
  const land = () => (
    <g>
      <rect x="-4" y="190" width={W + 8} height="8" fill="#eec9a4" />
      {/* 主角是河邊一排黃牆的老街店屋，每間門口掛著兩盞燈籠 */}
      <At x={18} y={190}><Shophouse w={62} h={62} fill="#f6d28a" shade="#eabf6c" /></At>
      <At x={88} y={190}><Shophouse w={72} h={86} /></At>
      <At x={168} y={190}><Shophouse w={60} h={66} fill="#f3b78f" shade="#e6a078" /></At>
      <At x={236} y={190}><Shophouse w={72} h={78} fill="#f6d28a" shade="#eabf6c" /></At>
      <At x={316} y={190}><Shophouse w={58} h={60} /></At>
      <Tree x={384} y={190} s={0.8} fill={C.pink} light={C.pinkL} />
    </g>
  )
  return (
    <Scene id="vn" sky={['#f9cfae', '#f7bfa6', '#f6dcc0', '#d9ecde']}>
      <Sun id="vn" x={326} y={52} r={20} />
      <Cloud x={40} y={30} s={1.2} /><Cloud x={210} y={20} delay={-5} />
      <path fill="#e9c0b2" d="M-4 198V150Q80 116 160 140Q240 110 320 138Q360 126 404 140V198z" />
      {land()}
      {/* 戴斗笠的人牽著腳踏車站在老街上 */}
      <Stand x={250} y={197} s={0.8} rev><Bike /></Stand><Stand x={266} y={197} s={0.8} rev><Person coat={C.cream} kind="hat" /></Stand>
      <Water id="vn" y={198} top="#9cd3cb" bottom="#d6efe3" land={land} />
      <At x={136} y={244} s={1.7}><Sampan /></At>
      <Krathong x={300} y={228} delay={-1} />
    </Scene>
  )
}

/* ---------- 新加坡 ---------- */

const GLASS = '#9fc3d2'
const GLASS_D = '#86aebf'

/** 三棟高樓頂著一艘船形平台的飯店。原點在地面正中。 */
export function BaySands() {
  const tower = (x: number) => (
    <g>
      <path fill={GLASS} d={`M${x - 14} 0L${x - 9} -86h18L${x + 14} 0z`} />
      <path fill={GLASS_D} d={`M${x} 0v-86h9L${x + 14} 0z`} />
      <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.35" d={[12, 24, 36, 48, 60, 72].map((y) => `M${x - 12} ${-y}h24`).join('')} />
      {/* 晚上亮燈的房間：白天跟玻璃同色看不出來 */}
      {[18, 30, 42, 54, 66].map((y, i) => <rect key={y} x={x - 8 + (i % 2) * 8} y={-y - 4} width="6" height="3" fill={GLASS} data-glow={C.glow} />)}
    </g>
  )
  return (
    <g>
      <rect x="-64" y="-4" width="128" height="4" fill={C.creamD} />
      {tower(-44)}{tower(0)}{tower(44)}
      <path fill={C.cream} d="M-70 -86q-8 -5 -2 -11h150q10 3 6 11z" />
      <path fill={C.creamD} d="M-70 -86h154q2 -3 1 -5h-158q-1 3 3 5z" />
      <g fill={C.leaf}>{[-52, -30, -8, 14, 36, 58].map((x) => <circle key={x} cx={x} cy="-99" r="3" />)}</g>
    </g>
  )
}

/** 樹形的高塔：往上張開的枝幹，頂著一片圓形的樹冠。原點在底部正中。 */
function Supertree({ h }: { h: number }) {
  return (
    <g>
      <path fill={C.plum} d={`M-3 0L-2 ${-h + 14}q-10 -4 -18 -14h40q-8 10 -18 14L3 0z`} />
      <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.4" d={`M0 ${-h + 13}L-11 ${-h + 2}M0 ${-h + 13}L11 ${-h + 2}M0 ${-h + 13}v-11`} />
      {/* 樹冠晚上亮燈 */}
      <ellipse cx="0" cy={-h} rx="22" ry="5" fill="#e3a2bd" data-glow="keep" />
      <ellipse cx="0" cy={-h - 1.5} rx="15" ry="3" fill={C.pinkL} data-glow="keep" />
    </g>
  )
}

function Singapore() {
  const land = () => (
    <g>
      <rect x="-4" y="190" width={W + 8} height="8" fill="#eccdb0" />
      {/* 主角是海灣邊的飯店，右邊三座樹形高塔 */}
      <At x={168} y={192} s={1.35}><BaySands /></At>
      <At x={306} y={192}><Supertree h={74} /></At>
      <At x={346} y={192}><Supertree h={54} /></At>
      <At x={380} y={192}><Supertree h={66} /></At>
      <Tree x={36} y={192} s={1.0} fill={C.leaf} light={C.leafL} />
    </g>
  )
  return (
    <Scene id="sg" sky={['#fbd9b8', '#f7c9c0', '#e9d9e6', '#cfe6ea']}>
      <Sun id="sg" x={40} y={46} r={20} />
      <Cloud x={300} y={30} s={1.2} />
      <path fill="#dcc3d6" d="M-4 198V160Q80 136 160 152Q250 132 330 154Q370 146 404 156V198z" />
      <Bird x={330} y={76} /><Bird x={348} y={86} delay={-1.2} />
      {land()}
      {/* 岸邊站著一大一小兩個人，看著海灣 */}
      <Water id="sg" y={198} top="#9fd0d6" bottom="#dceff0" land={land} />
      {/* 前景：岸邊一大一小，大人揮著手 */}
      <Bank fill="#e3c2a2" /><Stand x={48} y={254} s={2.1}><Person coat={C.coral} wave /></Stand><Stand x={86} y={254} s={1.4}><Person coat={C.gold} /></Stand>
      <At x={318} y={236} s={0.5}><Sailboat /></At>
    </Scene>
  )
}

/* ---------- 歐洲 ---------- */

const IRON = '#8f7468'
const IRON_D = '#7a6257'

/** 鐵塔：三層平台、交叉的鐵架。原點在地面正中。 */
export function Eiffel() {
  return (
    // 晚上整座打金黃色的燈
    <g data-glow="keep">
      <rect x="-0.700" y="-164" width="1.400" height="14" fill={IRON} data-glow="#d99a5c" />
      <path fill={IRON} data-glow="#d99a5c" d="M-36 0q22 -38 30 -78L-3 -150h6L6 -78q8 40 30 78h-14q-6 -20 -22 -20t-22 20z" />
      <path fill={IRON_D} data-glow="#c0844e" d="M0 -150h3L6 -78q8 40 30 78h-14q-6 -20 -22 -20z" />
      <path fill="none" stroke="#fff" stroke-width="0.7" opacity="0.35" d="M-20 -40l14 -34M20 -40l-14 -34M-28 -14l12 -30M28 -14l-12 -30M-5 -86l3 -34M5 -86l-3 -34M-14 -60h28M-9 -100h18" />
      <rect x="-24" y="-48" width="48" height="5" rx="1" fill={C.cream} />
      <rect x="-11" y="-82" width="22" height="4" rx="1" fill={C.cream} />
      <rect x="-5" y="-122" width="10" height="3" rx="1" fill={C.cream} />
    </g>
  )
}

/** 街邊的公寓：藍灰色斜屋頂和老虎窗、三排窗和鐵欄杆、一樓的店面遮陽棚。原點在左下角。 */
function Mansion({ w, h }: { w: number; h: number }) {
  const cols = Math.floor((w - 4) / 10)
  const pad = (w - cols * 10 + 5) / 2
  const xs = Array.from({ length: cols }, (_, i) => pad + i * 10)
  return (
    <g>
      <rect x="0" y={-h} width={w} height={h} fill={C.cream} />
      <rect x={w * 0.62} y={-h} width={w * 0.38} height={h} fill={C.creamD} />
      <path fill="#8fa0b5" d={`M-2 ${-h}l4 -14h${w - 4}l4 14z`} />
      <path fill="#7c8da3" d={`M${w / 2} ${-h}v-14h${w / 2 - 2}l4 14z`} />
      {xs.map((x) => <rect key={x} x={x} y={-h - 10} width="5" height="7" rx="1" fill={C.cream} />)}
      {/* 窗晚上亮一半（錯開排） */}
      {[0, 1, 2].map((r) => xs.map((x, i) => <rect key={`${r}-${x}`} x={x} y={-h + 6 + r * 13} width="5" height="8" rx="1" fill="#b7c3d3" data-glow={(r + i + cols) % 2 === 0 ? C.glow : undefined} />))}
      <path fill="none" stroke={C.trunk} stroke-width="0.7" opacity="0.6" d={[0, 1, 2].map((r) => `M3 ${-h + 15 + r * 13}h${w - 6}`).join('')} />
      <rect x="0" y="-12" width={w} height="12" fill="#e9d2bd" />
      <path fill={C.coral} d={`M3 -12h${w - 6}l2 5h${-(w - 2)}z`} />
    </g>
  )
}

function Europe() {
  const land = () => (
    <g>
      <rect x="-4" y="190" width={W + 8} height="8" fill="#e9cdb6" />
      <At x={2} y={190}><Mansion w={70} h={62} /></At>
      <At x={76} y={190}><Mansion w={58} h={72} /></At>
      <At x={262} y={190}><Mansion w={62} h={68} /></At>
      <At x={328} y={190}><Mansion w={74} h={60} /></At>
      {/* 主角是正中的鐵塔，兩旁各一棵樹 */}
      <At x={198} y={192} s={1.05}><Eiffel /></At>
      <Tree x={150} y={192} s={0.75} fill={C.leaf} light={C.leafL} />
      <Tree x={246} y={192} s={0.75} fill={C.orange} light={C.orangeL} />
    </g>
  )
  return (
    <Scene id="eu" sky={['#f6d0c6', '#f3cdd4', '#f6e3d6', '#dcebe6']}>
      <Sun id="eu" x={332} y={56} r={20} />
      <Cloud x={46} y={34} s={1.3} />
      <Bird x={110} y={70} /><Bird x={128} y={80} delay={-1.2} />
      {land()}
      {/* 有人牽著狗站在河邊 */}
      <Water id="eu" y={198} top="#a6cdd6" bottom="#e1efea" land={land} />
      {/* 前景：河邊有人牽著狗 */}
      <Bank fill="#e0c1a8" right /><Stand x={322} y={254} s={2}><Person coat="#7f8fb5" /></Stand><Stand x={358} y={254} s={2}><Dog /></Stand>
      <At x={96} y={236} s={0.45}><Sailboat /></At>
    </Scene>
  )
}

/* ---------- 澳洲 ---------- */

/**
 * 歌劇院的一片帆，像切開的一瓣橘子：尖端在外側，一邊是從尖端直直落到底的直邊，
 * 另一邊是從尖端往內水平彎過去、再落到底的大圓弧。帆的底邊往上拱，露出後面的深色玻璃和金色窗框。
 * 靠直邊那一塊是背光的淺灰；圓弧邊緣一道亮線，面上幾道從尖端放射出去的瓦片紋。原點在帆底。
 */
function Sail({ x0, x1, tip }: { x0: number; x1: number; tip: [number, number] }) {
  const [tx, ty] = tip
  const left = tx < (x0 + x1) / 2
  const w = x1 - x0
  // 直邊落在靠尖端那一側；圓弧落在另一側
  const [edge, back] = left ? [x0, x1] : [x1, x0]
  const ctrl = `${back + (left ? w * 0.08 : -w * 0.08)} ${ty * 1.05}`
  // 底邊往上拱多高；拱上某一點的高度（二次曲線）
  const arch = ty * 0.17
  const archY = (k: number) => 2 * k * (1 - k) * arch
  const mid = (x0 + x1) / 2
  const at = (k: number) => edge + (back - edge) * k
  const mullions = [0.2, 0.35, 0.5, 0.65, 0.8].map((k) => `M${at(k)} 0V${archY(k)}`).join('')
  const rays = [0.3, 0.45, 0.6, 0.75, 0.9].map((k) => `M${tx} ${ty}L${at(k)} ${archY(k)}`).join('')
  return (
    <g data-glow="keep">
      {/* 帆晚上有淡淡的打燈：整組（連同線條）畫在暗色層上面，帆面換成較暗的實色；帆底下的玻璃亮暖黃的燈 */}
      <path fill="#7a6f7d" data-glow={C.glow} d={`M${edge} 0Q${mid} ${arch} ${back} 0z`} />
      <path fill="none" stroke="#c9a678" stroke-width="0.600" d={mullions} />
      <path fill="#fffaf2" data-glow="#cfc9da" d={`M${edge} 0L${tx} ${ty}Q${ctrl} ${back} 0Q${mid} ${arch} ${edge} 0z`} />
      <path fill="#ece4d9" data-glow="#b3adc2" d={`M${tx} ${ty}L${edge} 0L${at(0.38)} ${archY(0.38)}z`} />
      <path fill="none" stroke="#e4dacd" stroke-width="0.500" d={rays} />
      <path fill="none" stroke="#fff" stroke-width="1.200" stroke-linecap="round" d={`M${tx} ${ty}Q${ctrl} ${back} 0`} />
      <path fill="none" stroke="#ddd2c3" stroke-width="0.700" d={`M${tx} ${ty}L${edge} 0`} />
    </g>
  )
}

/** 階梯上的小人：只有身體和頭。原點在腳底。 */
function Dot({ x, y, coat }: { x: number; y: number; coat: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-1.200" y="-5" width="2.400" height="5" rx="1" fill={coat} />
      <circle cx="0" cy="-6.300" r="1.300" fill={SKIN} />
    </g>
  )
}

/**
 * 歌劇院：照實景的輪廓。左邊一組帆尖朝左、越往中間越高，正中那片最高；接著兩片朝右；
 * 右邊小的一組也朝右、越來越低。帆底下是深色的玻璃和金色窗框，整座坐在高高的磚紅色基座上，
 * 左邊是一段大階梯，上面有幾個小小的遊客。原點在基座底部正中，寬約 300、高約 125。
 */
export function OperaHouse() {
  return (
    <g>
      {/* 基座：亮面、暗面、橫紋、一格格的牆板和一排窗 */}
      <rect x="-148" y="-24" width="296" height="24" fill="#d9a98a" />
      <rect x="60" y="-24" width="88" height="24" fill="#c99579" />
      <path fill="none" stroke="#c48c6e" stroke-width="0.700" d="M-148 -16h296M-148 -8h296" />
      <path fill="none" stroke="#c48c6e" stroke-width="0.500" opacity="0.7" d={[-60, -20, 20, 100, 130].map((x) => `M${x} -24v24`).join('')} />
      {[-122, -98, -74, -50, -26, -2, 22, 72, 94, 116].map((x) => <rect key={x} x={x} y="-21" width="14" height="5" rx="1" fill="#7a6f78" data-glow={C.glow} />)}
      {/* 左邊的大階梯和上面的遊客 */}
      <path fill="#e7c2a5" d="M-148 0V-24h22l-26 24z" />
      <path fill="none" stroke="#d2a888" stroke-width="0.600" d="M-148 -20h18M-148 -16h14M-148 -12h10M-148 -8h6M-148 -4h2" />
      <Dot x={-140} y={-17} coat={C.coral} /><Dot x={-134} y={-21} coat="#7f8fb5" /><Dot x={-143} y={-9} coat={C.gold} />
      {/* 基座頂的欄杆和深色玻璃 */}
      <rect x="-142" y="-30" width="280" height="6" fill="#6f6873" />
      <path fill="none" stroke="#f1dccb" stroke-width="0.700" d="M-148 -24.500h296" />
      <g transform="translate(0 -30)">
        {/* 最高的先畫，旁邊小的疊在前面 */}
        <Sail x0={-80} x1={-20} tip={[-74, -98]} />
        <Sail x0={-32} x1={30} tip={[36, -64]} />
        <Sail x0={-2} x1={48} tip={[56, -42]} />
        <Sail x0={-106} x1={-56} tip={[-108, -70]} />
        <Sail x0={-128} x1={-86} tip={[-134, -50]} />
        <Sail x0={-146} x1={-112} tip={[-152, -30]} />
        <Sail x0={56} x1={98} tip={[104, -42]} />
        <Sail x0={82} x1={120} tip={[128, -32]} />
        <Sail x0={106} x1={138} tip={[146, -22]} />
      </g>
    </g>
  )
}

/** 港灣大橋：一道拱、吊著橋面，兩頭各一座石塔，拱頂一面小旗。原點在左端的水面，橋長 180。 */
function HarbourBridge() {
  // 拱是一條二次曲線：x 從 0 到 180，最高點在正中
  const archY = (x: number) => -280 * (x / 180) * (1 - x / 180)
  const hangers = [24, 40, 56, 72, 90, 108, 124, 140, 156].map((x) => `M${x} ${archY(x)}V-24`).join('')
  const braces = [20, 36, 52, 68, 84, 100, 116, 132, 148, 164].map((x) => `M${x} ${archY(x)}L${x + 8} ${archY(x + 8) * 0.88}`).join('')
  return (
    <g>
      <path fill="none" stroke="#8f9cb0" stroke-width="5" d="M0 0Q90 -140 180 0" />
      <path fill="none" stroke="#8f9cb0" stroke-width="1.600" d="M10 0Q90 -122 170 0" />
      <path fill="none" stroke="#8f9cb0" stroke-width="0.800" opacity="0.7" d={braces} />
      <path fill="none" stroke="#8f9cb0" stroke-width="0.900" opacity="0.8" d={hangers} />
      {/* 拱上一串燈，白天跟鋼架同色 */}
      {[16, 34, 52, 70, 90, 110, 128, 146, 164].map((x) => <circle key={x} cx={x} cy={archY(x) * 0.97} r="1.300" fill="#8f9cb0" data-glow={C.glow} />)}
      <rect x="-24" y="-26" width="228" height="4" fill="#8f9cb0" />
      <rect x="-24" y="-22" width="228" height="1.400" fill="#7b889c" />
      {[-18, 184].map((x) => (
        <g key={x}>
          <rect x={x} y="-42" width="14" height="42" fill="#d9c6b4" /><rect x={x + 8} y="-42" width="6" height="42" fill="#c8b29e" />
          <rect x={x - 1} y="-44" width="16" height="3" fill="#c8b29e" /><rect x={x + 3} y="-36" width="5" height="8" rx="2" fill="#c8b29e" />
        </g>
      ))}
      <path fill="none" stroke="#7b889c" stroke-width="0.800" d="M90 -70v-8" />
      <path class="a-flag" fill={C.coral} d="M90 -78h6l-1.500 2l1.500 2h-6z" />
    </g>
  )
}

/** 雪梨塔：細長的塔身，上面一圈金色的觀景台和尖針。原點在地面。 */
function SydneyTower() {
  return (
    <g>
      <rect x="-1.600" y="-84" width="3.200" height="84" fill="#c6b5d6" />
      <path fill="none" stroke="#b6a3c9" stroke-width="0.700" d="M-1.600 -84L-6 -66M1.600 -84L6 -66M-6 -66h12" />
      <path fill={C.gold} data-glow={C.glow} d="M-8 -92h16l-2 8h-12z" />
      <rect x="-8.500" y="-95" width="17" height="3" rx="1" fill={C.goldD} />
      <rect x="-0.600" y="-112" width="1.200" height="17" fill="#b6a3c9" />
    </g>
  )
}

/** 雪梨的綠色渡輪：綠色船身、米色船艙和黃色的邊，一根小煙囪。原點在水面正中。 */
function Ferry() {
  return (
    <g class="a-bob">
      <path fill="#4f8f6f" d="M-28 -4h56l-6 8h-44z" />
      <rect x="-22" y="-12" width="40" height="8" rx="1.500" fill={C.cream} />
      <rect x="-22" y="-12" width="40" height="2" fill={C.gold} />
      {[-18, -11, -4, 3, 10].map((x) => <rect key={x} x={x} y="-9" width="4" height="3.400" rx="1" fill="#9fc3cf" />)}
      <rect x="-10" y="-18" width="20" height="6" rx="1.500" fill={C.cream} />
      <rect x="-10" y="-18" width="20" height="1.600" fill={C.gold} />
      <rect x="3" y="-23" width="3.400" height="6" fill="#4f8f6f" />
    </g>
  )
}

/**
 * 袋鼠：側面站坐著、面朝右。跟老鼠分得開的地方：身形又高又挺（高大約是寬的兩倍）、頭高高在上、
 * 像鹿一樣鈍鈍的長臉、長耳朵、粗大的大腿和長腳掌，粗尾巴拖在地上撐著。
 * 肚子下方的育兒袋裡有一隻探頭的小袋鼠，前爪收在牠上面、不擋住牠。原點在腳底，高約 54。
 */
export function Kangaroo() {
  const body = '#c98f6b'
  const shade = '#b47a58'
  const light = '#ecd0b4'
  const dark = '#6b4a3c'
  return (
    <g fill={body}>
      <path fill={shade} d="M-1 -13Q-16 -10 -29 -2Q-30 0 -28 0.600Q-15 -2.500 -1 -4z" />
      <path fill={shade} d="M-5 -2.800H12q3.400 0 3.400 2.800H-5z" />
      <ellipse cx="-1" cy="-10" rx="8.500" ry="9" />
      <path d="M-8 -10Q-10 -26 -2 -35Q2 -40 6.500 -37Q8.500 -26 6.500 -9z" />
      <ellipse cx="2.400" cy="-22" rx="3" ry="8" fill={light} />
      {/* 育兒袋裡探頭的小袋鼠：先畫頭，再畫袋子蓋住下半身 */}
      <ellipse cx="4.200" cy="-16.400" rx="2.300" ry="2" />
      <path d="M5 -17.600Q8.200 -17.800 9 -16.200Q8.600 -15 5.400 -15z" />
      <path d="M3.200 -17.800Q2 -21.600 3 -22Q4.200 -21 4.400 -18z" />
      <path d="M4.400 -18.100Q5 -22 5.900 -21.800Q6.400 -20 5.900 -17.800z" />
      <circle cx="5.400" cy="-16.900" r="0.500" fill={dark} />
      <circle cx="8.900" cy="-16.300" r="0.550" fill={dark} />
      <path fill={light} d="M-0.800 -14.600Q3 -12.400 7 -14.800Q7.600 -9 5 -6.800Q2 -5.600 -0.200 -7.600Q-1.200 -10 -0.800 -14.600z" />
      <path fill="none" stroke={shade} stroke-width="0.900" stroke-linecap="round" d="M-0.800 -14.600Q3 -12.400 7 -14.800" />
      {/* 前爪收在胸前，在小袋鼠上面 */}
      <path fill="none" stroke={body} stroke-width="2.200" stroke-linecap="round" d="M5 -30q2.600 1.400 3.600 4" />
      <path fill="none" stroke={body} stroke-width="2" stroke-linecap="round" d="M4 -28q2.200 1.800 2.800 4.200" />
      <ellipse cx="5" cy="-41.500" rx="4.600" ry="3.900" />
      <path d="M6 -44.600Q12 -44.600 15 -41Q14.600 -38.600 8 -38z" />
      <circle cx="14.400" cy="-41.200" r="1.150" fill={dark} />
      <path d="M2.600 -43.500Q-0.500 -52 2.200 -53.600Q5.400 -51.500 5.600 -44z" />
      <path d="M5 -44.400Q5.600 -53.400 8.600 -53Q9.800 -49 7.800 -43.600z" />
      <path fill="#e8a9a0" d="M3.300 -45Q1.600 -50.500 2.600 -51.600Q4.400 -49.600 4.700 -45z" />
      <circle cx="7.600" cy="-42.300" r="0.850" fill={dark} />
    </g>
  )
}

/** 開紫花的藍花楹樹。 */
const JACARANDA = { fill: '#b49ad3', light: '#d6c3ec' }

function Australia() {
  const land = () => (
    <g>
      {/* 遠方的丘陵；左後方是城市天際線、雪梨塔和港灣大橋 */}
      <path fill="#e6d0dc" d="M-4 198V168Q60 150 130 162Q200 146 270 160Q340 148 404 158V198z" />
      <Building x={6} w={14} h={44} fill="#dcc8de" shade="#cfb9d3" base={192} lit={false} />
      <Building x={22} w={12} h={58} fill="#d5bfd9" shade="#c8b0cf" base={192} lit={false} />
      <Building x={66} w={14} h={50} fill="#dcc8de" shade="#cfb9d3" base={192} lit={false} />
      <At x={50} y={192} s={0.9}><SydneyTower /></At>
      <At x={-30} y={196} s={0.62}><HarbourBridge /></At>
      <Building x={350} w={14} h={40} fill="#dcc8de" shade="#cfb9d3" base={192} lit={false} />
      <Building x={366} w={16} h={52} fill="#d5bfd9" shade="#c8b0cf" base={192} lit={false} />
      <rect x="-4" y="190" width={W + 8} height="8" fill="#e6c7a8" />
      {/* 主角：正中的歌劇院，兩旁開紫花的藍花楹 */}
      <Tree x={50} y={194} s={0.75} fill={JACARANDA.fill} light={JACARANDA.light} />
      <Tree x={374} y={194} s={0.8} fill={JACARANDA.fill} light={JACARANDA.light} />
      <Tree x={392} y={195} s={0.55} fill={C.leaf} light={C.leafL} />
      <At x={214} y={196} s={0.98}><OperaHouse /></At>
    </g>
  )
  return (
    <Scene id="au" sky={['#f9c7a2', '#f8d5bf', '#ecdfe2', '#b9dde5']}>
      <Sun id="au" x={56} y={46} r={22} fill="#fff1cf" />
      <Cloud x={262} y={22} s={1.2} /><Cloud x={350} y={52} s={0.8} delay={-4} />
      <Gull x={300} y={86} s={1.1} /><Gull x={326} y={74} s={0.9} delay={-1.4} />
      {land()}
      <Water id="au" y={198} top="#7fbfd3" bottom="#d4edf0" land={land} />
      <At x={236} y={226}><Ferry /></At>
      <At x={352} y={240} s={0.5}><Sailboat /></At>
      {/* 前景：岸邊有人揮手，旁邊一隻帶著小袋鼠的袋鼠 */}
      <Bank fill="#e7c09c" />
      <Stand x={50} y={254} s={2}><Person coat={C.coral} wave /></Stand>
      <Stand x={112} y={256} s={1.35}><Kangaroo /></Stand>
    </Scene>
  )
}

/* ---------- 紐西蘭 ---------- */

/** 綿羊：一團團的白毛、深色的臉和腳。原點在腳底，面朝右。 */
export function Sheep() {
  return (
    <g>
      <g fill="#5a4640"><rect x="-6" y="-5" width="2" height="5" /><rect x="-2" y="-5" width="2" height="5" /><rect x="3" y="-5" width="2" height="5" /><rect x="6.500" y="-5" width="2" height="5" /></g>
      <g fill={C.cream}><circle cx="-6" cy="-10" r="5" /><circle cx="0" cy="-12" r="6" /><circle cx="6" cy="-10" r="5" /><circle cx="0" cy="-7" r="5" /><circle cx="-3" cy="-9" r="5" /><circle cx="4" cy="-8" r="5" /></g>
      <circle cx="-1" cy="-14" r="3" fill="#fff" opacity="0.6" />
      <ellipse cx="11" cy="-11" rx="3" ry="4" fill="#5a4640" />
      <path fill="#5a4640" d="M9 -14l-3.500 -1l1 2.500z" />
    </g>
  )
}

/** 魯冰花：細莖上一串由下往上變小的花。原點在根部。 */
function Lupin({ x, y, h, fill }: { x: number; y: number; h: number; fill: string }) {
  const n = Math.round(h / 4)
  return (
    <g transform={`translate(${x} ${y})`} class="a-sway">
      <path fill="none" stroke={C.leaf} stroke-width="1.400" d={`M0 0V${-h * 0.4}`} />
      <path fill={C.leaf} d={`M0 ${-h * 0.2}q-5 -1 -6 -4q4 0 6 2zM0 ${-h * 0.28}q5 -1 6 -4q-4 0 -6 2z`} />
      {Array.from({ length: n }, (_, i) => <ellipse key={i} cx="0" cy={-h * 0.4 - i * 3.600} rx={3.400 - (i * 2.400) / n} ry="2.200" fill={fill} />)}
    </g>
  )
}

/** 湖邊的小石頭教堂：石牆（一顆顆石頭）、斜屋頂、亮著燈的窗、旁邊的鐘架。原點在地面正中。 */
function Chapel() {
  return (
    <g>
      <rect x="-14" y="-16" width="28" height="16" fill="#d8c6b2" />
      <rect x="4" y="-16" width="10" height="16" fill="#c6b29d" />
      <g fill="#c6b29d" opacity="0.8">
        <rect x="-12" y="-14" width="4" height="2.400" rx="1" /><rect x="-6" y="-4" width="5" height="2.400" rx="1" />
        <rect x="-13" y="-6" width="3.600" height="2.400" rx="1" /><rect x="6" y="-10" width="4" height="2.400" rx="1" fill="#b6a08a" />
      </g>
      <path fill="#8a6a5a" d="M-17 -15L0 -28L17 -15z" />
      <path fill="#77584a" d="M0 -28L17 -15H0z" />
      <rect x="-12" y="-11" width="4" height="6" rx="2" fill={C.glow} />
      <rect x="-3" y="-11" width="6" height="11" rx="3" fill="#8a6a5a" />
      <path fill="none" stroke="#77584a" stroke-width="0.800" d="M0 -28v-5M-1.800 -31.500h3.600" />
      <rect x="14" y="-22" width="2" height="22" fill="#a8927e" /><rect x="18" y="-22" width="2" height="22" fill="#a8927e" />
      <rect x="13" y="-24" width="8" height="2.400" fill="#8a6a5a" />
      <circle cx="17" cy="-19" r="1.400" fill={C.goldD} />
    </g>
  )
}

/** 秋天金黃色的白楊樹：細長的樹冠。原點在樹根。 */
function Poplar({ x, y, h = 34, fill = C.gold, light = '#fbdc8f' }: { x: number; y: number; h?: number; fill?: string; light?: string }) {
  return (
    <At x={x} y={y}>
      <rect x="-1" y="-6" width="2" height="6" fill={C.trunk} />
      <g class="a-sway">
        <ellipse cx="0" cy={-6 - h / 2} rx={h * 0.2} ry={h / 2} fill={fill} />
        <ellipse cx={-h * 0.06} cy={-6 - h * 0.62} rx={h * 0.08} ry={h * 0.26} fill={light} />
      </g>
    </At>
  )
}

/** 長在湖裡的那棵樹：細細的樹幹從水裡長出來，一團樹冠。原點在水面。 */
function LakeTree() {
  return (
    <g>
      <path fill="none" stroke={C.trunk} stroke-width="2.200" stroke-linecap="round" d="M0 0q-2 -10 1 -20M0 -12q-6 -3 -9 -9M1 -16q6 -2 8 -8" />
      <g class="a-sway">
        <ellipse cx="0" cy="-26" rx="12" ry="8" fill={C.leaf} />
        <ellipse cx="-9" cy="-21" rx="6" ry="4.500" fill={C.leaf} /><ellipse cx="9" cy="-22" rx="6" ry="4.500" fill={C.leaf} />
        <ellipse cx="-3" cy="-29" rx="6" ry="3" fill={C.leafL} />
      </g>
    </g>
  )
}

/** 一條長長的扁平白雲，掛在雪山上。 */
function LongCloud({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g class="a-drift" opacity="0.85">
      <path fill="#fff" d={`M${x} ${y}q${w * 0.1} -9 ${w * 0.3} -6q${w * 0.2} -8 ${w * 0.4} -2q${w * 0.2} -4 ${w * 0.3} 8z`} />
    </g>
  )
}

/** 魯冰花的顏色：粉、紫、淺紫、淡粉。 */
const LUPINS = [C.pink, '#b49ad3', C.plum, '#f8d0dc', '#c9a6e0']

function NewZealand() {
  const land = () => (
    <g>
      {/* 兩層雪山：遠的淡、近的有陰影面，山頂大片的雪 */}
      <path fill="#d3cfe8" d="M-4 198V140L30 112L60 130L92 100L130 128L170 108L210 136L250 104L290 124L330 98L370 120L404 108V198z" />
      <path fill="#b3add6" d="M-4 198V158L44 116L84 150L128 92L176 150L222 122L262 152L306 100L352 146L404 124V198z" />
      <path fill="#a39cca" d="M44 116L84 150H50zM128 92L176 150H132zM306 100L352 146H312z" />
      <path fill="#fff" d="M44 116L34 125l6 -1l4 4l5 -4l6 2zM128 92L114 108l7 -2l6 6l7 -7l9 3zM306 100L293 114l7 -2l6 5l6 -6l8 3z" />
      <path fill="#e9e6f4" d="M128 92l15 16l-9 -3l-7 7zM306 100l14 14l-8 -3l-6 6z" />
      <path fill="#a7d3a4" d="M-4 198V178Q80 164 170 174Q260 162 404 174V198z" />
      {/* 山坡上的羊群（遠看是幾個白點） */}
      <g fill="#fff">{[[60, 180], [70, 182], [82, 179], [96, 183]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="2.400" ry="1.600" />)}</g>
      <Pine x={196} y={190} s={0.7} /><Pine x={210} y={191} s={0.5} />
      <At x={240} y={190} s={1.5}><Chapel /></At>
      {/* 教堂旁的路燈；遠處山坡上幾戶人家的燈，白天跟草地同色 */}
      <Lamp x={272} y={191} h={13} /><Lamp x={212} y={191} h={11} />
      {[[120, 177], [134, 175], [352, 176], [368, 178]].map(([x, y]) => <rect key={x} x={x} y={y} width="2.400" height="2" fill="#a7d3a4" data-glow={C.glow} />)}
      <Poplar x={300} y={192} h={36} /><Poplar x={314} y={193} h={28} fill="#f2a24e" light={C.orangeL} /><Poplar x={328} y={192} h={38} />
      <Poplar x={30} y={192} h={30} /><Poplar x={44} y={193} h={24} fill="#f2a24e" light={C.orangeL} />
      <rect x="-4" y="190" width={W + 8} height="8" fill="#9fcb98" />
    </g>
  )
  // 湖裡的那棵樹：自己畫一個倒影
  const lakeTree = () => <At x={150} y={214} s={0.9}><LakeTree /></At>
  return (
    <Scene id="nz" sky={['#c7def0', '#e2ebf3', '#f6e5dc', '#f9d6c2']}>
      <Sun id="nz" x={352} y={46} r={20} />
      <Cloud x={30} y={30} s={1.1} />
      <LongCloud x={110} y={88} w={130} />
      <Bird x={210} y={60} /><Bird x={228} y={70} delay={-1.2} />
      {land()}
      {/* 湖水是帶點奶白的藍綠色 */}
      <Water id="nz" y={198} top="#6cc4cf" bottom="#c7ecea" land={land} />
      <g transform="translate(0 428) scale(1 -1)" opacity="0.25">{lakeTree()}</g>
      {lakeTree()}
      {/* 前景：兩邊岸上開滿魯冰花，幾隻綿羊，有人揮手 */}
      <path fill="#b5dba7" d="M-4 264V234Q60 220 132 236Q180 246 200 264z" />
      <path fill="#b5dba7" d="M404 264V230Q340 220 278 236Q250 246 240 264z" />
      {[6, 18, 30, 108, 122, 136, 150, 262, 276, 290, 370, 382, 394].map((x, i) => (
        <Lupin key={x} x={x} y={x < 200 ? 246 + (i % 3) * 5 : 248 + (i % 3) * 4} h={20 + ((i * 7) % 14)} fill={LUPINS[i % LUPINS.length]} />
      ))}
      <Stand x={62} y={252} s={1.6}><Sheep /></Stand>
      <Stand x={92} y={257} s={1.2} rev><Sheep /></Stand>
      <Stand x={330} y={252} s={1.9}><Person coat="#7f8fb5" wave /></Stand>
      <Stand x={354} y={258} s={1.3} rev><Sheep /></Stand>
    </Scene>
  )
}

export function Art({ theme, phase = 'day', weather = 'clear' }: { theme: ThemeId; phase?: Phase; weather?: WxKind }) {
  return (
    <PhaseCtx.Provider value={phase}>
      <WxCtx.Provider value={weather}><Scenery theme={theme} /></WxCtx.Provider>
    </PhaseCtx.Provider>
  )
}

function Scenery({ theme }: { theme: ThemeId }) {
  switch (theme) {
    case 'korea': return <Korea />
    case 'hongkong': return <HongKong />
    case 'vietnam': return <Vietnam />
    case 'singapore': return <Singapore />
    case 'europe': return <Europe />
    case 'australia': return <Australia />
    case 'newzealand': return <NewZealand />
    case 'thai': return <Thai />
    case 'japan': return <Japan />
    case 'island': return <Island />
    case 'city': return <City />
    default: return <General />
  }
}
