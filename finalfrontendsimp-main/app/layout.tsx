import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MockStoreProvider } from "@/lib/mock-store";
import { PrototypeBanner } from "@/components/shared/PrototypeBanner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SIMPLEIN School Portal — Academic Management Prototype",
  description: "Front-end interactive demonstration prototype for school records, attendance, marks, and communication.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 font-sans">
        <MockStoreProvider>
          <PrototypeBanner />
          <div className="flex-1 flex flex-col">{children}</div>
        </MockStoreProvider>
      </body>
    </html>
  );
}
