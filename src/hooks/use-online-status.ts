import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ConnectionState = "ONLINE" | "CHECKING" | "OFFLINE" | "DEGRADED";

export function useOnlineStatus() {
  const [status, setStatus] = useState<ConnectionState>(navigator.onLine ? "ONLINE" : "OFFLINE");

  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus("OFFLINE");
      return;
    }

    setStatus("CHECKING");
    try {
      // Use Supabase health endpoint or a simple lightweight query
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Lightweight probe
      const { error } = await supabase
        .from("profiles")
        .select("id")
        .limit(1)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        // We reached server but it returned an error
        setStatus("DEGRADED");
      } else {
        setStatus("ONLINE");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("DEGRADED");
      } else {
        // Network failure despite navigator.onLine being true
        setStatus("OFFLINE");
      }
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkConnectivity();

    const handleOnline = () => {
      checkConnectivity();
    };

    const handleOffline = () => {
      setStatus("OFFLINE");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodically poll if we are degraded or checking didn't succeed well
    const intervalId = setInterval(() => {
      if (status !== "ONLINE") {
        checkConnectivity();
      }
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(intervalId);
    };
  }, [checkConnectivity, status]);

  return { status, checkConnectivity };
}
