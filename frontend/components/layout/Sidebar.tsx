"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, ListVideo, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/upscale",   icon: Upload,          label: "Nuovo Upscale" },
  { href: "/jobs",      icon: ListVideo,        label: "Coda Job" },
  { href: "/settings",  icon: Settings,         label: "Impostazioni" },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <span className="font-semibold text-sm tracking-tight leading-none">Video Upscaler</span>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">RunPod + ComfyUI</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const isActive = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  isActive ? "text-primary" : ""
                )}
              />
              {label}
              {isActive && (
                <span className="ml-auto w-1 h-4 rounded-full bg-primary/70 block" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground/50 font-mono">v0.1.0</p>
      </div>
    </aside>
  );
}
