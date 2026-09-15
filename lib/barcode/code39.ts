export const CODE39: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
  "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
  "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
  "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
};
export function normalizeBarcode(value: string) { return value.toUpperCase().replace(/[^0-9A-Z. $\/+%-]/g, "-").slice(0, 40); }
export function code39Bars(value: string) {
  const text = `*${normalizeBarcode(value)}*`;
  const bars: {x:number;width:number}[] = []; let x = 0; const narrow=2, wide=5, gap=2;
  for (const char of text) { const pattern = CODE39[char] ?? CODE39["-"]; for (let i=0;i<pattern.length;i++) { const width=pattern[i]==="w"?wide:narrow; if(i%2===0) bars.push({x,width}); x += width; } x += gap; }
  return { bars, width:x, text: normalizeBarcode(value) };
}
