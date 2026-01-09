import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConvexClientProvider } from "@/components/providers/convex-provider";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
});
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
export const metadata: Metadata = {
  title: "Docsy - Chat with your documents",
  description:
    "Drop your PDFs, docs, and text files. Ask questions. Get instant answers powered by AI. Your personal research assistant.",
  keywords: [
    "document chat",
    "AI",
    "PDF",
    "research assistant",
    "NotebookLM alternative",
  ],
  openGraph: {
    title: "Docsy - Chat with your documents",
    description:
      "Drop your PDFs, docs, and text files. Ask questions. Get instant answers powered by AI.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Docsy - Chat with your documents",
    description:
      "Drop your PDFs, docs, and text files. Ask questions. Get instant answers powered by AI.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={jetbrainsMono.variable}
      >
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
