// 行程頁一天裡的項目順序。

interface Sortable { time: string; createdAt: number; kind: string; pin?: string }

/** 置頂的提醒排最前、置底的排最後；pin 只對提醒有效，其他類型的項目不看。 */
const rank = (i: Sortable): number => (i.kind !== 'reminder' ? 1 : i.pin === 'top' ? 0 : i.pin === 'bottom' ? 2 : 1)

/**
 * 先看置頂／置底，再照時間（沒填時間的是整天的事，排在有時間的前面），時間一樣就照建立的先後。
 */
export function byDayOrder(a: Sortable, b: Sortable): number {
  return rank(a) - rank(b) || a.time.localeCompare(b.time) || a.createdAt - b.createdAt
}
