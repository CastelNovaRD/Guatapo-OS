import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guatapo OS",
  description: "Sistema administrativo Guatapo",
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