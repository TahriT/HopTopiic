import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook for casting the river diagram to an external display using
 * the browser Presentation API (Chrome "Cast" device picker).
 *
 * Disabled automatically on the overlay/receiver page (?overlay=true)
 * to prevent the receiver from interfering with the active session.
 */

const isOverlayPage =
  new URLSearchParams(window.location.search).get("overlay") === "true";

/** True when the user is on localhost/127.0.0.1 — cast devices can't reach it. */
function isLocalhost(): boolean {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

export function useCast() {
  const [isCasting, setIsCasting] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const presentationRef = useRef<PresentationConnection | null>(null);
  const requestRef = useRef<PresentationRequest | null>(null);

  const castUrl = `${window.location.origin}${window.location.pathname}?overlay=true`;

  /** Attach lifecycle listeners on a PresentationConnection. */
  const bindConnection = useCallback((connection: PresentationConnection) => {
    presentationRef.current = connection;
    setIsCasting(true);

    const cleanup = () => {
      presentationRef.current = null;
      setIsCasting(false);
    };

    connection.addEventListener("close", cleanup);
    connection.addEventListener("terminate", cleanup);

    // Critical: handle connection-level errors so they don't
    // bubble up as unhandled and crash the React tree.
    connection.addEventListener("error", (e) => {
      console.warn("[Cast] connection error:", e);
      setCastError("Cast connection lost. The receiving device may not be reachable.");
      cleanup();
    });
  }, []);

  /* Pre-create the PresentationRequest so the browser can monitor
     availability in the background (enables the native cast icon).
     Skip on the overlay page — receiver must not interfere. */
  useEffect(() => {
    if (isOverlayPage) return;
    if (typeof PresentationRequest === "undefined") return;
    try {
      const req = new PresentationRequest([castUrl]);
      requestRef.current = req;
      if (navigator.presentation) {
        navigator.presentation.defaultRequest = req;
      }
    } catch {
      // PresentationRequest constructor can throw on unsupported origins
    }
  }, [castUrl]);

  const startCast = useCallback(async () => {
    setCastError(null);

    // Don't cast from the overlay/receiver page
    if (isOverlayPage) {
      setCastError("Cannot cast from the overlay page.");
      return;
    }

    // Warn if on localhost — cast device won't be able to reach it
    if (isLocalhost()) {
      setCastError(
        "You're on localhost — cast devices can't reach this address. " +
        "Open the app using your LAN IP (e.g. https://192.168.x.x:5173) and try again.",
      );
      return;
    }

    // ----- Presentation API (Chrome / Edge cast dialog) -----
    if (typeof PresentationRequest !== "undefined" && navigator.presentation) {
      try {
        const request = requestRef.current ?? new PresentationRequest([castUrl]);
        const connection = await request.start(); // native device-picker
        bindConnection(connection);
        return;
      } catch (err: any) {
        // User cancelled the picker – not an error
        if (err?.name === "NotAllowedError" || err?.name === "AbortError") return;
        console.warn("[Cast] Presentation API error:", err);
        setCastError(
          "Cast failed. Make sure a cast device is on the same network, " +
          "or use Chrome menu ⋮ → Cast… to cast this tab directly.",
        );
        return;
      }
    }

    // ----- No Presentation API support -----
    setCastError(
      "Your browser doesn't support casting. " +
      "Use Google Chrome or Microsoft Edge and click ⋮ → Cast… to cast this tab.",
    );
  }, [castUrl, bindConnection]);

  const stopCast = useCallback(() => {
    if (presentationRef.current) {
      try {
        presentationRef.current.terminate();
      } catch (err) {
        console.warn("[Cast] terminate error (ignored):", err);
      }
      presentationRef.current = null;
    }
    setIsCasting(false);
    setCastError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCast();
    };
  }, [stopCast]);

  return { isCasting, startCast, stopCast, castError };
}
