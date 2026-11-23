// 跟著主題變化的小版位：空白畫面、頁尾。
import type { ComponentChildren } from 'preact'
import { themeOf, type ThemeId } from '../themes'
import { Icon } from './Icons'
import { Hills } from './Mascot'

/** 還沒有內容時顯示：主題圖案加一句話。 */
export function Empty({ icon, children }: { icon: string; children: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon id={icon} size={48} cls="a-float" />
      {children}
    </div>
  )
}

/** 每個分頁最底下的結尾：一排主題圖案和一句祝福。 */
export function Farewell({ theme, title }: { theme: ThemeId; title: string }) {
  const t = themeOf(theme)
  return (
    <div class="farewell">
      <div class="row">{t.motifs.map((m) => <Icon key={m} id={m} size={28} />)}</div>
      <span class="row" style="justify-content:center;gap:6px">{title}・{t.farewell}<Icon id="flower" size={16} /></span>
      <Hills />
    </div>
  )
}
