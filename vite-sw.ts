import type { Plugin } from 'vite'

/** public/ 裡要離線可用的檔案（不經過打包，所以要自己列）。 */
const PUBLIC_FILES = [
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
]

/**
 * 打包時產生 sw.js：把這一版的所有檔案列進去，安裝時一次抓完，之後離線也能開。
 *
 * 例外是「用到才載入」的大檔案（機票辨識的 PDF、文字辨識、條碼引擎，加起來十幾 MB）：
 * 不在安裝時抓，第一次用到時才下載並存起來，之後離線也能用。
 * 判斷方式：從進入點一路靜態 import 得到的才算「一開始就要」，其他都是用到才載入。
 *
 * 版本號由檔名清單算出（打包後的檔名帶內容雜湊），內容有變才會被當成新版。
 * 新版裝好後不會自己接手，要等頁面送 'skipWaiting'（使用者按「點此更新」）才換。
 */
export function serviceWorker(): Plugin {
  return {
    name: 'trip-share-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const names = Object.keys(bundle).filter((f) => f !== 'index.html' && f !== 'sw.js')
      // 一開始就要的：進入點＋它們靜態 import 的程式，以及這些程式用到的樣式與圖檔
      const eager = new Set<string>()
      const visit = (name: string) => {
        const c = bundle[name]
        if (!c || eager.has(name)) return
        eager.add(name)
        if (c.type !== 'chunk') return
        c.imports.forEach(visit)
        c.viteMetadata?.importedCss.forEach((f) => eager.add(f))
        c.viteMetadata?.importedAssets.forEach((f) => eager.add(f))
      }
      for (const name of names) {
        const c = bundle[name]
        if (c.type === 'chunk' && c.isEntry) visit(name)
      }
      // 用到才載入的：其他程式，和只有它們用到的檔案
      const lazy = new Set<string>()
      for (const name of names) {
        const c = bundle[name]
        if (c.type !== 'chunk' || eager.has(name)) continue
        lazy.add(name)
        c.viteMetadata?.importedCss.forEach((f) => !eager.has(f) && lazy.add(f))
        c.viteMetadata?.importedAssets.forEach((f) => !eager.has(f) && lazy.add(f))
      }
      for (const name of names) if (name.startsWith('ocr/')) lazy.add(name)

      const files = ['./', ...PUBLIC_FILES, ...names.filter((f) => !lazy.has(f))]
      let h = 5381
      for (const ch of files.join('|')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source(h.toString(36), files, [...lazy]) })
    },
  }
}

const source = (version: string, files: string[], lazy: string[]) => `// 由 vite-sw.ts 產生，請勿手改。
const CACHE = 'app-${version}'
const FILES = ${JSON.stringify(files)}
// 用到才下載的大檔案：存在另一個快取裡，換版本時不會被清掉（檔案沒變就不用重抓）。
const LAZY_CACHE = 'lazy'
const LAZY = ${JSON.stringify(lazy)}

self.addEventListener('install', (e) => {
  // cache: 'reload'：跳過瀏覽器的 HTTP 快取，確定抓到的是這一版。
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))))
})

self.addEventListener('activate', (e) => {
  const keep = new Set(LAZY.map((f) => new URL(f, self.registration.scope).href))
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== CACHE).map((k) => caches.delete(k))))
      // 這一版已經不用的大檔案也清掉
      .then(() => caches.open(LAZY_CACHE))
      .then((c) => c.keys().then((reqs) => Promise.all(reqs.filter((r) => !keep.has(r.url)).map((r) => c.delete(r)))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})

const lazyUrls = new Set(LAZY.map((f) => new URL(f, self.registration.scope).href))

async function lazyFile(req) {
  const cache = await caches.open(LAZY_CACHE)
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(req.url.split('?')[0], res.clone())
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  if (lazyUrls.has(req.url.split('?')[0])) return e.respondWith(lazyFile(req))
  // 開頁面一律給快取裡的首頁（單頁應用，路徑都在 # 後面）；其他檔案先找快取，沒有才上網。
  const cached = req.mode === 'navigate'
    ? caches.match('./', { cacheName: CACHE })
    : caches.match(req, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true })
  e.respondWith(cached.then((r) => r || fetch(req)))
})
`
