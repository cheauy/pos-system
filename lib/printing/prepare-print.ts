import { shippingQrMinimumMm, shippingQrModules } from '@/lib/receipts/shipping-layout';
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
  assertShippingLabelsFit(content);
}

/** Fit text, never scale/stretch the QR or change the physical paper dimensions. */
export function fitShippingLabel(label: HTMLElement): boolean | null {
  if (label.matches?.('.ship-custom')) {
    if (!label.getBoundingClientRect().width) return null;
    const bounds = label.getBoundingClientRect();
    delete label.dataset.printQrError;
    if (label.dataset.customQrReview === 'true') label.dataset.printQrError = 'Review the enlarged Order QR in Printer Settings and save the layout before printing.';
    for (const element of label.querySelectorAll<HTMLElement>('[data-custom-field="qr"]')) {
      const svg = element.querySelector('svg');
      if (!svg) continue; // Older orders without a numeric code have no QR.
      try {
        const minimum = shippingQrMinimumMm(shippingQrModules(svg.outerHTML));
        const rect = element.getBoundingClientRect();
        const side = Math.min(rect.width / bounds.width * Number(label.dataset.widthMm),rect.height / bounds.height * Number(label.dataset.heightMm));
        if (!Number.isFinite(side) || side + .005 < minimum)
          label.dataset.printQrError = `Order QR needs at least ${minimum.toFixed(1)} mm square at 203 dpi. Enlarge it in Printer Settings and print at Actual size.`;
      } catch { label.dataset.printQrError = 'Order QR geometry is unavailable. Reload the label before printing.'; }
    }
    const fits = [...label.querySelectorAll<HTMLElement>('[data-custom-field]')].every(element => {
      const rect = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1
        && rect.left >= bounds.left - 1 && rect.top >= bounds.top - 1 && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1;
    });
    if (fits) delete label.dataset.printOverflow; else label.dataset.printOverflow = 'true';
    return fits && !label.dataset.printQrError;
  }
  if (!label.matches?.('.ship-template') || !label.getBoundingClientRect().width) return null;
  const view = label.ownerDocument.defaultView;
  if (!view) return null;
  label.style.setProperty('--ship-fit-scale', '1');
  const style = view.getComputedStyle(label);
  const base = parseFloat(style.getPropertyValue('--ship-base')) || 9;
  const user = parseFloat(style.getPropertyValue('--ship-user-scale')) || 1;
  const minimumFont = label.classList.contains('ship-small') ? 8 : label.classList.contains('ship-square') ? 9 : 10;
  const minimumScale = Math.min(1, minimumFont / (base * user));
  function overflows() {
    const bounds = label.getBoundingClientRect();
    const details = label.querySelector<HTMLElement>('.ship-details');
    const body = label.querySelector<HTMLElement>('.ship-body');
    if (!details || !body) return true;
    if (details.scrollHeight > body.clientHeight + 1 || details.scrollWidth > details.clientWidth + 1) return true;
    if (details.scrollHeight > details.clientHeight + 1) return true;
    const codes = label.querySelector<HTMLElement>('.ship-codes');
    if (codes && label.classList.contains('ship-tall')) {
      const end = details.getBoundingClientRect().bottom;
      if (end > codes.getBoundingClientRect().top + 1) return true;
    }
    return [...label.querySelectorAll<HTMLElement>('[data-fit-box], .ship-qr, .ship-codes, .ship-row dt, .ship-row dd')].some(element => {
      const rect = element.getBoundingClientRect();
      return element.scrollWidth > element.clientWidth + 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1;
    });
  }
  let scale = 1;
  while (overflows() && scale > minimumScale) {
    scale = Math.max(minimumScale, scale - .025);
    label.style.setProperty('--ship-fit-scale', String(scale));
  }
  const fits = !overflows();
  if (fits) delete label.dataset.printOverflow;
  else label.dataset.printOverflow = 'true';
  return fits;
}
export function assertShippingLabelsFit(content: Element) {
  const labels = content.matches?.('.shipping-label') ? [content] : [...content.querySelectorAll('.shipping-label')];
  for (const element of labels) {
    const label = element as HTMLElement;
    if (label.matches?.('.ship-template, .ship-custom')) {
      if (fitShippingLabel(label) === false) throw new Error(label.dataset.printQrError || 'This shipping label is too long for the selected paper. Choose a larger label or show fewer details in Printer Settings.');
    } else {
      // Keep the previous guard for legacy/custom layouts.
      const height = Number(label.dataset.heightMm), width = Number(label.dataset.widthMm);
      const bounds = label.getBoundingClientRect();
      if (height && width && bounds.height > bounds.width / width * height + 2)
        throw new Error('This shipping label is too long for the selected paper. Choose a larger label or show fewer details in Printer Settings.');
    }
  }
}
