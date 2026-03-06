import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { ConnectionProvider } from "@/lib/connection-store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Toaster } from "@/components/ui/sonner";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Video Upscaler",
  description: "Upscaling video con ComfyUI + RealESRGAN su RunPod",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${jakarta.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
          <ConnectionProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">{children}</main>
              </div>
            </div>
            <Toaster richColors position="bottom-right" />
          </ConnectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
