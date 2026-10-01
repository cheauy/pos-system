import type { ReactNode } from "react";
import "./settings-layout.css";
export default function SettingsLayout({children}:{children:ReactNode}) {
  return <div className="general-settings-layout">{children}</div>;
}
