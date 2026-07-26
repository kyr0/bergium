/**
 * Preset names from the `butterchurn-presets` library that are known to crash or render
 * incorrectly (sourced from the vendor/milkymilky allow-list). Kept as bergium-internal
 * data so consumers never have to filter presets themselves.
 */
export const DISABLED_PRESET_NAMES: ReadonlySet<string> = new Set([
  "martin - The bridge",
  "sawtooth grin roam",
  "martin - extreme heat",
  "_Geiss - Desert Rose 2",
  "Idiot - Star Of Annon",
  "martin + flexi - diamond cutter [prismaticvortex.com] - camille - i wish i wish i wish i was constrained",
  "martin - fruit machine",
  "martin - The Bridge of Khazad-Dum",
  "martin - frosty caves 2",
  "martin - witchcraft reloaded",
  "martin - chain breaker",
  "_Geiss - untitled",
  "Milk Artist At our Best - FED - SlowFast Ft AdamFX n Martin - HD CosmoFX",
  "Geiss + Flexi + Martin - disconnected",
  "Unchained & Rovastar - Wormhole Pillars (Hall of Shadows mix)",
]);
