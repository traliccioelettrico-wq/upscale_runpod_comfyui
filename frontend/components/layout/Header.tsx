"use client";
import { ConnectionBadge } from "./ConnectionBadge";
import { useConnection } from "@/lib/connection-store";

export function Header() {
  const { connection } = useConnection();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-4">
        {connection && (
          <span className="text-xs text-muted-foreground hidden sm:block">
            {connection.name}
          </span>
        )}
        <ConnectionBadge />
      </div>
    </header>
  );
}
