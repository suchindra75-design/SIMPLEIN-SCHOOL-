import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMPLEIN SCHOOL ERP",
  description:
    "Multi-tenant school ERP by SIMPLEIN SOLUTIONS LLP (V1 architecture foundation).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
