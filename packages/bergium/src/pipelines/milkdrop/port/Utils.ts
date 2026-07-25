/**
 * Math/object helpers.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/utils.js (pinned revision
 * fbac2f6). Static utility methods shared by the preset equation runner/renderer.
 */

export type Vars = Record<string, number>;
export type WasmGlobals = Record<string, { value: number }>;

export default class Utils {
  public static atan2(x: number, y: number): number {
    let a = Math.atan2(x, y);
    if (a < 0) {
      a += 2 * Math.PI;
    }
    return a;
  }

  public static cloneVars<T extends Record<string, unknown>>(vars: T): T {
    return Object.assign({}, vars);
  }

  public static range(start: number, end?: number): number[] {
    if (end === undefined) {
      return [...Array(start).keys()];
    }
    return Array.from({ length: end - start }, (_, i) => i + start);
  }

  public static pick(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
    const newObj: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      newObj[key] = (obj[key] as number | undefined) || 0;
    }
    return newObj;
  }

  public static omit<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): Record<string, unknown> {
    const newObj: Record<string, unknown> = Object.assign({}, obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      delete newObj[key];
    }
    return newObj;
  }

  public static setWasm(wasmGlobals: WasmGlobals, obj: Vars, keys: readonly string[]): void {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      // Source assigns obj[key] directly (callers always provide these keys).
      wasmGlobals[key]!.value = obj[key]!;
    }
  }

  public static pickWasm(wasmGlobals: WasmGlobals, keys: readonly string[]): Vars {
    const newObj: Vars = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      newObj[key] = wasmGlobals[key]!.value;
    }
    return newObj;
  }
}
