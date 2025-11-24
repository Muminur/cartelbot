"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { SessionExpiredModal } from "@/components/auth/SessionExpiredModal";

interface SessionContextValue {
  showSessionExpired: () => void;
  isSessionExpired: boolean;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showSessionExpired = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return (
    <SessionContext.Provider value={{ showSessionExpired, isSessionExpired: isModalOpen }}>
      {children}
      <SessionExpiredModal isOpen={isModalOpen} onClose={handleModalClose} />
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
