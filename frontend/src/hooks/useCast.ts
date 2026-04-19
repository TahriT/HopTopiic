import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook for casting the river diagram to an external display using
 * the browser Presentation API (Chrome "Cast" device picker).
 *
 * No window.open fallback – if the browser doesn't support the
 * Presentation API the user gets a clear error instead of a popup.
 */
export function useCast() {
  const [isCasting, setIsCasting] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const presentationRef = useRef<PresentationConnection | null>(null);
  const requestRef = useRef<PresentationRequest | null>(null);

  const castUrl = `${window.location.origin}${window.location.pathname}?overlay=true`;

  /* Pre-create the PresentationRequest so the browser can monitor
     availability in the background (enables the native cast icon). */
  useEffect(() => {
    if (typeof PresentationRequest === "undefined") return;
    try {
      const req = new PresentationRequest([castUrl]);
      requestRef.current = req;
      // Tell the browser this is the default presentation request
      // (shows the cast icon in the toolbar when a display is available)
      if (navigator.presentation) {
        navigator.presentation.defaultRequest = req;
      }
    } catch {
      // PresentationRequest constructor can throw on unsupported origins
    }
  }, [castUrl]);

  const startCast = useCallback(async () => {
    setCastError(null);

    // ----- Presentation API (Chrome / Edge cast dialog) -----
    if (typeof PresentationRequest !== "undefined" && navigator.presentation) {
      try {
        const request = requestRef.current ?? new PresentationRequest([castUrl]);
        const connection = await request.start(); // native device-picker
        presentationRef.current = connection;
        setIsCasting(true);

        connection.addEventListener("close", () => {
          presentationRef.current = null;
          setIsCasting(false);
        });
        connection.addEventListener("terminate", () => {
          presentationRef.current = null;
          setIsCasting(false);
        });
        return;
      } catch (err: any) {
        // User cancelled the picker – not an error
        if (err?.name === "NotAllowedError" || err?.name === "AbortError") return;
        console.warn("[Cast] Presentation API error:", err?.message);
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
  }, [castUrl]);

  const stopCast = useCallback(() => {
    if (presentationRef.current) {
      try {
        presentationRef.current.terminate();
      } catch {
        // ignore
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
