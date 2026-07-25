/**
 * ImageTextures - manages preset image samplers (clouds, empty, extras).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/image/imageTextures.js
 * (pinned revision fbac6f6). The vendored hardcodes base64 image data; per the
 * project's external-asset rule, this port accepts the image data URLs as
 * injected parameters (frozen assets loaded externally). The WebGL bind/filter
 * logic is identical.
 */

export interface ImageDataEntry {
  data: string;
  width: number;
  height: number;
}

export interface ImageTexturesAssets {
  clouds2?: ImageDataEntry;
  empty?: ImageDataEntry;
}

export default class ImageTextures {
  private gl: WebGL2RenderingContext;
  private anisoExt: EXT_texture_filter_anisotropic | null;
  public samplers: Record<string, WebGLTexture>;

  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.anisoExt =
      gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    this.samplers = {};
  }

  /**
   * Load the built-in image textures (clouds2, empty) from injected base64 data.
   * The caller provides the same data URLs the vendored source hardcodes.
   */
  public loadBuiltinImages(assets: ImageTexturesAssets): void {
    if (assets.clouds2) {
      this.loadImage("clouds2", assets.clouds2);
    }
    if (assets.empty) {
      this.loadImage("empty", assets.empty);
    }
  }

  /** Load an image from a data URL and bind it as a GL texture. */
  public loadImage(name: string, entry: ImageDataEntry): void {
    if (this.samplers[name]) return;
    const image = new Image();
    image.onload = (): void => {
      this.samplers[name] = this.gl.createTexture()!;
      this.bindTexture(this.samplers[name]!, image, entry.width, entry.height);
    };
    image.src = entry.data;
  }

  /** Load extra preset images from a { name: { data, width, height } } map. */
  public loadExtraImages(imageData: Record<string, ImageDataEntry>): void {
    for (const imageName of Object.keys(imageData)) {
      this.loadImage(imageName, imageData[imageName]!);
    }
  }

  public bindTexture(texture: WebGLTexture, data: TexImageSource, width: number, height: number): void {
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

  /** Get a named sampler; falls back to clouds2. */
  public getTexture(sampler: string): WebGLTexture | undefined {
    return this.samplers[sampler] ?? this.samplers.clouds2;
  }
}
