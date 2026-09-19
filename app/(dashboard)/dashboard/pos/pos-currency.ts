import type { CurrencyQuote, PosSettings } from './pos-workspace-types';

export const DEFAULT_USD_KHR_RATE = 4000;
export function currencySymbol(code: string): string { return code === 'USD' ? '$' : code === 'KHR' ? '៛' : code; }
export function currencyQuote(settings: PosSettings, requested?: string): CurrencyQuote {
  const baseCurrency = settings.currency;
  const supported = ['USD', 'KHR'].includes(baseCurrency);
  const rate = Number(settings.usdKhrRate ?? DEFAULT_USD_KHR_RATE);
  const enabled = supported && settings.dualCurrencyEnabled === true && Number.isFinite(rate) && rate >= 1 && rate <= 1000000;
  return { baseCurrency, displayCurrency: enabled && ['USD', 'KHR'].includes(requested || '') ? requested! : baseCurrency,
    usdKhrRate: Number.isFinite(rate) && rate >= 1 && rate <= 1000000 ? rate : DEFAULT_USD_KHR_RATE, enabled };
}
// Keep the existing accounting currency and its two-decimal precision. Conversion
// is integer half-up; no n-suffix BigInt literals (the project targets ES2017).
export function convertMoney(value: number, from: string, to: string, rate: number): number {
  if (!Number.isFinite(value)) return 0;
  if (from === to) return value;
  if (!['USD', 'KHR'].includes(from) || !['USD', 'KHR'].includes(to) || !Number.isFinite(rate) || rate < 1 || rate > 1000000) throw new Error('Invalid POS currency conversion.');
  const minor = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  const rateUnits = Math.round(rate * 10000);
  if (!Number.isSafeInteger(minor) || !Number.isSafeInteger(rateUnits)) throw new Error('Amount is too large.');
  const numerator = BigInt(minor) * BigInt(from === 'USD' ? rateUnits : 10000);
  const denominator = BigInt(from === 'USD' ? 10000 : rateUnits);
  const result = Number((numerator + denominator / BigInt(2)) / denominator);
  if (!Number.isSafeInteger(result)) throw new Error('Converted amount is too large.');
  return (value < 0 ? -result : result) / 100;
}
export function displayAmount(baseAmount: number, quote: CurrencyQuote): number {
  return convertMoney(baseAmount, quote.baseCurrency, quote.displayCurrency, quote.usdKhrRate);
}
export function formatCurrency(value: number, code: string): string {
  if (code === 'KHR') return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}៛`;
  try { return new Intl.NumberFormat('en-US', { style:'currency', currency:code, minimumFractionDigits:2, maximumFractionDigits:2 }).format(value); }
  catch { return `${code} ${value.toFixed(2)}`; }
}
export function quoteMoney(baseAmount: number, quote: CurrencyQuote): string {
  return formatCurrency(displayAmount(baseAmount, quote), quote.displayCurrency);
}
export function parseMoneyEntry(raw: string, quote: CurrencyQuote): { value: string; error: string | null } {
  if (raw === '') return { value:'', error:null };
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) return { value:'', error:'Enter a non-negative amount with up to 2 decimals.' };
  const entered = Number(raw);
  if (!Number.isFinite(entered) || entered > 99999999999999) return { value:'', error:'Enter a smaller amount.' };
  let base: number;
  try { base = convertMoney(entered, quote.displayCurrency, quote.baseCurrency, quote.usdKhrRate); }
  catch { return {value:'',error:'Amount is too large.'}; }
  if (base > 999999999) return { value:'', error:'Amount exceeds the POS limit.' };
  // Do not silently record more/less received cash than the cashier entered.
  // Only accept a foreign amount that round-trips to the same displayed cents.
  if (Math.round(displayAmount(base,quote)*100) !== Math.round(entered*100)) return { value:'', error:`This amount cannot be recorded exactly in ${quote.baseCurrency} at this rate. Switch to ${currencySymbol(quote.baseCurrency)} or enter an exactly convertible amount.` };
  return { value:base.toFixed(2), error:null };
}
export function currencyQuoteIssue(quote: CurrencyQuote): string | null {
  if (!quote || typeof quote.baseCurrency !== 'string' || typeof quote.displayCurrency !== 'string' || typeof quote.enabled !== 'boolean') return 'Invalid POS currency selection.';
  if (!Number.isFinite(quote.usdKhrRate) || quote.usdKhrRate < 1 || quote.usdKhrRate > 1000000 || Math.abs(quote.usdKhrRate*10000-Math.round(quote.usdKhrRate*10000)) > 0.00001) return 'Invalid USD / KHR exchange rate.';
  if (quote.displayCurrency !== quote.baseCurrency && (!quote.enabled || !['USD','KHR'].includes(quote.baseCurrency) || !['USD','KHR'].includes(quote.displayCurrency))) return 'Currency switching is disabled for this business.';
  return null;
}

export function settlementCurrencyIssue(total:number, paid:number, parts:number[], quote:CurrencyQuote): string|null {
  if(quote.displayCurrency===quote.baseCurrency)return null;
  const values=[total,paid,...parts];
  for(const value of values){
    if(!Number.isFinite(value) || value<0)return 'Enter valid payment amounts.';
    const display=displayAmount(value,quote);
    const back=convertMoney(display,quote.displayCurrency,quote.baseCurrency,quote.usdKhrRate);
    if(Math.round(back*100)!==Math.round(value*100))return `This order/payment is not exactly representable in ${quote.displayCurrency} at this rate. Switch to ${currencySymbol(quote.baseCurrency)} to avoid a rounding difference.`;
  }
  if(parts.length && parts.reduce((sum,value)=>sum+Math.round(displayAmount(value,quote)*100),0)!==Math.round(displayAmount(total,quote)*100))return `Split parts have a conversion rounding difference. Adjust the amounts or switch to ${currencySymbol(quote.baseCurrency)}.`;
  if(!parts.length && paid>total && Math.round(displayAmount(paid-total,quote)*100)!==Math.round(displayAmount(paid,quote)*100)-Math.round(displayAmount(total,quote)*100))return `Cash change has a conversion rounding difference. Use exact cash or switch to ${currencySymbol(quote.baseCurrency)}.`;
  return null;
}
