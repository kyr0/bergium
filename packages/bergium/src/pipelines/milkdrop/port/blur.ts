import BlurHorizontal from "./blurHorizontal.js";
import BlurVertical from "./blurVertical.js";

/**
 * BlurShader - the separable two-pass blur wrapper (horizontal then vertical).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/shaders/blur/blur.js
 * (pinned revision fbac6f6). Manages FBOs/textures for each blur level and calls
 * the horizontal+vertical passes with mipmap generation between them.
 */

export interface BlurShaderOpts {
  texsizeX: number;
  texsizeY: number;
}

export default class BlurShader {
  private gl: WebGL2RenderingContext;
  public blurLevel: number;
  public blurRatios: number[][];
  private texsizeX: number;
  private texsizeY: number;
  private anisoExt: EXT_texture_filter_anisotropic | null;
  private blurHorizontalFrameBuffer: WebGLFramebuffer;
  private blurVerticalFrameBuffer: WebGLFramebuffer;
  private blurHorizontalTexture: WebGLTexture;
  public blurVerticalTexture: WebGLTexture;
  private blurHorizontal!: BlurHorizontal;
  private blurVertical!: BlurVertical;
  private horizontalTexsizes!: number[][];
  private verticalTexsizes!: number[][];

  public constructor(blurLevel: number, blurRatios: number[][], gl: WebGL2RenderingContext, opts: BlurShaderOpts) {
    this.blurLevel = blurLevel;
    this.blurRatios = blurRatios;
    this.gl = gl;
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.anisoExt = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("MOZ_EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    this.blurHorizontalFrameBuffer = gl.createFramebuffer()!;
    this.blurVerticalFrameBuffer = gl.createFramebuffer()!;
    this.blurHorizontalTexture = gl.createTexture()!;
    this.blurVerticalTexture = gl.createTexture()!;
    this.setupFrameBufferTextures();
    this.blurHorizontal = new BlurHorizontal(gl, this.blurLevel, opts);
    this.blurVertical = new BlurVertical(gl, this.blurLevel);
  }

  public updateGlobals(opts: BlurShaderOpts): void {
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.setupFrameBufferTextures();
  }

  public getTextureSize(sizeRatio: number): number[] {
    let sizeX = Math.max(this.texsizeX * sizeRatio, 16);
    sizeX = Math.floor((sizeX + 3) / 16) * 16;
    let sizeY = Math.max(this.texsizeY * sizeRatio, 16);
    sizeY = Math.floor((sizeY + 3) / 4) * 4;
    return [sizeX, sizeY];
  }

  private setupFrameBufferTextures(): void {
    const srcBlurRatios = this.blurLevel > 0 ? this.blurRatios[this.blurLevel - 1]! : [1, 1];
    const dstBlurRatios = this.blurRatios[this.blurLevel]!;
    const srcTexsizeHorizontal = this.getTextureSize(srcBlurRatios[1]!);
    const dstTexsizeHorizontal = this.getTextureSize(dstBlurRatios[0]!);
    this.bindFrameBufferTexture(this.blurHorizontalFrameBuffer, this.blurHorizontalTexture, dstTexsizeHorizontal);
    const srcTexsizeVertical = dstTexsizeHorizontal;
    const dstTexsizeVertical = this.getTextureSize(dstBlurRatios[1]!);
    this.bindFrameBufferTexture(this.blurVerticalFrameBuffer, this.blurVerticalTexture, dstTexsizeVertical);
    this.horizontalTexsizes = [srcTexsizeHorizontal, dstTexsizeHorizontal];
    this.verticalTexsizes = [srcTexsizeVertical, dstTexsizeVertical];
  }

  private bindFrambufferAndSetViewport(fb: WebGLFramebuffer, texsize: number[]): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, texsize[0]!, texsize[1]!);
  }

  private bindFrameBufferTexture(targetFrameBuffer: WebGLFramebuffer, targetTexture: WebGLTexture, texsize: number[]): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texsize[0]!, texsize[1]!, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(texsize[0]! * texsize[1]! * 4));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.anisoExt) {
      const max = gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFrameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);
  }

  public renderBlurTexture(prevTexture: WebGLTexture, mdVSFrame: Record<string, unknown>, blurMins: number[], blurMaxs: number[]): void {
    const gl = this.gl;
    this.bindFrambufferAndSetViewport(this.blurHorizontalFrameBuffer, this.horizontalTexsizes[1]!);
    this.blurHorizontal.renderQuadTexture(prevTexture, mdVSFrame, blurMins, blurMaxs, this.horizontalTexsizes[0]!);
    gl.bindTexture(gl.TEXTURE_2D, this.blurHorizontalTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.bindFrambufferAndSetViewport(this.blurVerticalFrameBuffer, this.verticalTexsizes[1]!);
    this.blurVertical.renderQuadTexture(this.blurHorizontalTexture, mdVSFrame, this.verticalTexsizes[0]!);
    gl.bindTexture(gl.TEXTURE_2D, this.blurVerticalTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
}
