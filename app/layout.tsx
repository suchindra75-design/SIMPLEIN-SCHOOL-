import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SIMPLEIN SCHOOL ERP",
    template: "%s · SIMPLEIN SCHOOL ERP",
  },
  description:
    "Multi-tenant school ERP by SIMPLEIN SOLUTIONS LLP (V1 architecture foundation).",
};

export const viewport: Viewport = {
  themeColor: "#f1f1f2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
