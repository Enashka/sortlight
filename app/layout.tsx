import type { Metadata, Viewport } from "next";
import "./globals.css";

const description =
  "Review, tag, and sort a folder of images with customizable keyboard shortcuts.";

export const metadata: Metadata = {
  title: "Sortlight — Local image sorter",
  description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/sortlight-64.png", type: "image/png", sizes: "64x64" },
      { url: "/icons/sortlight-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Sortlight",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    title: "Sortlight — Local image sorter",
    description,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#252928",
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
