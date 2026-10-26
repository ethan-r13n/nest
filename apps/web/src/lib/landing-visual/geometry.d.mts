export interface NestSurface {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}
export const RIBBONS: readonly { id: string; delay: number; width: number; thickness: number }[];
export function createRibbonGeometry(index: number, options?: { segments?: number; sides?: number }): NestSurface;
export function createEggGeometry(options?: { rings?: number; sides?: number }): NestSurface;
export function sampleRibbon(index: number, u: number, time?: number): number[];
