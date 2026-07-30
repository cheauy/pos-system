import ThemeProvider from "@/components/providers/theme-provider";
import "./globals.css";
import { Toaster } from "sonner";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
          position="top-right"
          richColors
          closeButton
        />
        </ThemeProvider>
      </body>
    </html>
  );
}