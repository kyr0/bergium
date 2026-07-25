#version 300 es

// Full-screen triangle generated from gl_VertexID; no vertex buffers or attributes
// are needed. The fragment shader's gl_FragCoord is the only per-pixel input.
const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
