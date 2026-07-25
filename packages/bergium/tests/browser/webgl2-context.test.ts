import { test, expect } from "vitest";

/**
 * Why: the classic GPU profile (plan Phase 5) needs a real WebGL2 device. This
 * confirms headless Chromium exposes WebGL2 and supports the exact primitives the
 * reference design depends on: an R8UI integer texture for map/feedback sampling,
 * and a color-renderable RGBA8 framebuffer for the portable ping-pong target.
 */
test("WebGL2 device + classic-profile integer/renderable primitives", () => {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const gl = canvas.getContext("webgl2");
  expect(gl, "WebGL2 must be available in headless Chromium").not.toBeNull();
  if (!gl) return;

  expect(String(gl.getParameter(gl.VERSION))).toMatch(/WebGL 2\.0/);

  // R8UI integer texture (map base coords / sampled feedback intensity).
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 4, 4, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(16));
  expect(gl.getError()).toBe(gl.NO_ERROR);

  // RGBA8 is color-renderable: the portable feedback ping-pong target.
  const color = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);

  gl.deleteTexture(tex);
  gl.deleteTexture(color);
  gl.deleteFramebuffer(fbo);
});
