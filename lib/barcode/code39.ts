export const CODE39: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
  "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
  "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
  "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
};
export function normalizeBarcode(value: string) { return value.toUpperCase().replace(/[^0-9A-Z. $\/+%-]/g, "-").slice(0, 40); }
export function validateCode39(value: string): string | null {
  if (!value) return "A barcode or SKU is required to print a barcode label.";
  if (!value.trim()) return "Code 39 labels require a non-space identifier for POS lookup; the saved value will not be trimmed.";
  if (value !== value.trim()) return "Code 39 labels cannot start or end with whitespace because POS lookup trims scans; the saved value will not be trimmed.";
  if (value.length > 40) return "Code 39 labels support at most 40 characters; the saved value will not be shortened.";
  if (/[a-z]/.test(value)) return "Code 39 labels require uppercase letters; the saved value will not be converted.";
  if (!/^[0-9A-Z. $\/+%-]+$/.test(value)) return "Code 39 labels support digits, uppercase letters, spaces, and . $ / + % - only; unsupported characters will not be replaced.";
  return null;
}

// Product labels must encode the exact stored identifier, including leading zeros.
export function code39BarsExact(value: string) {
  const error = validateCode39(value);
  if (error) throw new Error(error);
  return encodeCode39(value);
}

// Existing receipt callers retain their established order-number formatting.
export function code39Bars(value: string) {
  return encodeCode39(normalizeBarcode(value));
}

function encodeCode39(value: string) {
  const text = `*${value}*`;
  const bars: {x:number;width:number}[] = []; let x = 0; const narrow=2, wide=5, gap=2;
  for (const char of text) { const pattern = CODE39[char] ?? CODE39["-"]; for (let i=0;i<pattern.length;i++) { const width=pattern[i]==="w"?wide:narrow; if(i%2===0) bars.push({x,width}); x += width; } x += gap; }
  return { bars, width:x, text: value };
}
