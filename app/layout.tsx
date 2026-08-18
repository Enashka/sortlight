import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const description =
    "Review, tag, and sort a folder of images with fast, customizable keyboard shortcuts.";
  const image = new URL("/og.png", origin).toString();

  return {
    title: "Sortlight — Local image sorter",
    description,
    openGraph: {
      type: "website",
      title: "Sortlight — Local image sorter",
      description,
      url: origin,
      images: [{ url: image, width: 1200, height: 630, alt: "Sortlight image sorting workspace" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Sortlight — Local image sorter",
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
