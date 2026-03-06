import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ConnectionProvider } from "@/lib/connection-store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Video Upscaler",
  description: "Upscaling video con ComfyUI + RealESRGAN su RunPod",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body className={`${geist.variable} font-sans antialiased bg-background text-foreground`}>
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
      </body>
    </html>
  );
}
