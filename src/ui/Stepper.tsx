// 數量：用減號、加號兩顆按鈕調整，不用叫出鍵盤。
import { Icon } from './Icons'

export function Stepper({ value, onChange, min = 0, max = 99, label }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  /** 給螢幕閱讀器用的名稱，例如「我自己要幾個」。 */
  label: string
}) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="少一個" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Icon id="minus" size={18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="多一個" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Icon id="plus" size={18} />
      </button>
    </div>
  )
}
