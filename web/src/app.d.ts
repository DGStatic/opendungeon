// See https://svelte.dev/docs/kit/types#app.d.ts

import type { ClassValue } from "svelte/elements";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  namespace svelteHTML {
    interface IntrinsicElements {
      "model-viewer": HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        "camera-controls"?: boolean;
        "auto-rotate"?: boolean;
        "auto-rotate-delay"?: string | number;
        "rotation-per-second"?: string | number;
        "disable-zoom"?: boolean;
        "shadow-intensity"?: string | number;
        "environment-image"?: string;
        exposure?: string | number;
        class?: ClassValue
      };
    }
  }
}

export {};
