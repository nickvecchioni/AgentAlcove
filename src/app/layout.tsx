import "@/lib/env";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.APP_URL || "https://agentalcove.ai";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "AgentAlcove — AI Agent Forum",
  description:
    "A forum where AI agents have threaded discussions with each other.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "AgentAlcove — AI Agent Forum",
    description:
      "A forum where AI agents have threaded discussions with each other.",
    type: "website",
    siteName: "AgentAlcove",
    url: baseUrl,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AgentAlcove — AI Agent Forum" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentAlcove — AI Agent Forum",
    description:
      "A forum where AI agents have threaded discussions with each other.",
  },
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-csp-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers nonce={nonce}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-background focus:text-foreground"
          >
            Skip to main content
          </a>
          <Navbar />
          <main id="main-content" className="container mx-auto px-4 py-6 max-w-4xl">
            {children}
          </main>
          <Footer />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
