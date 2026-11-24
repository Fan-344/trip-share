// PWA：離線快取的註冊、新版提示，以及判斷要不要引導「加到主畫面」。

/**
 * 註冊 Service Worker。有新版裝好、等著接手時呼叫 onUpdate，並給一個 apply 函式；
 * 使用者按下更新才呼叫 apply，頁面會換成新版並重新載入。不會自己重新整理。
 */
export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  let applying = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 第一次安裝時也會觸發這個事件，那時不需要重新載入。
    if (applying) location.reload()
  })
  void navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = () => {
      // 沒有 controller 代表是第一次安裝，不是更新。
      if (!reg.waiting || !navigator.serviceWorker.controller) return
      onUpdate(() => {
        applying = true
        reg.waiting?.postMessage('skipWaiting')
      })
    }
    const track = (w: ServiceWorker | null) => {
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') offer()
      })
    }
    offer()
    // 新版可能在這段程式跑到之前就開始安裝了，那時 updatefound 已經發過，所以兩種都要接。
    track(reg.installing)
    reg.addEventListener('updatefound', () => track(reg.installing))
    // 主畫面的 App 很少整個重開，所以每次切回畫面都檢查一次有沒有新版。
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => {})
    })
  }).catch(() => {
    // 註冊失敗（例如無痕模式）：照常使用，只是沒有離線快取。
  })
}

/** 用哪個瀏覽器開的：加到主畫面的按鈕位置每個瀏覽器不一樣。other 是其他瀏覽器，或 LINE、臉書這類 App 裡面開的網頁。 */
export type Browser = 'safari' | 'chrome' | 'other'

export interface Platform {
  ios: boolean
  android: boolean
  /** 是不是從主畫面開啟的。 */
  standalone: boolean
  browser: Browser
}

/** 純函式，方便測試。iPadOS 的 Safari 會自稱 Mac，所以另外看觸控點數。 */
export function detectPlatform(ua: string, maxTouchPoints: number, standalone: boolean): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  const android = /Android/.test(ua)
  // App 裡面開的網頁（LINE、臉書、IG…）和其他瀏覽器，加到主畫面的方式都不一定，歸成 other
  const inApp = /Line\/|FBAN|FBAV|Instagram|MicroMessenger/.test(ua)
  const browser: Browser = inApp ? 'other'
    : ios ? (/CriOS/.test(ua) ? 'chrome' : /FxiOS|EdgiOS|OPiOS/.test(ua) ? 'other' : 'safari')
    : android ? (/Chrome\//.test(ua) && !/EdgA|SamsungBrowser|OPR\//.test(ua) ? 'chrome' : 'other')
    : 'other'
  return { ios, android, standalone, browser }
}

export function currentPlatform(): Platform {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints, standalone)
}

/**
 * iPhone／iPad 的瀏覽器會清掉 7 天沒開的網站資料，加到主畫面的 App 不會；
 * 而且主畫面 App 的資料和瀏覽器是分開的，加了之後要用搬家碼把身分和行程帶過去。
 */
export const needsInstall = (p: Platform): boolean => p.ios && !p.standalone

/** 值不值得提醒加到主畫面：手機上、還沒從主畫面開。（Android 裝起來的 App 和瀏覽器共用資料，不用搬家，只是比較好找。） */
export const canInstall = (p: Platform): boolean => (p.ios || p.android) && !p.standalone

/**
 * 怎麼把這個網站加到主畫面：一步一句，照使用的手機和瀏覽器給。
 * 電腦、或已經是從主畫面開的，沒有步驟（空陣列）。
 */
export function installSteps(p: Platform): string[] {
  if (p.standalone) return []
  if (p.ios) {
    const add = ['往下滑，選「加入主畫面」。', '按右上角的「加入」。']
    if (p.browser === 'safari') return ['點 Safari 底下（或網址列旁邊）的「分享」：一個方框加向上的箭頭。', ...add]
    if (p.browser === 'chrome') return ['點網址列右邊的「分享」：一個方框加向上的箭頭。', ...add]
    return ['這裡可能加不了主畫面。先點選單裡的「用 Safari 開啟」或「在瀏覽器中開啟」。', '在 Safari 點底下的「分享」：一個方框加向上的箭頭。', ...add]
  }
  if (p.android) {
    if (p.browser === 'chrome') return ['點右上角的「⋮」。', '選「加到主畫面」或「安裝應用程式」。', '按「安裝」。']
    return ['打開瀏覽器的選單，選「加到主畫面」或「安裝」。找不到的話改用 Chrome 開。']
  }
  return []
}
