import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopDesk OS",
  description: "Sistema administrativo de CastelNova",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
