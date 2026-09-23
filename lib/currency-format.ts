export type CurrencyFormat = { symbol: string; position: 'before' | 'after'; decimals: 0 | 2 | 3; rounding: 'half-up' | 'up' | 'down'; format: 'en-US' | 'de-DE' | 'fr-FR' };
export function currencyFormat(value: Partial<CurrencyFormat> | null | undefined, currency = 'USD'): CurrencyFormat {
  return { symbol: value?.symbol ?? (currency === 'KHR' ? '៛' : '$'), position: value?.position ?? 'before', decimals: value?.decimals ?? 2, rounding: value?.rounding ?? 'half-up', format: value?.format ?? 'en-US' };
}
export function validCurrencyFormat(value: CurrencyFormat): boolean {
  return Boolean(value && typeof value.symbol === 'string' && value.symbol.trim().length > 0 && value.symbol.length <= 8 && !/[<>\r\n]/.test(value.symbol) && ['before','after'].includes(value.position) && [0,2,3].includes(value.decimals) && ['half-up','up','down'].includes(value.rounding) && ['en-US','de-DE','fr-FR'].includes(value.format));
}
export function formatStoreMoney(amount: number, settings: CurrencyFormat): string {
  const factor = 10 ** settings.decimals;
  const scaled = Math.round(Math.abs(amount) * factor * 1e8) / 1e8;
  const rounded = (settings.rounding === 'up' ? Math.ceil(scaled) : settings.rounding === 'down' ? Math.floor(scaled) : Math.round(scaled)) / factor;
  const number = new Intl.NumberFormat(settings.format, { minimumFractionDigits: settings.decimals, maximumFractionDigits: settings.decimals }).format(rounded * (amount < 0 ? -1 : 1));
  return settings.position === 'before' ? `${settings.symbol}${number}` : `${number} ${settings.symbol}`;
}
