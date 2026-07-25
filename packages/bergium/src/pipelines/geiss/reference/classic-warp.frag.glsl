#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

// R8UI INTEGER-RENDER-TARGET VARIANT (reference/spec only). mapBase stores source
// x/y; mapWeights stores w00,w10,w01,w11, each already independently truncated to a
// byte. This writes a uvec4 to an integer color attachment, which is NOT
// color-renderable in WebGL2, so it cannot be the browser path. The operative,
// WebGL2-portable exact warp is
// src/pipelines/geiss/gpu/classic-warp-rgba8.frag.glsl (RGBA8 red byte, flat-indexed
// taps). This file documents the R8UI form for APIs that offer integer renderability.
uniform highp usampler2D uFeedback;
uniform highp usampler2D uMapBase;
uniform highp usampler2D uMapWeights;
layout(location = 0) out uvec4 outIntensity;

void main() {
  ivec2 destination = ivec2(gl_FragCoord.xy);
  ivec2 source = ivec2(texelFetch(uMapBase, destination, 0).rg);
  uvec4 w = texelFetch(uMapWeights, destination, 0);
  uint p00 = texelFetch(uFeedback, source, 0).r;
  uint p10 = texelFetch(uFeedback, source + ivec2(1, 0), 0).r;
  uint p01 = texelFetch(uFeedback, source + ivec2(0, 1), 0).r;
  uint p11 = texelFetch(uFeedback, source + ivec2(1, 1), 0).r;
  uint value = (p00*w.r + p10*w.g + p01*w.b + p11*w.a) >> 8;
  outIntensity = uvec4(value, 0u, 0u, 255u);
}

