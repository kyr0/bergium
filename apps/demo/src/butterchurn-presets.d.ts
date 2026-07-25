/** Minimal type declaration for the CJS butterchurn-presets package. */
declare module "butterchurn-presets" {
  /** Returns a map of preset name => preset object. */
  export function getPresets(): Record<string, unknown>;
  const _default: { getPresets: typeof getPresets };
  export default _default;
}
