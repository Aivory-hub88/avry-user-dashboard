/**
 * FX rates used ONLY to convert USD-denominated ROI estimates into the user's
 * selected display currency. Approximate, for estimation — not for accounting.
 * Update periodically and bump FX_AS_OF.
 */
export const FX_AS_OF = '2026-06'

export const CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  IDR: 15_600,
  SGD: 1.35,
  MYR: 4.72,
  AUD: 1.53,
  JPY: 149,
  INR: 83,
}
