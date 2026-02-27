import type { Metadata } from "next";
import { Nunito, Fredoka } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ToastContainer from "@/components/ToastContainer";
import ScrollToTop from "@/components/ScrollToTop";
import PageWrapper from "@/components/PageWrapper";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import "@/lib/errorHandler"; // Global error suppression

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Haven - Find Your Homeschool Community",
  description: "Connect with local homeschool families. Find your village, build community, plan meetups.",
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#059669" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Haven" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <style dangerouslySetInnerHTML={{
          __html: `
            body {
              min-height: 100vh;
              padding-bottom: 5rem !important;
            }
          `
        }} />
      </head>
      <body
        className={`${nunito.variable} ${fredoka.variable} font-sans antialiased`}
        style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}
      >
        <ThemeProvider>
          <AuthProvider>
            <ScrollToTop />
            <main className="min-h-screen" style={{ paddingBottom: '5rem' }}>
              <PageWrapper>{children}</PageWrapper>
            </main>
            <BottomNav />
            <ToastContainer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
