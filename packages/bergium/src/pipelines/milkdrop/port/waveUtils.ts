/**
 * WaveUtils - waveform vertex smoothing (Catmull-Rom-like interpolation).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/waves/waveUtils.js
 * (pinned revision fbac2f6). Pure math (no GL/DOM); used by BasicWaveform to
 * subdivide/smooth waveform vertex data before GPU upload.
 */

export default class WaveUtils {
  /** Smooth a waveform's positions, inserting midpoint vertices (2x output). */
  public static smoothWave(
    positions: Float32Array,
    positionsSmoothed: Float32Array,
    nVertsIn: number,
    zCoord = false,
  ): void {
    const c1 = -0.15;
    const c2 = 1.15;
    const c3 = 1.15;
    const c4 = -0.15;
    const invSum = 1.0 / (c1 + c2 + c3 + c4);

    let j = 0;
    let iBelow = 0;
    let iAbove: number;
    let iAbove2 = 1;

    for (let i = 0; i < nVertsIn - 1; i++) {
      iAbove = iAbove2;
      iAbove2 = Math.min(nVertsIn - 1, i + 2);

      for (let k = 0; k < 3; k++) {
        positionsSmoothed[j * 3 + k] = positions[i * 3 + k]!;
      }

      if (zCoord) {
        for (let k = 0; k < 3; k++) {
          positionsSmoothed[(j + 1) * 3 + k] =
            (c1 * positions[iBelow * 3 + k]! +
              c2 * positions[i * 3 + k]! +
              c3 * positions[iAbove * 3 + k]! +
              c4 * positions[iAbove2 * 3 + k]!) *
            invSum;
        }
      } else {
        for (let k = 0; k < 2; k++) {
          positionsSmoothed[(j + 1) * 3 + k] =
            (c1 * positions[iBelow * 3 + k]! +
              c2 * positions[i * 3 + k]! +
              c3 * positions[iAbove * 3 + k]! +
              c4 * positions[iAbove2 * 3 + k]!) *
            invSum;
        }
        positionsSmoothed[(j + 1) * 3 + 2] = 0;
      }

      iBelow = i;
      j += 2;
    }

    for (let k = 0; k < 3; k++) {
      positionsSmoothed[j * 3 + k] = positions[(nVertsIn - 1) * 3 + k]!;
    }
  }

  /** Smooth waveform positions AND propagate per-vertex colors. */
  public static smoothWaveAndColor(
    positions: Float32Array,
    colors: Float32Array,
    positionsSmoothed: Float32Array,
    colorsSmoothed: Float32Array,
    nVertsIn: number,
    zCoord = false,
  ): void {
    const c1 = -0.15;
    const c2 = 1.15;
    const c3 = 1.15;
    const c4 = -0.15;
    const invSum = 1.0 / (c1 + c2 + c3 + c4);

    let j = 0;
    let iBelow = 0;
    let iAbove: number;
    let iAbove2 = 1;

    for (let i = 0; i < nVertsIn - 1; i++) {
      iAbove = iAbove2;
      iAbove2 = Math.min(nVertsIn - 1, i + 2);

      for (let k = 0; k < 3; k++) {
        positionsSmoothed[j * 3 + k] = positions[i * 3 + k]!;
      }

      if (zCoord) {
        for (let k = 0; k < 3; k++) {
          positionsSmoothed[(j + 1) * 3 + k] =
            (c1 * positions[iBelow * 3 + k]! +
              c2 * positions[i * 3 + k]! +
              c3 * positions[iAbove * 3 + k]! +
              c4 * positions[iAbove2 * 3 + k]!) *
            invSum;
        }
      } else {
        for (let k = 0; k < 2; k++) {
          positionsSmoothed[(j + 1) * 3 + k] =
            (c1 * positions[iBelow * 3 + k]! +
              c2 * positions[i * 3 + k]! +
              c3 * positions[iAbove * 3 + k]! +
              c4 * positions[iAbove2 * 3 + k]!) *
            invSum;
        }
        positionsSmoothed[(j + 1) * 3 + 2] = 0;
      }

      for (let k = 0; k < 4; k++) {
        colorsSmoothed[j * 4 + k] = colors[i * 4 + k]!;
        colorsSmoothed[(j + 1) * 4 + k] = colors[i * 4 + k]!;
      }

      iBelow = i;
      j += 2;
    }

    for (let k = 0; k < 3; k++) {
      positionsSmoothed[j * 3 + k] = positions[(nVertsIn - 1) * 3 + k]!;
    }

    for (let k = 0; k < 4; k++) {
      colorsSmoothed[j * 4 + k] = colors[(nVertsIn - 1) * 4 + k]!;
    }
  }
}
