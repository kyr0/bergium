export interface RenderSize {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface RenderTargetDescriptor {
  label: string;
  width: number;
  height: number;
  format: "rgba8" | "intensity8" | "rgba16f";
  depth?: boolean;
}

/** Opaque outside the graphics backend. */
export interface RenderTarget {
  readonly descriptor: Readonly<RenderTargetDescriptor>;
}

