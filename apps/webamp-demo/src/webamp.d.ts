/**
 * Minimal type shim for the vendored Webamp fork consumed via the pre-built bundle.
 *
 * Declares only the surface this demo uses so it type-checks without depending on
 * the fork's generated `built/types/**` (which only exist after building the fork).
 * At runtime, Vite resolves `webamp/butterchurn` via the alias in vite.config.ts.
 */
declare module "webamp/butterchurn" {
  export interface WebampTrack {
    url: string;
    metaData?: { artist?: string; title?: string };
    duration?: number;
  }
  export interface WebampOptions {
    zIndex?: number;
    initialTracks?: WebampTrack[];
    enableMediaSession?: boolean;
  }
  export default class Webamp {
    constructor(options?: WebampOptions);
    renderWhenReady(node: HTMLElement): Promise<void>;
  }
}

declare module "webamp" {
  export { default } from "webamp/butterchurn";
}
