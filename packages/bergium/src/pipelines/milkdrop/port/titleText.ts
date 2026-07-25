import ShaderUtils from "./shaderUtils.js";

/**
 * TitleText — renders the song-title animation (italic Times New Roman rasterized
 * to a Canvas2D texture, sampled through a wobbling 16×8 UV grid).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/text/titleText.js
 * (pinned revision fbac6f6). Browser-only (uses document + Canvas2D). GLSL frozen
 * verbatim. The UV wobble + scale equations are preserved exactly.
 */

export interface TitleTextOpts {
  texsizeX: number;
  texsizeY: number;
  aspectx: number;
  aspecty: number;
}

export interface TitleTextGlobalVars {
  time: number;
}

export default class TitleText {
  private gl: WebGL2RenderingContext;

  private texsizeX: number;
  private texsizeY: number;
  private aspectx: number;
  private aspecty: number;
  // Faithful dead state: assigned in vendored source, never read; kept verbatim for honest 1:1 parity.
  private invAspectx: number;
  private invAspecty: number;

  private vertices!: Float32Array;
  private indices!: Uint16Array;

  private textTexture: WebGLTexture;
  private indexBuf: WebGLBuffer;
  private positionVertexBuf: WebGLBuffer;
  private vertexBuf: WebGLBuffer;

  private canvas: HTMLCanvasElement;
  private context2D: CanvasRenderingContext2D;
  private fontSize: number;

  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private positionLocation!: number;
  private uvLocation!: number;
  private textureLoc!: WebGLUniformLocation | null;
  private textColorLoc!: WebGLUniformLocation | null;

  public constructor(gl: WebGL2RenderingContext, opts: TitleTextOpts) {
    this.gl = gl;

    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;

    this.buildPositions();

    this.textTexture = this.gl.createTexture()!;
    this.indexBuf = gl.createBuffer()!;
    this.positionVertexBuf = this.gl.createBuffer()!;
    this.vertexBuf = this.gl.createBuffer()!;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.texsizeX;
    this.canvas.height = this.texsizeY;
    this.context2D = this.canvas.getContext("2d", { willReadFrequently: false })!;

    this.fontSize = 0;

    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(this.gl);
    this.createShader();
  }

  /** Rasterize the title text to the GL text texture, truncating with "..." if too wide. */
  public generateTitleTexture(text: string): void {
    this.context2D.clearRect(0, 0, this.texsizeX, this.texsizeY);

    this.fontSize = Math.floor(16 * (this.texsizeX / 256));
    this.fontSize = Math.max(this.fontSize, 6);
    this.context2D.font = `italic ${this.fontSize}px Times New Roman`;

    let titleText = text;
    let textLength = this.context2D.measureText(titleText).width;
    if (textLength > this.texsizeX) {
      const percentToKeep = 0.91 * (this.texsizeX / textLength);
      titleText = `${titleText.substring(
        0,
        Math.floor(titleText.length * percentToKeep)
      )}...`;
      textLength = this.context2D.measureText(titleText).width;
    }

    this.context2D.fillStyle = "#FFFFFF";
    this.context2D.fillText(
      titleText,
      (this.texsizeX - textLength) / 2,
      this.texsizeY / 2
    );

    const imageData = new Uint8Array(
      this.context2D.getImageData(
        0,
        0,
        this.texsizeX,
        this.texsizeY
      ).data.buffer
    );

    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.texsizeX,
      this.texsizeY,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      imageData
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR_MIPMAP_LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.generateMipmap(this.gl.TEXTURE_2D);

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  public updateGlobals(opts: TitleTextOpts): void {
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;

    this.canvas.width = this.texsizeX;
    this.canvas.height = this.texsizeY;
  }

  // based on https://github.com/mrdoob/three.js/blob/master/src/geometries/PlaneGeometry.js
  /** Build the fixed 16×7 title-plane vertex grid + triangle indices. */
  private buildPositions(): void {
    const width = 2;
    const height = 2;

    const widthHalf = width / 2;
    const heightHalf = height / 2;

    const gridX = 15;
    const gridY = 7;

    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;

    const segmentWidth = width / gridX;
    const segmentHeight = height / gridY;

    const vertices: number[] = [];
    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf;
      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segmentWidth - widthHalf;
        vertices.push(x, -y, 0);
      }
    }

    const indices: number[] = [];
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy;
        const b = ix + gridX1 * (iy + 1);
        const c = ix + 1 + gridX1 * (iy + 1);
        const d = ix + 1 + gridX1 * iy;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
  }

  /** Compile + link the title sampler shader program. */
  public createShader(): void {
    this.shaderProgram = this.gl.createProgram()!;

    const vertShader = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    this.gl.shaderSource(
      vertShader,
      `#version 300 es
       const vec2 halfmad = vec2(0.5);
       in vec2 aPos;
       in vec2 aUv;
       out vec2 uv_orig;
       out vec2 uv;
       void main(void) {
         gl_Position = vec4(aPos, 0.0, 1.0);
         uv_orig = aPos * halfmad + halfmad;
         uv = aUv;
       }`
    );
    this.gl.compileShader(vertShader);

    const fragShader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(
      fragShader,
      `#version 300 es
       precision ${this.floatPrecision} float;
       precision highp int;
       precision mediump sampler2D;

       in vec2 uv_orig;
       in vec2 uv;
       out vec4 fragColor;
       uniform sampler2D uTexture;
       uniform float textColor;

       void main(void) {
         fragColor = texture(uTexture, uv) * vec4(textColor);
       }`
    );
    this.gl.compileShader(fragShader);

    this.gl.attachShader(this.shaderProgram, vertShader);
    this.gl.attachShader(this.shaderProgram, fragShader);
    this.gl.linkProgram(this.shaderProgram);

    this.positionLocation = this.gl.getAttribLocation(
      this.shaderProgram,
      "aPos"
    );
    this.uvLocation = this.gl.getAttribLocation(this.shaderProgram, "aUv");
    this.textureLoc = this.gl.getUniformLocation(
      this.shaderProgram,
      "uTexture"
    );
    this.textColorLoc = this.gl.getUniformLocation(
      this.shaderProgram,
      "textColor"
    );
  }

  /** Generate the wobbling/scaled UV grid for the title at a given animation progress. */
  public generateUvs(progress: number, flip: boolean, globalVars: TitleTextGlobalVars): Float32Array {
    const gridX = 15;
    const gridY = 7;

    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;

    const uvs: number[] = [];
    const vertClip = 0.75;
    for (let j = 0; j < gridY1; j++) {
      for (let i = 0; i < gridX1; i++) {
        const u = i / gridX;
        const v = (j / gridY - 0.5) * vertClip + 0.5;
        const x = u * 2.0 - 1.0;
        let y = v * 2.0 - 1.0;
        if (progress >= 1) {
          y += 1.0 / this.texsizeY;
        }

        uvs.push(x, flip ? y : -y);
      }
    }

    const rampedProgress = Math.max(0, 1 - progress * 1.5);
    const t2 = rampedProgress ** 1.8 * 1.3;
    for (let j = 0; j < gridY1; j++) {
      for (let i = 0; i < gridX1; i++) {
        const idx = j * gridX1 + i;
        uvs[idx]! +=
          t2 *
          0.07 *
          Math.sin(
            globalVars.time * 0.31 + uvs[idx]! * 0.39 - uvs[idx + 1]! * 1.94
          );
        uvs[idx]! +=
          t2 *
          0.044 *
          Math.sin(
            globalVars.time * 0.81 - uvs[idx]! * 1.91 + uvs[idx + 1]! * 0.27
          );
        uvs[idx]! +=
          t2 *
          0.061 *
          Math.sin(
            globalVars.time * 1.31 + uvs[idx]! * 0.61 + uvs[idx + 1]! * 0.74
          );

        uvs[idx + 1]! +=
          t2 *
          0.061 *
          Math.sin(
            globalVars.time * 0.37 + uvs[idx]! * 1.83 + uvs[idx + 1]! * 0.69
          );
        uvs[idx + 1]! +=
          t2 *
          0.07 *
          Math.sin(
            globalVars.time * 0.67 + uvs[idx]! * 0.42 - uvs[idx + 1]! * 1.39
          );
        uvs[idx + 1]! +=
          t2 *
          0.087 *
          Math.sin(
            globalVars.time * 1.07 + uvs[idx]! * 3.55 + uvs[idx + 1]! * 0.89
          );
      }
    }

    const scale = 1.01 / (progress ** 0.21 + 0.01);
    for (let i = 0; i < uvs.length / 2; i++) {
      uvs[i * 2]! *= scale;
      uvs[i * 2 + 1]! *= scale * this.invAspecty;

      // get back UVs
      uvs[i * 2]! = (uvs[i * 2]! + 1) / 2.0;
      uvs[i * 2 + 1]! = (uvs[i * 2 + 1]! + 1) / 2.0;
    }

    return new Float32Array(uvs);
  }

  public renderTitle(progress: number, flip: boolean, globalVars: TitleTextGlobalVars): void {
    this.gl.useProgram(this.shaderProgram);

    const progressUvs = this.generateUvs(progress, flip, globalVars);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      this.indices,
      this.gl.STATIC_DRAW
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionVertexBuf);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      this.vertices,
      this.gl.STATIC_DRAW
    );

    this.gl.vertexAttribPointer(
      this.positionLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    this.gl.enableVertexAttribArray(this.positionLocation);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, progressUvs, this.gl.STATIC_DRAW);

    this.gl.vertexAttribPointer(this.uvLocation, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.enableVertexAttribArray(this.uvLocation);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textTexture);

    this.gl.uniform1i(this.textureLoc, 0);

    this.gl.uniform1f(this.textColorLoc, progress ** 0.3);

    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.gl.drawElements(
      this.gl.TRIANGLES,
      this.indices.length,
      this.gl.UNSIGNED_SHORT,
      0
    );
  }
}
