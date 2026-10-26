import type { Group, MeshPhysicalMaterial, Scene } from 'three';

export function createAtmosphere(
  scene: Scene,
  options?: { groundY?: number },
): {
  group: Group;
  groundMaterial: MeshPhysicalMaterial;
  update(time: number, options?: { reduced?: boolean; impact?: number; formation?: number }): void;
  dispose(): void;
};
