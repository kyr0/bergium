import { test, expect, vi, beforeEach } from "vitest";

/**
 * BergiumPlayer contract tests.
 *
 * `createVisualizer` and `GeissAdapter` are mocked so no WebGL/AudioContext is
 * required; these tests pin the high-level behaviour consumers rely on: pipeline
 * toggling, Geiss defaults, Milkdrop preset cycling, click handling and teardown.
 */
const mocks = vi.hoisted(() => {
  /** Recorded fake visualizer instances in creation order. */
  const created: Array<Record<string, unknown>> = [];

  /** Fake GeissAdapter recording effect/cycle calls. */
  class GeissAdapterFake {
    public pipeline = "geiss";
    public autoMode: boolean | undefined;
    public cycleSeconds: number | undefined;
    public effects: Record<string, boolean> = {};
    public loadPresetCalls: Array<{ p: unknown; t: number | undefined }> = [];
    public connectAudio(): void {}
    public disconnectAudio(): void {}
    public loadPreset(p: unknown, t?: number): void {
      this.loadPresetCalls.push({ p, t });
    }
    public setRendererSize(): void {}
    public launchSongTitleAnim(): void {}
    public render(): void {}
    public renderFrame(): void {}
    public setAutoMode(v: boolean): void {
      this.autoMode = v;
    }
    public setAutoCycleSeconds(v: number): void {
      this.cycleSeconds = v;
    }
    public setEffect(n: string, v: boolean): void {
      this.effects[n] = v;
    }
    public destroy(): void {}
  }

  /** Fake Milkdrop visualizer recording loadPreset calls. */
  function makeMilkdropFake(): Record<string, unknown> {
    const obj: Record<string, unknown> = {
      pipeline: "milkdrop",
      loadPresetCalls: [] as Array<{ p: unknown; t: number | undefined }>,
      connectAudio(): void {},
      disconnectAudio(): void {},
      loadPreset(p: unknown, t?: number): void {
        (obj.loadPresetCalls as Array<{ p: unknown; t: number | undefined }>).push({ p, t });
      },
      setRendererSize(): void {},
      launchSongTitleAnim(): void {},
      render(): void {},
      renderFrame(): void {},
      destroy(): void {},
    };
    return obj;
  }

  return { created, GeissAdapterFake, makeMilkdropFake };
});

vi.mock("../../src/api/createVisualizer.js", () => ({
  createVisualizer: vi.fn((_ctx: unknown, _canvas: unknown, options: { pipeline: string }) => {
    if (options.pipeline === "geiss") {
      const g = new mocks.GeissAdapterFake();
      mocks.created.push(g as unknown as Record<string, unknown>);
      return g;
    }
    const v = mocks.makeMilkdropFake();
    mocks.created.push(v);
    return v;
  }),
}));
vi.mock("../../src/adapters/GeissAdapter.js", () => ({
  GeissAdapter: mocks.GeissAdapterFake,
}));

const { createBergiumPlayer } = await import("../../src/index.js");
const { createVisualizer } = await import("../../src/api/createVisualizer.js");

const ctx = {} as AudioContext;

/** Minimal canvas stub that records click listeners. */
function makeCanvas(): HTMLCanvasElement {
  const listeners: Record<string, Array<() => void>> = {};
  const canvas = {
    addEventListener: vi.fn((t: string, f: () => void) => {
      (listeners[t] ??= []).push(f);
    }),
    removeEventListener: vi.fn((t: string, f: () => void) => {
      const arr = listeners[t];
      if (arr) listeners[t] = arr.filter((x) => x !== f);
    }),
    click(): void {
      (listeners["click"] ?? []).forEach((f) => f());
    },
  };
  return canvas as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  mocks.created.length = 0;
  vi.clearAllMocks();
});

test("createBergiumPlayer returns a player with the expected API", () => {
  const player = createBergiumPlayer(ctx, makeCanvas(), {
    autoRender: false,
    milkdrop: { getPresets: async () => [] },
  });
  expect(typeof player.togglePipeline).toBe("function");
  expect(typeof player.setPipeline).toBe("function");
  expect(typeof player.connectAudio).toBe("function");
  expect(typeof player.loadPreset).toBe("function");
  expect(typeof player.launchSongTitleAnim).toBe("function");
  expect(typeof player.render).toBe("function");
  expect(typeof player.destroy).toBe("function");
  player.destroy();
});

test("geiss pipeline applies defaults and forces onlyUseWASM false", () => {
  const player = createBergiumPlayer(ctx, makeCanvas(), {
    initialPipeline: "geiss",
    autoRender: false,
    milkdrop: { getPresets: async () => [] },
  });
  expect(createVisualizer).toHaveBeenCalledWith(
    ctx,
    expect.anything(),
    expect.objectContaining({ pipeline: "geiss", onlyUseWASM: false }),
  );
  const geiss = mocks.created.at(-1) as unknown as {
    cycleSeconds: number | undefined;
    autoMode: boolean | undefined;
    effects: Record<string, boolean>;
  };
  expect(geiss.cycleSeconds).toBe(30);
  expect(geiss.autoMode).toBe(true);
  expect(geiss.effects.chasers).toBe(true);
  expect(geiss.effects.shadeBobs).toBe(false);
  player.destroy();
});

test("milkdrop auto-loads the initial preset from getPresets", async () => {
  const A = { name: "A" };
  const B = { name: "B" };
  const player = createBergiumPlayer(ctx, makeCanvas(), {
    initialPipeline: "milkdrop",
    autoRender: false,
    milkdrop: {
      getPresets: async () => [
        { name: "A", preset: A },
        { name: "B", preset: B },
      ],
    },
  });
  await Promise.resolve();
  const v = mocks.created.at(-1) as Record<string, unknown>;
  const calls = v.loadPresetCalls as Array<{ p: unknown }>;
  expect(calls[0]?.p).toBe(A);
  player.destroy();
});

test("togglePipeline destroys the old viz and creates the other pipeline", () => {
  const canvas = makeCanvas();
  const player = createBergiumPlayer(ctx, canvas, {
    initialPipeline: "milkdrop",
    autoRender: false,
    milkdrop: { getPresets: async () => [] },
  });
  expect(player.getPipeline()).toBe("milkdrop");
  const first = mocks.created.at(-1) as Record<string, unknown>;
  const destroySpy = vi.spyOn(first, "destroy" as never);

  player.togglePipeline();
  expect(player.getPipeline()).toBe("geiss");
  expect(destroySpy).toHaveBeenCalled();
  expect(createVisualizer).toHaveBeenLastCalledWith(
    ctx,
    canvas,
    expect.objectContaining({ pipeline: "geiss" }),
  );

  player.togglePipeline();
  expect(player.getPipeline()).toBe("milkdrop");
  player.destroy();
});

test("setPipeline is a no-op when the pipeline is already active", () => {
  const player = createBergiumPlayer(ctx, makeCanvas(), {
    initialPipeline: "geiss",
    autoRender: false,
    milkdrop: { getPresets: async () => [] },
  });
  const callsBefore = vi.mocked(createVisualizer).mock.calls.length;
  player.setPipeline("geiss");
  expect(vi.mocked(createVisualizer).mock.calls.length).toBe(callsBefore);
  player.destroy();
});

test("canvas click toggles the pipeline", () => {
  const canvas = makeCanvas();
  const player = createBergiumPlayer(ctx, canvas, {
    initialPipeline: "geiss",
    autoRender: false,
    milkdrop: { getPresets: async () => [] },
  });
  canvas.click();
  expect(player.getPipeline()).toBe("milkdrop");
  player.destroy();
});

test("loadPreset restarts the 30s cycle from the selected preset", async () => {
  vi.useFakeTimers();
  const A = { a: 1 };
  const B = { b: 2 };
  const C = { c: 3 };
  const player = createBergiumPlayer(ctx, makeCanvas(), {
    initialPipeline: "milkdrop",
    autoRender: false,
    milkdrop: {
      getPresets: async () => [
        { name: "A", preset: A },
        { name: "B", preset: B },
        { name: "C", preset: C },
      ],
      cycleSeconds: 30,
    },
  });
  await Promise.resolve();
  const v = mocks.created.at(-1) as Record<string, unknown>;
  const calls = v.loadPresetCalls as Array<{ p: unknown }>;

  expect(calls.at(-1)?.p).toBe(A);
  player.loadPreset(B, 2.7);
  expect(calls.at(-1)?.p).toBe(B);
  // 30s later the cycle advances past B (index 1) to C (index 2).
  await vi.advanceTimersByTimeAsync(30_000);
  expect(calls.at(-1)?.p).toBe(C);

  vi.useRealTimers();
  player.destroy();
});

test("destroy removes the click listener and destroys the viz", () => {
  const canvas = makeCanvas();
  const player = createBergiumPlayer(ctx, canvas, {
    initialPipeline: "geiss",
    autoRender: false,
    milkdrop: { getPresets: async () => [] },
  });
  const v = mocks.created.at(-1) as Record<string, unknown>;
  const destroySpy = vi.spyOn(v, "destroy" as never);
  player.destroy();
  expect(destroySpy).toHaveBeenCalled();
  expect(canvas.removeEventListener).toHaveBeenCalled();
});
