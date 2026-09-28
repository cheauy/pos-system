export function validTaxRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}
