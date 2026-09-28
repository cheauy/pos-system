// Accept intermediate typing states, without converting money through floating point.
export function decimalInput(value: string, previous: string): string {
  return /^\d*(\.\d{0,2})?$/.test(value) ? value : previous;
}
