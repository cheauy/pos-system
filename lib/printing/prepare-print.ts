export function imagePrintDpi(width:number,height:number,maxWidthMm:number,maxHeightMm:number){
  if(![width,height,maxWidthMm,maxHeightMm].every(value=>Number.isFinite(value)&&value>0))return 0;
  return Math.round(Math.max(width/maxWidthMm,height/maxHeightMm)*25.4);
}

// Measure the full receipt at its print width after fonts/images are ready.
// Override the receipt's fallback page size so the QR stays on the same roll.
export function sizeReceiptPage(document:Document,receipt:HTMLElement){
  const paper=receipt.dataset.paper;
  if(!['58mm','76mm','80mm'].includes(paper||''))return;
  const width=parseInt(paper!,10),contentWidth=width-6;
  const original=receipt.getAttribute('style');
  let height:number;
  try{
    receipt.style.setProperty('width',`${contentWidth}mm`,'important');
    receipt.style.setProperty('max-width','none','important');
    receipt.style.setProperty('padding','0','important');
    receipt.style.setProperty('position','static','important');
    height=Math.max(receipt.scrollHeight,receipt.offsetHeight);
  }finally{
    if(original===null)receipt.removeAttribute('style');else receipt.setAttribute('style',original);
  }
  if(!Number.isFinite(height)||height<=0)throw new Error('Print preview could not be measured. Reopen it and try again.');
  const heightMm=Math.ceil(height*25.4/96+8); // 3 mm margins plus rounding allowance.
  let style=document.getElementById('receipt-page-size');
  if(!style){style=document.createElement('style');style.id='receipt-page-size';document.head.appendChild(style);}
  style.textContent=`@media print{@page{size:${width}mm ${heightMm}mm!important;margin:3mm}.receipt{width:${contentWidth}mm!important;max-width:none!important;padding:0!important;position:static!important}}`;
}

// Keep text and SVGs in the document; never flatten the print into a screenshot.
export async function preparePrint(document:Document,selector:string){
  const content=document.querySelector(selector);
  if(!content)throw new Error('Print preview is unavailable. Reload and try again.');
  if(content.querySelectorAll('[data-print-image-error]').length)throw new Error('A print image could not load. Reload the preview before printing.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([
      Promise.all([document.fonts.ready,...Array.from(content.querySelectorAll('img')).map(async image=>{
        await image.decode();
        if(!image.naturalWidth)throw new Error('Image unavailable');
      })]),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),15000);}),
    ]);
  }catch{throw new Error('A print image or font could not load. Reload the preview before printing.');}
  finally{clearTimeout(timer);}
  const receipt=content.matches?.('.receipt')?content:content.querySelector?.('.receipt');
  if(receipt)sizeReceiptPage(document,receipt as HTMLElement);
  for(const item of content.querySelectorAll<HTMLElement>('.shipping-label')){
    const heightMm=Number(item.dataset.heightMm),widthMm=Number(item.dataset.widthMm);
    if(heightMm&&widthMm&&item.getBoundingClientRect().height>item.getBoundingClientRect().width/widthMm*heightMm+2)
      throw new Error('This shipping label is too long for the selected paper. Choose a larger label or show fewer details in Printer Settings.');
  }
}
