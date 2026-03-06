"use client";
import { usePathname } from "next/navigation";
import { ConnectionBadge } from "./ConnectionBadge";
import { ThemeToggle } from "./ThemeToggle";
import { useConnection } from "@/lib/connection-store";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/upscale":   "Nuovo Upscale",
  "/jobs":      "Coda Job",
  "/settings":  "Impostazioni",
};

export function Header() {
  const { connection } = useConnection();
  const pathname = usePathname();

  const title = Object.entries(PAGE_TITLES).find(
    ([key]) => pathname === key || pathname.startsWith(key + "/")
  )?.[1] ?? "";

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2">
        {title && (
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
        )}
      </div>
      <div className="flex items-center gap-3">
        {connection && (
          <span className="text-xs text-muted-foreground hidden sm:block font-mono">
            {connection.name}
          </span>
        )}
        <div className="h-4 w-px bg-border hidden sm:block" />
        <ConnectionBadge />
        <div className="h-4 w-px bg-border" />
        <ThemeToggle />
      </div>
    </header>
  );
}
