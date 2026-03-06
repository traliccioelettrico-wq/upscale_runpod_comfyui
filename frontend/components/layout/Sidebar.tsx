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
    <aside className="w-56 flex-shrink-0 border-r border-border bg-card flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        <Zap className="w-5 h-5 text-violet-400" />
        <span className="font-semibold text-sm tracking-tight">Video Upscaler</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              path === href || path.startsWith(href + "/")
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
