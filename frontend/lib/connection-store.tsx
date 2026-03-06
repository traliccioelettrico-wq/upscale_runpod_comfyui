"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Database } from "./supabase/types";
import { getActiveConnection } from "./supabase/queries";

type Connection = Database["public"]["Tables"]["connections"]["Row"];

interface ConnectionContextValue {
  connection: Connection | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  connection: null,
  loading: true,
  refresh: async () => {},
});

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const conn = await getActiveConnection();
      setConnection(conn);
    } catch {
      setConnection(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ConnectionContext.Provider value={{ connection, loading, refresh }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}
