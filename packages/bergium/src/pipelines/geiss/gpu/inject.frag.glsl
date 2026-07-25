#version 300 es
precision highp float;

// Injection fragment: emit the per-pixel contribution in the red channel. The
// actual max/saturating-add rule is applied by GL blend (see GeissInject), which
// reads the destination intensity already in the framebuffer. Keeping the rule in
// fixed-function blend makes it match the CPU injectMax/injectAdd byte-for-byte:
// MAX  -> dst = max(dst, value)
// ADD  -> dst = min(255, dst + value)   (framebuffer clamps to 1.0)
uniform sampler2D uContrib; // RGBA8 normalized, red = contribution byte/255

layout(location = 0) out vec4 outColor;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float v = texelFetch(uContrib, p, 0).r;
  outColor = vec4(v, 0.0, 0.0, 1.0);
}
