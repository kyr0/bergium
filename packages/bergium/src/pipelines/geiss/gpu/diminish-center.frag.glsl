#version 300 es
precision highp float;
precision highp int;

// GPU Diminish_Center: copy the source intensity to the destination unchanged,
// except decay the center cross (mode != 12) or the 3px vertical line (mode 12) by
// `trunc(byte * dwind)`. This is a multiplicative decay, so it is a copy/replace
// pass (no blend) that runs as the last step of the effect pass, before the warp.
// Matches vendor/geiss/Effects.h:257 (8-bit branch).

uniform sampler2D uSrc;     // RGBA8 normalized, red = intensity byte
uniform int uApply;         // 1 if center_dwindle < 0.999, else 0
uniform int uMode;          // 12 -> vertical line, else center cross
uniform int uCenterX;
uniform int uCenterY;
uniform int uCut;
uniform int uHeight;
uniform float uDwindle;     // center_dwindle

layout(location = 0) out vec4 outColor;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  // +0.5 recovers the exact byte from the normalized red channel.
  int v = int(texelFetch(uSrc, p, 0).r * 255.0 + 0.5);
  int outv = v;

  if (uApply == 1) {
    bool diminish = false;
    if (uMode == 12) {
      diminish = (p.y >= uCut && p.y < uHeight - uCut) &&
                 (p.x == uCenterX - 1 || p.x == uCenterX || p.x == uCenterX + 1);
    } else {
      diminish = (p == ivec2(uCenterX, uCenterY)) ||
                 (p == ivec2(uCenterX - 1, uCenterY)) ||
                 (p == ivec2(uCenterX + 1, uCenterY)) ||
                 (p == ivec2(uCenterX, uCenterY + 1)) ||
                 (p == ivec2(uCenterX, uCenterY - 1));
    }
    // The cross branch keeps 0/1 unchanged (>1 guard); the vertical line does not.
    if (diminish && !(uMode != 12 && v <= 1)) {
      outv = int(float(v) * uDwindle); // int() truncates toward zero == (uchar) cast
    }
  }

  outColor = vec4(float(outv) / 255.0, 0.0, 0.0, 1.0);
}
