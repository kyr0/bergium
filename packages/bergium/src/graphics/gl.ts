/** GL program utilities shared by every GPU pass (Geiss and MilkDrop alike). */

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to allocate GL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`GL shader compile failed: ${log ?? "(no info log)"}`);
  }
  return shader;
}

export function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to allocate GL program");
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`GL program link failed: ${log ?? "(no info log)"}`);
  }
  return program;
}
