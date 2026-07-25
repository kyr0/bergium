import { CUSTOM_VECTORS, ROTATION_DITHER, interpolationWeightSum } from "./ClassicConfig.js";

export interface RandomSource { nextRaw(): number; nextInt(maxExclusive: number): number; nextFloat(): number; }
export interface Influence { x: number; y: number; i: number; j: number; type: 0 | 1 | 2; }
export interface MapParameters {
  mode: number; width: number; height: number; centerX: number; centerY: number;
  scale1: number; scale2: number; turn1: number; turn2: number;
  f1: number; f2: number; f3: number; damping: number; weightSum: number;
  fpsAtModeSwitch: number;
  nuclideSelected: boolean; influences: readonly Influence[];
  randomNoise: Float32Array; randomNoisePosition: { value: number };
}
export interface MapTexel { sourceX: number; sourceY: number; w00: number; w10: number; w01: number; w11: number; }

const protect = (scale: number, width: number) => 1 + (scale - 1) * (width > 640 ? 640 / width : 1);

/** Destination-to-source mapping, expressed independently from the C pointer map. */
export function sourceCoordinate(x: number, y: number, p: MapParameters, rng: RandomSource): [number, number] {
  const dx = x - p.centerX, dy = y - p.centerY;
  const rmult = 640 / p.width;
  let scale = p.scale1, turn = p.turn1;

  switch (p.mode) {
    case 3: scale = .95 - dy * (480 / p.height) * .0005; break;
    case 4: scale = .9 + Math.hypot(dx, dy) * rmult * .0025 * .14; break;
    case 5: {
      let r = Math.hypot(dx, dy) / 200 * rmult;
      r = p.nuclideSelected ? r * 1.7 : Math.sqrt(r);
      scale = protect(p.f2 - p.f1 * r, p.width); break;
    }
    case 7: {
      scale = protect(p.f1 - Math.hypot(dx, dy) * p.f2 * rmult, p.width);
      scale += p.randomNoise[p.randomNoisePosition.value++]!;
      if (p.randomNoisePosition.value >= 2345) p.randomNoisePosition.value = 0;
      break;
    }
    case 8: scale = .85 + .1 * Math.sin(Math.sqrt(Math.hypot(dx, dy) * rmult) * p.f1); break;
    case 9: scale = protect(p.f1 - Math.hypot(dx, dy) * p.f2 * rmult, p.width); break;
    case 13: { const r = Math.hypot(dx, dy) * rmult; scale = 1 + (1.04 - r * Math.sqrt(r) * .00025 * .14 - 1) * p.f1; break; }
    case 14: scale = .9 + .2 * Math.cos(dy * 12 / (p.height + (rng.nextRaw() & 1023) / 1024)); break;
    case 15: scale = p.f2 + p.f3 * Math.sin(Math.atan2(dy, dx) * p.f1); break;
    case 16: { const r = Math.hypot(dx, dy) * rmult; scale = Math.max(-1.5, 1.05 - r * r * .00025 * .09); break; }
    default: if (p.mode >= 17) {
      const nx = dx / p.width, ny = dy / p.width, radius = Math.hypot(nx, ny);
      if (p.mode === 17) scale = .97 - ny * ny * .40;
      else if (p.mode === 18) scale = .97 - nx * nx * .40;
      else if (p.mode === 19) scale = 1.04 - .25 * radius;
      else if (p.mode === 20) scale = 1.15 - .20 * Math.sqrt(ny + 1.4);
      else if (p.mode === 21) scale = .95 - Math.trunc(Math.abs(nx) * 10) * .03 - Math.trunc(Math.abs(ny) * 10) * .03;
      else if (p.mode === 22) scale = .95 - Math.trunc(radius * 10) * .04;
      else if (p.mode === 23) scale = .95 - (Math.trunc(radius * 20) % 4) * .12;
      else if (p.mode === 24) { scale = .96; turn = .05; }
      else if (p.mode === 25) scale = 3 / (3 + radius);
    }
  }

  let sx: number, sy: number;
  if (CUSTOM_VECTORS.has(p.mode)) {
    if (p.mode === 10) return [dx * (1.03 + .03 * y / p.height) + p.centerX, y * 1.04];
    if (p.mode === 12) return [dx < -.5 ? -Math.sqrt(-dx) + p.centerX + .9 : dx > .5 ? Math.sqrt(dx) + p.centerX - .9 : p.centerX, dy + p.centerY];
    let tx = 0, ty = 0, sum = 0;
    for (const q of p.influences.slice(0, 5)) { // source initializes ten, evaluates five
      const qx = q.x - x, qy = q.y - y, rr = qx * qx + qy * qy, d = 1 / (rr + .1); sum += d;
      if (q.type === 0) { tx += q.i * d; ty += q.j * d; } else { const z = 1 / (Math.sqrt(rr) + .01), dd = 2 * d, s = q.type === 1 ? 1 : -1; tx += s * dd * (-qy) * z; ty += s * dd * qx * z; }
    }
    const n = sum > .000001 ? 1.9 / sum : 0; return [x + tx * n - .1, y + ty * n + .6];
  }
  if (ROTATION_DITHER.has(p.mode) && ((x & 1) !== (y & 1))) { scale = p.scale2; turn = p.turn2; }
  const cos = Math.cos(turn), sin = Math.sin(turn);
  sx = (dx * cos - dy * sin) * scale + p.centerX; sy = (dx * sin + dy * cos) * scale + p.centerY;
  return [sx, sy];
}

export function quantizeMapTexel(x: number, y: number, p: MapParameters, rng: RandomSource): MapTexel {
  let [sx, sy] = sourceCoordinate(x, y, p, rng);
  let damping = p.damping * 30 / p.fpsAtModeSwitch;
  // p.damping is already clamped and halved for dampened modes at map init.
  sx = x * (1 - damping) + sx * damping; sy = y * (1 - damping) + sy * damping;
  while (sx < 0) sx += p.width - 1; while (sx > p.width - 1) sx -= p.width - 1;
  // Floor (not trunc) so the bilinear fraction is always in [0,1): a source
  // coordinate can be negative (Y has no wrap and scale can push it below 0), and
  // trunc(-0.3) == 0 would give a negative fraction that &255 wraps into an invalid
  // weight. Floor keeps the four taps a proper convex combination.
  let ix = Math.floor(sx), iy = Math.floor(sy);
  let flat = iy * p.width + ix;
  flat = Math.max(p.width * 2, Math.min(p.width * (p.height - 3) - 1, flat));
  iy = Math.trunc(flat / p.width); ix = flat % p.width;
  const fx = sx - Math.floor(sx), fy = sy - Math.floor(sy);
  const sum = Math.trunc(p.weightSum * interpolationWeightSum(p.width, p.height) / 256);
  return { sourceX: ix, sourceY: iy, w00: Math.trunc((1 - fx) * (1 - fy) * sum) & 255, w10: Math.trunc(fx * (1 - fy) * sum) & 255, w01: Math.trunc((1 - fx) * fy * sum) & 255, w11: Math.trunc(fx * fy * sum) & 255 };
}
