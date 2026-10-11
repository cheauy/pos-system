"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Filter, Search, X } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import styles from "./suppliers-responsive.module.css";

export default function CompactSupplierFilters({ search, onSearch, status, onApply }: {
  search: string; onSearch: (value: string) => void; status: string; onApply: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current, button = trigger.current;
    const desktop = window.matchMedia("(min-width: 1280px) and (hover: hover) and (pointer: fine)");
    const onDesktop = () => { if (desktop.matches) setOpen(false); };
    node?.showModal();
    desktop.addEventListener("change", onDesktop);
    return () => { desktop.removeEventListener("change", onDesktop); node?.close(); button?.focus({ preventScroll: true }); };
  }, [open]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("statusFilter"));
    setOpen(false);
    onApply(value);
  }

  return <div className={styles.compactToolbar}>
    <label className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" aria-label={t("Search suppliers...")} placeholder={t("Search suppliers...")} value={search} onChange={event => onSearch(event.target.value)} /></label>
    <button ref={trigger} type="button" aria-label={t("Filter")} aria-haspopup="dialog" aria-expanded={open} className={status !== "all" ? styles.activeFilter : undefined} onClick={() => setOpen(true)}><Filter size={18} aria-hidden="true" /></button>
    {open && <dialog ref={dialog} aria-labelledby="supplier-filter-title" className={styles.filterDialog} onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setOpen(false); }}>
      <header><h2 id="supplier-filter-title">{t("Filters")}</h2><button type="button" aria-label={t("Close dialog")} onClick={() => setOpen(false)}><X size={20} /></button></header>
      <form onSubmit={apply}>
        <label>{t("Status")}<select name="statusFilter" required defaultValue={status}><option value="all">{t("All Status")}</option><option value="active">{t("Active")}</option><option value="inactive">{t("Inactive")}</option></select></label>
        <footer><button type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button><button type="submit" className={styles.primary}>{t("Apply")}</button></footer>
      </form>
    </dialog>}
  </div>;
}
