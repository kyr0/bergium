import { test, expect } from "vitest";
import { createVisualizer } from "../../src/index.js";

/**
 * Phase 1 contract: the Butterchurn-compatible factory must stay present on the
 * public entry point. Full behavioural coverage (connectAudio / loadPreset /
 * setRendererSize / launchSongTitleAnim / render) needs a real AudioContext and
 * canvas and therefore lives in the browser project; here we only pin the
 * exported symbol shape that existing hosts such as Webamp depend on.
 */
test("createVisualizer is exported as a function on the public entry", () => {
  expect(typeof createVisualizer).toBe("function");
});
