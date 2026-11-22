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

export interface Platform {
  ios: boolean
  /** 是不是從主畫面開啟的。 */
  standalone: boolean
}

/** 純函式，方便測試。iPadOS 的 Safari 會自稱 Mac，所以另外看觸控點數。 */
export function detectPlatform(ua: string, maxTouchPoints: number, standalone: boolean): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  return { ios, standalone }
}

export function currentPlatform(): Platform {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints, standalone)
}

/**
 * iPhone／iPad 的 Safari 會清掉 7 天沒開的網站資料，加到主畫面的 App 不會；
 * 而且主畫面 App 的資料和 Safari 是分開的。所以在 iOS 上一律先加到主畫面，才開始建立或加入行程。
 */
export const needsInstall = (p: Platform): boolean => p.ios && !p.standalone
