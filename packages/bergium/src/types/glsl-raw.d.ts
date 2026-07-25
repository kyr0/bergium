// GLSL shaders are kept as external files and imported as raw strings (per the
// project rule: never inline templates of other languages). Vite resolves the
// `?raw` suffix at runtime/bundle time; this ambient declaration lets strict
// TypeScript (including the `tsc` build) accept those imports.
declare module "*.glsl?raw" {
  const source: string;
  export default source;
}

declare module "*.glsl" {
  const source: string;
  export default source;
}
