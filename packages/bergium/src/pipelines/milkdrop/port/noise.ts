import { getRNG } from "./rngContext.js";

/**
 * Noise - generates and binds 2D/3D noise textures for preset shaders.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/noise/noise.js (pinned
 * revision fbac6f6). Uses the seeded RNG; cubic interpolation for zoom levels.
 * Only substitution: local `clamp` for the `Math.clamp` polyfill (identical).
 */

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

type RandomFn = () => number;

export default class Noise {
  private gl: WebGL2RenderingContext;
  private randomFn: RandomFn;
  private anisoExt: EXT_texture_filter_anisotropic | null;
  public noiseTexLQ: WebGLTexture;
  public noiseTexLQLite: WebGLTexture;
  public noiseTexMQ: WebGLTexture;
  public noiseTexHQ: WebGLTexture;
  public noiseTexVolLQ: WebGLTexture;
  public noiseTexVolHQ: WebGLTexture;
  public noiseTexPointLQ: WebGLSampler;

  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.randomFn = getRNG().random;
    this.anisoExt =
      gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");

    this.noiseTexLQ = gl.createTexture()!;
    this.noiseTexLQLite = gl.createTexture()!;
    this.noiseTexMQ = gl.createTexture()!;
    this.noiseTexHQ = gl.createTexture()!;
    this.noiseTexVolLQ = gl.createTexture()!;
    this.noiseTexVolHQ = gl.createTexture()!;

    const nTexArrLQ = Noise.createNoiseTex(256, 1, this.randomFn);
    const nTexArrLQLite = Noise.createNoiseTex(32, 1, this.randomFn);
    const nTexArrMQ = Noise.createNoiseTex(256, 4, this.randomFn);
    const nTexArrHQ = Noise.createNoiseTex(256, 8, this.randomFn);
    const nTexArrVolLQ = Noise.createNoiseVolTex(32, 1, this.randomFn);
    const nTexArrVolHQ = Noise.createNoiseVolTex(32, 4, this.randomFn);

    this.bindTexture(this.noiseTexLQ, nTexArrLQ, 256, 256);
    this.bindTexture(this.noiseTexLQLite, nTexArrLQLite, 32, 32);
    this.bindTexture(this.noiseTexMQ, nTexArrMQ, 256, 256);
    this.bindTexture(this.noiseTexHQ, nTexArrHQ, 256, 256);
    this.bindTexture3D(this.noiseTexVolLQ, nTexArrVolLQ, 32, 32, 32);
    this.bindTexture3D(this.noiseTexVolHQ, nTexArrVolHQ, 32, 32, 32);

    this.noiseTexPointLQ = gl.createSampler()!;
    gl.samplerParameteri(this.noiseTexPointLQ, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.samplerParameteri(this.noiseTexPointLQ, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.noiseTexPointLQ, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.samplerParameteri(this.noiseTexPointLQ, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  public bindTexture(texture: WebGLTexture, data: Uint8Array, width: number, height: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.anisoExt) {
      const max = gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }
  }

  public bindTexture3D(texture: WebGLTexture, data: Uint8Array, width: number, height: number, depth: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, width, height, depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.anisoExt) {
      const max = gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_3D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }
  }

  public static fCubicInterpolate(y0: number, y1: number, y2: number, y3: number, t: number): number {
    const t2 = t * t;
    const t3 = t * t2;
    const a0 = y3 - y2 - y0 + y1;
    const a1 = y0 - y1 - a0;
    const a2 = y2 - y0;
    return a0 * t3 + a1 * t2 + a2 * t + y1;
  }

  public static dwCubicInterpolate(y0: number[], y1: number[], y2: number[], y3: number[], t: number): number[] {
    const ret: number[] = [];
    for (let i = 0; i < 4; i++) {
      let f = Noise.fCubicInterpolate(y0[i]! / 255.0, y1[i]! / 255.0, y2[i]! / 255.0, y3[i]! / 255.0, t);
      f = clamp(f, 0, 1);
      ret[i] = f * 255;
    }
    return ret;
  }

  public static createNoiseTex(noiseSize: number, zoom: number, randomFn: RandomFn): Uint8Array {
    const nsize = noiseSize * noiseSize;
    const texArr = new Uint8Array(nsize * 4);
    const texRange = zoom > 1 ? 216 : 256;
    const halfTexRange = texRange * 0.5;
    for (let i = 0; i < nsize; i++) {
      texArr[i * 4 + 0] = Math.floor(randomFn() * texRange + halfTexRange);
      texArr[i * 4 + 1] = Math.floor(randomFn() * texRange + halfTexRange);
      texArr[i * 4 + 2] = Math.floor(randomFn() * texRange + halfTexRange);
      texArr[i * 4 + 3] = Math.floor(randomFn() * texRange + halfTexRange);
    }
    if (zoom > 1) {
      for (let y = 0; y < noiseSize; y += zoom) {
        for (let x = 0; x < noiseSize; x++) {
          if (x % zoom !== 0) {
            const baseX = Math.floor(x / zoom) * zoom + noiseSize;
            const baseY = y * noiseSize;
            const y0: number[] = [];
            const y1: number[] = [];
            const y2: number[] = [];
            const y3: number[] = [];
            for (let z = 0; z < 4; z++) {
              y0[z] = texArr[baseY * 4 + ((baseX - zoom) % noiseSize) * 4 + z]!;
              y1[z] = texArr[baseY * 4 + (baseX % noiseSize) * 4 + z]!;
              y2[z] = texArr[baseY * 4 + ((baseX + zoom) % noiseSize) * 4 + z]!;
              y3[z] = texArr[baseY * 4 + ((baseX + zoom * 2) % noiseSize) * 4 + z]!;
            }
            const t = (x % zoom) / zoom;
            const result = Noise.dwCubicInterpolate(y0, y1, y2, y3, t);
            for (let z = 0; z < 4; z++) {
              texArr[y * noiseSize * 4 + x * 4 + z] = result[z]!;
            }
          }
        }
      }
      for (let x = 0; x < noiseSize; x++) {
        for (let y = 0; y < noiseSize; y++) {
          if (y % zoom !== 0) {
            const baseY = Math.floor(y / zoom) * zoom + noiseSize;
            const y0: number[] = [];
            const y1: number[] = [];
            const y2: number[] = [];
            const y3: number[] = [];
            for (let z = 0; z < 4; z++) {
              y0[z] = texArr[((baseY - zoom) % noiseSize) * noiseSize * 4 + x * 4 + z]!;
              y1[z] = texArr[(baseY % noiseSize) * noiseSize * 4 + x * 4 + z]!;
              y2[z] = texArr[((baseY + zoom) % noiseSize) * noiseSize * 4 + x * 4 + z]!;
              y3[z] = texArr[((baseY + zoom * 2) % noiseSize) * noiseSize * 4 + x * 4 + z]!;
            }
            const t = (y % zoom) / zoom;
            const result = Noise.dwCubicInterpolate(y0, y1, y2, y3, t);
            for (let z = 0; z < 4; z++) {
              texArr[y * noiseSize * 4 + x * 4 + z] = result[z]!;
            }
          }
        }
      }
    }
    return texArr;
  }

  public static createNoiseVolTex(noiseSize: number, zoom: number, randomFn: RandomFn): Uint8Array {
    const nsize = noiseSize * noiseSize * noiseSize;
    const texArr = new Uint8Array(nsize * 4);
    const texRange = zoom > 1 ? 216 : 256;
    const halfTexRange = texRange * 0.5;
    for (let i = 0; i < nsize; i++) {
      texArr[i * 4 + 0] = Math.floor(randomFn() * texRange + halfTexRange);
      texArr[i * 4 + 1] = Math.floor(randomFn() * texRange + halfTexRange);
      texArr[i * 4 + 2] = Math.floor(randomFn() * texRange + halfTexRange);
      texArr[i * 4 + 3] = Math.floor(randomFn() * texRange + halfTexRange);
    }
    const wordsPerSlice = noiseSize * noiseSize;
    const wordsPerLine = noiseSize;
    if (zoom > 1) {
      // X-axis interpolation
      for (let z = 0; z < noiseSize; z += zoom) {
        for (let y = 0; y < noiseSize; y += zoom) {
          for (let x = 0; x < noiseSize; x++) {
            if (x % zoom !== 0) {
              const baseX = Math.floor(x / zoom) * zoom + noiseSize;
              const baseY = z * wordsPerSlice + y * wordsPerLine;
              const y0: number[] = [];
              const y1: number[] = [];
              const y2: number[] = [];
              const y3: number[] = [];
              for (let i = 0; i < 4; i++) {
                y0[i] = texArr[baseY * 4 + ((baseX - zoom) % noiseSize) * 4 + i]!;
                y1[i] = texArr[baseY * 4 + (baseX % noiseSize) * 4 + i]!;
                y2[i] = texArr[baseY * 4 + ((baseX + zoom) % noiseSize) * 4 + i]!;
                y3[i] = texArr[baseY * 4 + ((baseX + zoom * 2) % noiseSize) * 4 + i]!;
              }
              const t = (x % zoom) / zoom;
              const result = Noise.dwCubicInterpolate(y0, y1, y2, y3, t);
              for (let i = 0; i < 4; i++) {
                texArr[z * wordsPerSlice * 4 + y * wordsPerLine * 4 + x * 4 + i] = result[i]!;
              }
            }
          }
        }
      }
      // Y-axis interpolation
      for (let z = 0; z < noiseSize; z += zoom) {
        for (let x = 0; x < noiseSize; x++) {
          for (let y = 0; y < noiseSize; y++) {
            if (y % zoom !== 0) {
              const baseY = Math.floor(y / zoom) * zoom + noiseSize;
              const baseZ = z * wordsPerSlice;
              const y0: number[] = [];
              const y1: number[] = [];
              const y2: number[] = [];
              const y3: number[] = [];
              for (let i = 0; i < 4; i++) {
                const offset = x * 4 + baseZ * 4 + i;
                y0[i] = texArr[((baseY - zoom) % noiseSize) * wordsPerLine * 4 + offset]!;
                y1[i] = texArr[(baseY % noiseSize) * wordsPerLine * 4 + offset]!;
                y2[i] = texArr[((baseY + zoom) % noiseSize) * wordsPerLine * 4 + offset]!;
                y3[i] = texArr[((baseY + zoom * 2) % noiseSize) * wordsPerLine * 4 + offset]!;
              }
              const t = (y % zoom) / zoom;
              const result = Noise.dwCubicInterpolate(y0, y1, y2, y3, t);
              for (let i = 0; i < 4; i++) {
                const offset = x * 4 + baseZ * 4 + i;
                texArr[y * wordsPerLine * 4 + offset] = result[i]!;
              }
            }
          }
        }
      }
      // Z-axis interpolation
      for (let x = 0; x < noiseSize; x++) {
        for (let y = 0; y < noiseSize; y++) {
          for (let z = 0; z < noiseSize; z++) {
            if (z % zoom !== 0) {
              const baseY = y * wordsPerLine;
              const baseZ = Math.floor(z / zoom) * zoom + noiseSize;
              const y0: number[] = [];
              const y1: number[] = [];
              const y2: number[] = [];
              const y3: number[] = [];
              for (let i = 0; i < 4; i++) {
                const offset = x * 4 + baseY * 4 + i;
                y0[i] = texArr[((baseZ - zoom) % noiseSize) * wordsPerSlice * 4 + offset]!;
                y1[i] = texArr[(baseZ % noiseSize) * wordsPerSlice * 4 + offset]!;
                y2[i] = texArr[((baseZ + zoom) % noiseSize) * wordsPerSlice * 4 + offset]!;
                y3[i] = texArr[((baseZ + zoom * 2) % noiseSize) * wordsPerSlice * 4 + offset]!;
              }
              const t = (z % zoom) / zoom;
              const result = Noise.dwCubicInterpolate(y0, y1, y2, y3, t);
              for (let i = 0; i < 4; i++) {
                const offset = x * 4 + baseY * 4 + i;
                texArr[z * wordsPerSlice * 4 + offset] = result[i]!;
              }
            }
          }
        }
      }
    }
    return texArr;
  }
}
