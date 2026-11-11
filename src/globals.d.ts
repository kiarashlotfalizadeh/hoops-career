/** Injected by vite.config.ts at build time. */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

/** A model Blender built (see scripts/blender): the address it's served from. */
declare module '*.glb?url' {
  const url: string;
  export default url;
}
