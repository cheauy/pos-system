"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  function handlePrint() {
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="no-print inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
    >
      <Printer size={19} />
      Print Receipt
    </button>
  );
}