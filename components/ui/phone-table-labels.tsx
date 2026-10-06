"use client";
import { useEffect } from "react";

// Copies each column header into its cells (data-label) so globals.css can show
// workspace tables as labeled cards on phones. Only adds attributes; React-owned
// content and desktop tables are untouched.
function label(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>("table:not([data-phone-layout])")) {
    const headers: string[] = [];
    for (const th of table.querySelectorAll<HTMLTableCellElement>("thead tr:last-child > th")) {
      const text = th.innerText.trim().replace(/\s+/g, " ");
      for (let i = 0; i < Math.max(1, th.colSpan); i++) headers.push(text);
    }
    if (!headers.length) continue;
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody > tr")) {
      let column = 0;
      for (const cell of row.cells) {
        const text = cell.colSpan > 1 ? "" : headers[column] ?? "";
        if (cell.dataset.label !== text) cell.dataset.label = text;
        column += Math.max(1, cell.colSpan);
      }
    }
  }
}

// Summary-card grids: every card is short text containing a number, no controls.
function markStats(root: ParentNode) {
  for (const grid of root.querySelectorAll<HTMLElement>(".grid:not([data-stat-grid])")) {
    const cards = [...grid.children] as HTMLElement[];
    if (cards.length < 2 || grid.querySelector("input,select,textarea,table,form,button,a[href],img,canvas,[role=tab]")) continue;
    if (cards.every(card => { const text = card.innerText.trim(); return text.length > 0 && text.length < 90 && /(^|\n)\s*[$៛€]?\s*[\d,.]+\s*%?\s*($|\n)/.test(text); })) grid.dataset.statGrid = "";
  }
}

export default function PhoneTableLabels() {
  useEffect(() => {
    const root = document.querySelector(".workspace-content");
    if (!root) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { label(root); markStats(root); }); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
