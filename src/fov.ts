// Recursive shadowcasting FOV
// Based on the algorithm by Bjorn Henke / Bob Nystrom

export function computeFOV(
  visible: Uint8Array,
  mapWidth: number,
  mapHeight: number,
  originX: number,
  originY: number,
  radius: number,
  isBlocking: (x: number, y: number) => boolean
): void {
  // Clear visible
  visible.fill(0);
  visible[originY * mapWidth + originX] = 1;

  // 8 octants
  for (let octant = 0; octant < 8; octant++) {
    castLight(visible, mapWidth, mapHeight, originX, originY, radius, 1, 1.0, 0.0, octant, isBlocking);
  }
}

const OCTANT_TRANSFORMS = [
  // [xx, xy, yx, yy]
  [1,  0,  0,  1],
  [0,  1,  1,  0],
  [0, -1,  1,  0],
  [-1, 0,  0,  1],
  [-1, 0,  0, -1],
  [0, -1, -1,  0],
  [0,  1, -1,  0],
  [1,  0,  0, -1],
];

function castLight(
  visible: Uint8Array,
  mapWidth: number,
  mapHeight: number,
  ox: number, oy: number,
  radius: number,
  row: number,
  startSlope: number,
  endSlope: number,
  octant: number,
  isBlocking: (x: number, y: number) => boolean
): void {
  if (startSlope < endSlope) return;
  const [xx, xy, yx, yy] = OCTANT_TRANSFORMS[octant];

  let blocked = false;
  let newStart = 0;

  for (let distance = row; distance <= radius && !blocked; distance++) {
    for (let dx = -distance; dx <= 0; dx++) {
      const dy = -distance;
      const mx = ox + dx * xx + dy * yx;
      const my = oy + dx * xy + dy * yy;

      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) continue;

      const r2 = dx * dx + dy * dy;
      if (r2 <= radius * radius) {
        visible[my * mapWidth + mx] = 1;
      }

      if (blocked) {
        if (isBlocking(mx, my)) {
          newStart = rSlope;
        } else {
          blocked = false;
          startSlope = newStart;
        }
      } else {
        if (isBlocking(mx, my) && distance < radius) {
          blocked = true;
          castLight(visible, mapWidth, mapHeight, ox, oy, radius, distance + 1, startSlope, lSlope, octant, isBlocking);
          newStart = rSlope;
        }
      }
    }
  }
}
