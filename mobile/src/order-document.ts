import type * as Print from 'expo-print';
import type * as Sharing from 'expo-sharing';

export async function outputOrderDocument(document: { html: string; width?: number; height?: number }, share: boolean, shipping: boolean, printer: typeof Print, sharing?: typeof Sharing) {
  if (!document.html?.trim()) throw new Error('The print document is empty. Please reopen the order.');
  if (share && (!sharing || !await sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  const pdf = await printer.printToFileAsync({ html: document.html, width: document.width, height: document.height, margins: { top: 0, right: 0, bottom: 0, left: 0 } });
  if (!pdf.uri || pdf.numberOfPages < 1) throw new Error('The PDF could not be created. Please try again.');
  if (shipping && pdf.numberOfPages !== 1) throw new Error('This label does not fit on one page. Choose a larger shipping label or smaller font in Printer Settings.');
  if (share) await sharing!.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share receipt' });
  else await printer.printAsync({ uri: pdf.uri });
}
