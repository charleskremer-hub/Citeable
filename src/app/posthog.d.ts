declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
    gtag?: (
      command: "event" | "config" | "js" | "set",
      targetOrName: string,
      params?: Record<string, unknown>,
    ) => void;
  }
}
export {};
