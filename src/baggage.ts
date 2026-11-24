// 航班的託運行李額度：幾件、每件幾公斤。兩個都可以不填。

/** 把輸入的字變成數字：空白、不是數字、負數都當成沒填（0）；最多留一位小數，上限 999。 */
export function amount(text: string): number {
  const n = Number(text.trim().replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(999, Math.round(n * 10) / 10)
}

/** 航班卡片上顯示的行李額度；兩個都沒填就是空字串。 */
export function bagText(f: { bags?: number; bagKg?: number }): string {
  const bags = f.bags && f.bags > 0 ? f.bags : 0
  const kg = f.bagKg && f.bagKg > 0 ? f.bagKg : 0
  if (bags && kg) return `行李 ${bags} 件・每件 ${kg} 公斤`
  if (bags) return `行李 ${bags} 件`
  if (kg) return `行李 ${kg} 公斤`
  return ''
}
