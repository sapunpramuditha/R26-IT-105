import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "HireNova | The Future of Hiring",
  description: "AI-Powered Recruitment and Video Interviews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-white text-slate-900 min-h-screen flex flex-col">
        <Header />
        <main className="w-full">
          {children}
        </main>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
