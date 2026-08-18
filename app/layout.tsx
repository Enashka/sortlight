import type { Metadata } from "next";
import "./globals.css";

const description =
  "Review, tag, and sort a folder of images with customizable keyboard shortcuts.";

export const metadata: Metadata = {
  title: "Sortlight — Local image sorter",
  description,
  openGraph: {
    type: "website",
    title: "Sortlight — Local image sorter",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
