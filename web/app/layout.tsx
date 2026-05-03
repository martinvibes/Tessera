import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteChrome } from "@/components/site-chrome";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tessera — Private settlement for public blockchains",
  description:
    "Institutional rails for on-chain RWA settlement. Encrypted by Zama FHE, atomic by design.",
};

// Inline before paint: read saved theme (or system pref) and stamp data-theme.
// Prevents the dark→light flash on hydration.
const NO_FLASH_THEME = `
(function(){try{
  var stored = localStorage.getItem('tessera:theme');
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
}catch(_){
  document.documentElement.dataset.theme = 'dark';
}})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${fraunces.variable} ${geist.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="relative min-h-full bg-ink text-paper font-sans">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
