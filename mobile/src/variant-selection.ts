export type VariantChoice = { id: string; size: string | null; color: string | null; available?: number };
export function compareSizes(a: unknown, b: unknown) {
  const left=String(a??'').trim().toUpperCase(), right=String(b??'').trim().toUpperCase();
  const sizes=['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL'];
  const rank=(size:string)=>sizes.indexOf(({ '2XL':'XXL','3XL':'XXXL' } as Record<string,string>)[size]||size);
  const x=rank(left),y=rank(right);
  return x>=0&&y>=0?x-y:x>=0?-1:y>=0?1:left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'});
}
export function compareVariants(a:{size?:unknown;color?:unknown;stock_quantity?:unknown;available?:number},b:{size?:unknown;color?:unknown;stock_quantity?:unknown;available?:number}) {
  return compareSizes(a.size,b.size)||String(a.color??'').localeCompare(String(b.color??''),undefined,{numeric:true,sensitivity:'base'})||Number(b.available??b.stock_quantity??0)-Number(a.available??a.stock_quantity??0);
}
export function matchingVariants<T extends VariantChoice>(rows: T[], color: string | null, size: string | null) {
  return rows.filter(row => (color === null || (row.color || '') === color) && (size === null || (row.size || '') === size));
}
