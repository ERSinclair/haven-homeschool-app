import type { Metadata } from "next";
import { Nunito, Fredoka } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ScrollToTop from "@/components/ScrollToTop";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import "@/lib/errorHandler"; // Global error suppression

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Haven - Find Your Parent Community",
  description: "Connect with local families who have kids the same age. Build your village, find your people.",
  icons: {
    icon: '/favicon.svg',
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
        <meta name="theme-color" content="#0D9488" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              height: 100%;
              overflow-x: hidden;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
            }
            
            body {
              min-height: 100vh;
              padding-bottom: 5rem !important;
            }
            
            /* Fix for mobile scrolling */
            * {
              -webkit-overflow-scrolling: touch;
            }
            
            /* Ensure all main containers can scroll */
            main {
              overflow-y: auto;
              min-height: calc(100vh - 5rem);
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
              {children}
            </main>
            <BottomNav />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
