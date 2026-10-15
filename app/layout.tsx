import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  themeColor: "#0f2a47",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
