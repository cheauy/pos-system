(() => {
  const watched = new WeakSet();
  let pending = false;
  let lastHeight = 0;
  const observer = new MutationObserver(schedule);
  const resize = new ResizeObserver(schedule);

  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(check);
  }

  function hasCreative(doc, depth = 0) {
    if (!doc?.body || depth > 3) return false;
    if (!watched.has(doc)) {
      watched.add(doc);
      observer.observe(doc.body, { childList: true, subtree: true });
      doc.addEventListener("load", schedule, true);
    }
    for (const image of doc.images) {
      const box = image.getBoundingClientRect();
      if (image.complete && image.naturalWidth >= 20 && image.naturalHeight >= 20 && box.width >= 20 && box.height >= 20) return true;
    }
    for (const link of doc.querySelectorAll("a[href]")) {
      const box = link.getBoundingClientRect();
      const text = link.textContent.trim() || link.parentElement?.querySelector('[class$="__title"]')?.textContent.trim() || "";
      if (box.width >= 80 && box.height >= 40 && text.length >= 12) return true;
    }
    for (const frame of doc.querySelectorAll("iframe")) {
      try { if (hasCreative(frame.contentDocument, depth + 1)) return true; } catch { /* Cross-origin creative documents remain isolated. */ }
    }
    return false;
  }

  function check() {
    pending = false;
    if (!hasCreative(document)) {
      if (lastHeight) {
        lastHeight = 0;
        window.parent.postMessage({ type: "tenh-ad-state", visible: false, height: 0 }, "https://temp-mail.tenh-pos.com");
      }
      return;
    }
    const height = Math.ceil(document.body.getBoundingClientRect().height);
    if (height < 20 || height === lastHeight) return;
    lastHeight = height;
    // Send dimensions only; no message content, mailbox address or visitor identifiers.
    window.parent.postMessage({ type: "tenh-ad-state", visible: true, height }, "https://temp-mail.tenh-pos.com");
  }

  resize.observe(document.body);
  window.addEventListener("resize", schedule);
  schedule();
})();
