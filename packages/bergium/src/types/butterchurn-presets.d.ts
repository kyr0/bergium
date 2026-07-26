/**
 * Minimal ambient declaration for the CJS `butterchurn-presets` package.
 *
 * The package ships a UMD bundle; at runtime it exposes both a named `getPresets`
 * and a default export (the same object). Declared here so bergium-core can lazy
 * `import("butterchurn-presets")` without pulling its (absent) bundled types.
 */
declare module "butterchurn-presets" {
  /** Returns a map of preset name => preset object. */
  export function getPresets(): Record<string, unknown>;
  const _default: { getPresets: typeof getPresets };
  export default _default;
}
