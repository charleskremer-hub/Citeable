declare global {
  interface Window {
    /**
     * Posé par le chargeur `array.js` de PostHog (voir `PostHogInit.tsx`).
     *
     * Le type décrit UNIQUEMENT la surface que l'application utilise — `capture`
     * sur sept sites d'appel, `init` au chargement. Tout est optionnel côté
     * appelant : avant le chargement du script, et sur les navigateurs internes
     * où on ne le charge pas du tout, `window.posthog` est `undefined` et les
     * appels en `?.` ne font rien.
     */
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      init?: (token: string, config?: Record<string, unknown>) => void;
      opt_out_capturing?: () => void;
      __loaded?: boolean;
    };
  }
}
export {};
