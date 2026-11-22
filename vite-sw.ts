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
 * 版本號由檔名清單算出（打包後的檔名帶內容雜湊），內容有變才會被當成新版。
 * 新版裝好後不會自己接手，要等頁面送 'skipWaiting'（使用者按「點此更新」）才換。
 */
export function serviceWorker(): Plugin {
  return {
    name: 'trip-share-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = ['./', ...PUBLIC_FILES, ...Object.keys(bundle).filter((f) => f !== 'index.html' && f !== 'sw.js')]
      let h = 5381
      for (const ch of files.join('|')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source(h.toString(36), files) })
    },
  }
}

const source = (version: string, files: string[]) => `// 由 vite-sw.ts 產生，請勿手改。
const CACHE = 'app-${version}'
const FILES = ${JSON.stringify(files)}

self.addEventListener('install', (e) => {
  // cache: 'reload'：跳過瀏覽器的 HTTP 快取，確定抓到的是這一版。
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  // 開頁面一律給快取裡的首頁（單頁應用，路徑都在 # 後面）；其他檔案先找快取，沒有才上網。
  const cached = req.mode === 'navigate'
    ? caches.match('./', { cacheName: CACHE })
    : caches.match(req, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true })
  e.respondWith(cached.then((r) => r || fetch(req)))
})
`
