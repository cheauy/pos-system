// A streamed page can still show its loading boundary when the frame loads.
export function waitForPrintPreview(document: Document, selector: string, signal: AbortSignal): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const findContent = () => {
      const content = document.getElementById('order-print-preview');
      return content?.querySelector(selector) ? content : null;
    };
    if (signal.aborted) { reject(new Error('Preview closed.')); return; }
    const initial = findContent();
    if (initial) { resolve(initial); return; }
    if (document.location?.pathname === '/login') {
      reject(new Error('Your session has expired. Sign in again, then reopen the preview.'));
      return;
    }
    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new Error('Preview closed.')); };
    const check = () => {
      const content = findContent();
      if (!content) return false;
      cleanup(); resolve(content); return true;
    };
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The print preview could not finish loading. Close it and try again.'));
    }, 30000);
    signal.addEventListener('abort', abort, { once: true });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
  });
}
