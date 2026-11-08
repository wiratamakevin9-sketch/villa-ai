import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Villa AI",
  description: "Asisten manajemen bisnis villa berbasis AI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
