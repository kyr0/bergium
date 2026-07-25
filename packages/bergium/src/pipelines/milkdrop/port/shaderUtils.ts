/**
 * ShaderUtils — shader string parsing and GL capability detection.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/shaders/shaderUtils.js
 * (pinned revision fbac2f6). Used by all shader modules to split preset shader text
 * and detect fragment-float precision.
 */

const lineMatcher = /uniform sampler2D sampler_(?:.+?);/g;
const samplerMatcher = /uniform sampler2D sampler_(.+?);/;

export default class ShaderUtils {
  /** Split preset shader text into [header, body] at the `shader_body` marker. */
  public static getShaderParts(t: string): [string, string] {
    const sbIndex = t.indexOf("shader_body");
    if (t && sbIndex > -1) {
      const beforeShaderBody = t.substring(0, sbIndex);
      const afterShaderBody = t.substring(sbIndex);
      const firstCurly = afterShaderBody.indexOf("{");
      const lastCurly = afterShaderBody.lastIndexOf("}");
      const shaderBody = afterShaderBody.substring(firstCurly + 1, lastCurly);
      return [beforeShaderBody, shaderBody];
    }
    return ["", t];
  }

  /** Detect the highest fragment-float precision the GL context supports. */
  public static getFragmentFloatPrecision(gl: WebGL2RenderingContext): string {
    if (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)!.precision > 0) {
      return "highp";
    } else if (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT)!.precision > 0) {
      return "mediump";
    }
    return "lowp";
  }

  /** Extract user-declared sampler2D names from shader text. */
  public static getUserSamplers(text: string): Array<{ sampler: string }> {
    const samplers: Array<{ sampler: string }> = [];
    const lineMatches = text.match(lineMatcher);
    if (lineMatches && lineMatches.length > 0) {
      for (let i = 0; i < lineMatches.length; i++) {
        const samplerMatches = lineMatches[i]!.match(samplerMatcher);
        if (samplerMatches && samplerMatches.length > 0) {
          const sampler = samplerMatches[1]!;
          samplers.push({ sampler });
        }
      }
    }
    return samplers;
  }
}
