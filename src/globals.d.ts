/** Injected by vite.config.ts at build time. */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

/** A model Blender built (see scripts/blender): the address it's served from. */
declare module '*.glb?url' {
  const url: string;
  export default url;
}
declare module '*.bin?url' {
  const url: string;
  export default url;
}
/** And a picture it built beside one (the figure's skin map, see scripts/blender/anatomy.py). */
declare module '*.png?url' {
  const url: string;
  export default url;
}
