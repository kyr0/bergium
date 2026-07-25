#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

// 8-bit profile presentation: map each scalar intensity byte through the 256x1
// palette LUT. The intensity source is a normalized RGBA8 texture (red byte) so it
// can consume the warp pass's RGBA8 output directly; the LUT is an exact RGBA8UI
// texture. Palette is applied ONLY at presentation and never fed back (plan).

uniform sampler2D uIntensity;  // RGBA8 normalized, red = intensity/255
uniform highp usampler2D uLut; // RGBA8UI, 256x1

layout(location = 0) out vec4 outColor;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  // +0.5 recovers the exact byte from the normalized red channel (value/255 round-trips).
  int idx = int(texelFetch(uIntensity, p, 0).r * 255.0 + 0.5);
  uvec4 c = texelFetch(uLut, ivec2(idx, 0), 0);
  outColor = vec4(c) / 255.0;
}
