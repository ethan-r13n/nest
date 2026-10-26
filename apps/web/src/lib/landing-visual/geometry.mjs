/**
 * Nest / woven fluid study. Renderer-independent editable geometry, Y up.
 * Six interleaved strips travel down continuous curved paths like silk;
 * the leading end winds into the bowl before its waving tail catches up.
 * Geometry settles by 5.2 authoring seconds; the runtime maps this clock at
 * 1.25× into its 6.4-second scene/egg shot.
 */
export const RIBBONS = Object.freeze([
  { id: 'nest_ribbon_A', role: 'left tucked arch', delay: 0.0, direction: [1, 0.15, 0], width: 0.66, thickness: 0.085 },
  {
    id: 'nest_ribbon_B',
    role: 'right tucked arch',
    delay: 0.14,
    direction: [-1, 0.12, 0],
    width: 0.66,
    thickness: 0.085,
  },
  {
    id: 'nest_ribbon_C',
    role: 'rear descending crossband',
    delay: 0.28,
    direction: [0.15, 1, 0],
    width: 0.64,
    thickness: 0.085,
  },
  {
    id: 'nest_ribbon_D',
    role: 'front ascending crossband',
    delay: 0.42,
    direction: [0, 0.1, -1],
    width: 0.68,
    thickness: 0.085,
  },
  {
    id: 'nest_ribbon_E',
    role: 'low pointed crescent',
    delay: 0.56,
    direction: [-1, 0.15, 0],
    width: 0.59,
    thickness: 0.078,
  },
  {
    id: 'nest_ribbon_F',
    role: 'outside side cradle',
    delay: 0.7,
    direction: [-0.15, -1, 0.2],
    width: 0.47,
    thickness: 0.078,
  },
]);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smoother = (x) => {
  const p = clamp(x);
  return p * p * p * (p * (p * 6 - 15) + 10);
};
const smooth = (a, b, x) => {
  const p = clamp((x - a) / (b - a));
  return p * p * (3 - 2 * p);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const positive = (x) => 0.5 * (x + Math.sqrt(x * x + 0.0025));

function bezier(a, b, c, d, u) {
  const v = 1 - u;
  return a.map((p, k) => v * v * v * p + 3 * v * v * u * b[k] + 3 * v * u * u * c[k] + u * u * u * d[k]);
}
function finalPoint(index, u) {
  let theta,
    rx,
    rz,
    y,
    z = 0;
  if (index === 0) {
    // Independent inner arch turns inward, terminating in a tucked silk tip.
    return bezier([-0.5, 1.6, -1.45], [-2.5, 1.52, -1.27], [-2.45, 0.8, -0.2], [-1.83, 0.3, 0.02], u);
  } else if (index === 1) {
    return bezier([0.5, 1.57, -1.45], [2.5, 1.48, -1.28], [2.43, 0.72, -0.25], [1.77, 0.26, 0.06], u);
  } else if (index === 2) {
    // Outer shoulder passes behind the left tuck, then descends behind seed.
    theta = mix(-2.55, -5.7, u);
    rx = 2.48;
    rz = 1.37;
    y = 0.02 - 0.38 * Math.cos(theta) - 0.23 * Math.sin(theta) + 0.22 * positive(-Math.cos(theta));
  } else if (index === 3) {
    // Foreground shoulder passes behind the right tuck into the dominant face.
    theta = mix(-0.45, 2.58, u);
    rx = 2.52;
    rz = 1.68;
    y = 0.02 + 0.34 * Math.cos(theta) - 0.24 * Math.sin(theta) + 0.28 * positive(Math.cos(theta));
    z = -0.015;
  } else if (index === 4) {
    // Low open crescent: staggered pointed ends and a full weighted center.
    theta = mix(2.83, 0.35, u);
    rx = 2.18;
    rz = 1.39;
    y = -0.61 - 0.51 * Math.sin(Math.PI * u) - 0.16 * u;
    z = 0.015;
  } else {
    // A shallower outer U remains visible at the sides behind the crescent.
    theta = mix(Math.PI - 0.1, 0.08, u);
    rx = 2.58;
    rz = 0.95;
    y = -0.2 - 0.98 * Math.sin(Math.PI * u) + 0.04 * Math.cos(Math.PI * u);
    z = -0.055;
  }
  return [rx * Math.cos(theta), y, rz * Math.sin(theta) + z];
}
const farPoints = [
  [24, 2.4, -1.8],
  [-24, 2, -2.2],
  [7.5, 22, -4],
  [-4, 1, -18],
  [-24, -0.4, -8],
  [-8, -18, -8],
];
const farControls = [
  [13, 5.2, 1.0],
  [-13, 4.7, 0.7],
  [2.5, 11.5, -5],
  [-3, 0.5, -10],
  [-13, 0.5, -5],
  [-6, 12, -5],
];
const joins = RIBBONS.map((_, i) => {
  const p = finalPoint(i, 0),
    q = finalPoint(i, 0.0001),
    d = q.map((v, k) => (v - p[k]) / 0.0001);
  return { end: p, control: p.map((v, k) => v - (d[k] * 2) / 3) };
});
function incomingPoint(index, s, time) {
  const a = farPoints[index],
    b = farControls[index],
    c = joins[index].control,
    d = joins[index].end;
  const v = 1 + s / 2,
    p = [];
  if (v < 0) {
    for (let k = 0; k < 3; k++) p[k] = a[k] + v * 3 * (b[k] - a[k]);
  } else {
    const w = 1 - v;
    for (let k = 0; k < 3; k++)
      p[k] = w * w * w * a[k] + 3 * w * w * v * b[k] + 3 * w * v * v * c[k] + v * v * v * d[k];
  }
  const mask = Math.sin(Math.PI * clamp(v)) ** 2;
  const damping = 1 - smooth(3.8, 5.2, time),
    phase = v * 9 - time * 3.2 + index * 1.7;
  p[0] += 0.3 * Math.sin(phase * 0.82) * mask * damping;
  p[1] += 0.68 * Math.sin(phase) * mask * damping;
  p[2] += 0.64 * Math.cos(phase * 0.91) * mask * damping;
  return p;
}

/** Public curve sampler also drives advected glints/sprites in the renderer. */
export function sampleRibbon(index, u, time = 8) {
  if (!RIBBONS[index]) throw new RangeError('Unknown Nest ribbon');
  u = clamp(u);
  const t = Math.max(0, time - RIBBONS[index].delay);
  const shift = 2.52 * (1 - smoother(t / 4.4));
  const s = u - shift;
  const p = s < 0 ? incomingPoint(index, s, time) : finalPoint(index, s);
  if (s >= 0 && time < 5.2) {
    const envelope = (1 - smooth(3.6, 5.2, time)) * Math.sin(Math.PI * clamp(s));
    p[1] += 0.105 * Math.sin(s * 8.0 - time * 3.0 + index) * envelope;
    p[2] += 0.075 * Math.sin(s * 7.2 - time * 2.7 + index * 1.3) * envelope;
  }
  return p;
}

function dimensions(segments, sides) {
  if (!Number.isInteger(segments) || segments < 16 || !Number.isInteger(sides) || sides < 16 || sides % 4)
    throw new RangeError('Use segments >=16 and sides>=16 divisible by four');
  return (segments + 1) * sides + 2 * (sides + 1);
}
/** Broad, gently cambered faces plus small true edge bevels. */
function section(j, sides, halfThickness, halfWidth) {
  const radius = Math.min(halfThickness * 0.78, halfWidth * 0.78, 0.03),
    cornerCount = sides >= 24 ? 3 : 2,
    faceCount = (sides - 4 * cornerCount - 4) / 2;
  const counts = [faceCount, cornerCount, 2, cornerCount, faceCount, cornerCount, 2, cornerCount];
  let part = 0,
    k = j;
  while (k >= counts[part]) {
    k -= counts[part];
    part++;
  }
  const t = k / counts[part],
    ht = halfThickness,
    hw = halfWidth,
    r = radius;
  let x, y, nx, ny;
  if (part === 0) {
    x = ht;
    y = mix(-hw + r, hw - r, t);
    nx = 1;
    ny = 0;
  } else if (part === 2) {
    x = mix(ht - r, -ht + r, t);
    y = hw;
    nx = 0;
    ny = 1;
  } else if (part === 4) {
    x = -ht;
    y = mix(hw - r, -hw + r, t);
    nx = -1;
    ny = 0;
  } else if (part === 6) {
    x = mix(-ht + r, ht - r, t);
    y = -hw;
    nx = 0;
    ny = -1;
  } else {
    const corner = (part - 1) / 2,
      angle = ((corner + t) * Math.PI) / 2;
    const cx = (corner === 0 || corner === 3 ? 1 : -1) * (ht - r),
      cy = (corner < 2 ? 1 : -1) * (hw - r);
    x = cx + Math.cos(angle) * r;
    y = cy + Math.sin(angle) * r;
    nx = Math.cos(angle);
    ny = Math.sin(angle);
  }
  const sign = Math.sign(x),
    camber = Math.min(0.025, hw * 0.09),
    slope = (-sign * 2 * camber * y) / (hw * hw);
  x += sign * camber * (1 - (y * y) / (hw * hw));
  ny -= slope * nx;
  const length = Math.hypot(nx, ny);
  return [x, y, nx / length, ny / length];
}
export function createRibbonGeometry(index, { segments = 192, sides = 32 } = {}) {
  const count = dimensions(segments, sides),
    positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3),
    uvs = new Float32Array(count * 2);
  const Type = count > 65535 ? Uint32Array : Uint16Array,
    indices = new Type(segments * sides * 6 + sides * 6);
  let k = 0;
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j,
        b = (i + 1) * sides + j,
        c = i * sides + ((j + 1) % sides),
        d = (i + 1) * sides + ((j + 1) % sides);
      indices.set([a, b, c, c, b, d], k);
      k += 6;
    }
  const cap = (segments + 1) * sides;
  for (let j = 0; j < sides; j++) {
    indices.set([cap, cap + 1 + j, cap + 1 + ((j + 1) % sides)], k);
    k += 3;
    const end = cap + sides + 1;
    indices.set([end, end + 1 + ((j + 1) % sides), end + 1 + j], k);
    k += 3;
  }
  for (let i = 0; i <= segments; i++)
    for (let j = 0; j < sides; j++) uvs.set([i / segments, j / sides], (i * sides + j) * 2);
  for (let end = 0; end < 2; end++) {
    const start = cap + end * (sides + 1);
    uvs.set([0.5, 0.5], start * 2);
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      uvs.set([0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)], (start + 1 + j) * 2);
    }
  }
  updateRibbonGeometry(index, 8, positions, normals, { segments, sides });
  return { positions, normals, indices, uvs };
}
export function updateRibbonGeometry(index, time, positions, normals, { segments = 192, sides = 32 } = {}) {
  const spec = RIBBONS[index],
    count = dimensions(segments, sides);
  if (!spec || positions.length !== count * 3 || normals.length !== count * 3)
    throw new RangeError('Ribbon arrays do not match resolution');
  const centers = [],
    tangents = [];
  for (let i = 0; i <= segments; i++) centers.push(sampleRibbon(index, i / segments, time));
  let up,
    previousAlignment = 0;
  for (let i = 0; i <= segments; i++) {
    const prev = centers[Math.max(0, i - 1)],
      next = centers[Math.min(segments, i + 1)],
      tangent = norm(next.map((v, k) => v - prev[k]));
    if (i === 0) {
      const reference = [0, 1, 0.08],
        projection = dot(reference, tangent);
      up = reference.map((v, k) => v - projection * tangent[k]);
      if (Math.hypot(...up) < 0.05) {
        const projection = tangent[2];
        up = [0, 0, 1].map((v, k) => v - projection * tangent[k]);
      }
      up = norm(up);
    } else {
      const projection = dot(up, tangent);
      up = norm(up.map((v, k) => v - projection * tangent[k]));
    }
    const transportedRadial = norm(cross(tangent, up));
    const reference = Math.abs(tangent[1]) < 0.995 ? [0, 1, 0] : [0, 0, 1],
      projection = dot(reference, tangent);
    const anchoredUp = norm(reference.map((v, k) => v - projection * tangent[k]));
    let alignment = Math.atan2(dot(transportedRadial, anchoredUp), dot(up, anchoredUp));
    while (alignment - previousAlignment > Math.PI) alignment -= Math.PI * 2;
    while (alignment - previousAlignment < -Math.PI) alignment += Math.PI * 2;
    previousAlignment = alignment;
    const roll = alignment * smooth(3.15, 5.2, time);
    const settledUp = up.map((v, k) => v * Math.cos(roll) + transportedRadial[k] * Math.sin(roll));
    const radial = norm(cross(tangent, settledUp));
    const u = i / segments,
      flutter = 1 - smooth(3.6, 5.2, time);
    const twist =
      0.075 * Math.sin(u * Math.PI * 2 + index * 0.65) + 0.35 * flutter * Math.sin(u * 9.5 - time * 3.4 + index * 1.1);
    const faceUp = settledUp.map((v, k) => v * Math.cos(twist) + radial[k] * Math.sin(twist));
    const faceRadial = radial.map((v, k) => v * Math.cos(twist) - settledUp[k] * Math.sin(twist));
    tangents.push(tangent);
    const tipDistance = Math.min(u, 1 - u),
      tip = clamp(tipDistance / 0.014);
    const corner = 0.82 + 0.18 * Math.sqrt(tip * (2 - tip)),
      thicknessScale = 0.82 + 0.18 * smooth(0, 0.014, tipDistance);
    let ribbonWidth = 1;
    if (index < 2) {
      const top = 0.86 + 0.14 * smooth(0, 0.17, u),
        tail = 0.085 + 0.915 * smooth(0, 0.2, 1 - u);
      ribbonWidth = top * tail;
    } else if (index < 4) {
      const start = 0.22 + 0.78 * smooth(0, 0.09, u),
        tail = 0.09 + 0.91 * smooth(0, 0.13, 1 - u);
      ribbonWidth = start * tail * (1 - (index === 2 ? 0.08 : 0.12) * Math.sin(Math.PI * u));
    } else if (index === 4) {
      ribbonWidth = (0.08 + 0.92 * smooth(0, 0.16, u)) * (0.1 + 0.9 * smooth(0, 0.2, 1 - u));
    } else ribbonWidth = (0.3 + 0.7 * smooth(0, 0.1, u)) * (0.3 + 0.7 * smooth(0, 0.1, 1 - u));
    const widthScale = corner * ribbonWidth;
    for (let j = 0; j < sides; j++) {
      const [rx, ry, nx, ny] = section(j, sides, (spec.thickness / 2) * thicknessScale, (spec.width / 2) * widthScale);
      const at = (i * sides + j) * 3;
      for (let axis = 0; axis < 3; axis++) {
        positions[at + axis] = centers[i][axis] + faceRadial[axis] * rx + faceUp[axis] * ry;
        normals[at + axis] = faceRadial[axis] * nx + faceUp[axis] * ny;
      }
    }
  }
  for (let i = 0; i <= segments; i++)
    for (let j = 0; j < sides; j++) {
      const at = (i * sides + j) * 3,
        a = (Math.max(0, i - 1) * sides + j) * 3,
        b = (Math.min(segments, i + 1) * sides + j) * 3;
      const derivative = [
          positions[b] - positions[a],
          positions[b + 1] - positions[a + 1],
          positions[b + 2] - positions[a + 2],
        ],
        normal = [normals[at], normals[at + 1], normals[at + 2]];
      const denominator = dot(tangents[i], derivative),
        correction = Math.abs(denominator) > 1e-7 ? -dot(normal, derivative) / denominator : 0;
      normals.set(norm(normal.map((v, k) => v + tangents[i][k] * correction)), at);
    }
  const cap = (segments + 1) * sides;
  for (let end = 0; end < 2; end++) {
    const i = end ? segments : 0,
      start = cap + end * (sides + 1),
      normal = tangents[i].map((v) => v * (end ? 1 : -1));
    positions.set(centers[i], start * 3);
    normals.set(normal, start * 3);
    for (let j = 0; j < sides; j++) {
      positions.set(positions.subarray((i * sides + j) * 3, (i * sides + j) * 3 + 3), (start + 1 + j) * 3);
      normals.set(normal, (start + 1 + j) * 3);
    }
  }
  return { positions, normals };
}

function shellNoise(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z),
    fx = smoother(x - ix),
    fy = smoother(y - iy),
    fz = smoother(z - iz);
  const hash = (a, b, c) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 2147483647.5 - 1;
  };
  const a = mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx),
    b = mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx);
  const c = mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx),
    d = mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx);
  return mix(mix(a, b, fy), mix(c, d, fy), fz);
}
function shellPoint(v, a) {
  const s = Math.sin(v),
    c = Math.cos(v),
    r = 0.755 * s * (1 - 0.095 * c),
    y = 0.775 * c,
    ca = Math.cos(a),
    sa = Math.sin(a);
  const dr = 0.755 * c * (1 - 0.095 * c) + 0.071725 * s * s,
    dy = -0.775 * s,
    n = norm([-dy * ca, dr, -dy * sa]),
    p = [r * ca, y, r * sa];
  // Very small continuous relief: satin ceramic grain rather than pits or spots.
  const relief =
    0.0007 * shellNoise(p[0] * 64, p[1] * 64, p[2] * 64) +
    0.00035 * shellNoise(p[0] * 112 + 7, p[1] * 112, p[2] * 112 - 9) +
    0.00015 * shellNoise(p[0] * 190, p[1] * 190 + 13, p[2] * 190);
  return p.map((value, k) => value + n[k] * relief);
}
function shellNormal(v, a) {
  const e = 0.00045;
  if (v < 1e-8 || Math.PI - v < 1e-8) {
    const near = v < 1e-8 ? e : Math.PI - e;
    const xp = shellPoint(near, 0),
      xm = shellPoint(near, Math.PI),
      zp = shellPoint(near, Math.PI / 2),
      zm = shellPoint(near, -Math.PI / 2);
    const dx = xp.map((value, k) => value - xm[k]),
      dz = zp.map((value, k) => value - zm[k]);
    return norm(v < 1e-8 ? cross(dz, dx) : cross(dx, dz));
  }
  const ap = shellPoint(v, a + e),
    am = shellPoint(v, a - e),
    vp = shellPoint(v + e, a),
    vm = shellPoint(v - e, a);
  const first = ap.map((value, k) => value - am[k]);
  const second = vp.map((value, k) => value - vm[k]);
  return norm(cross(first, second));
}
/** Round seed/egg with genuine fine ceramic relief and surface-derived normals. */
export function createEggGeometry({ rings = 128, sides = 192 } = {}) {
  if (!Number.isInteger(rings) || rings < 8 || !Number.isInteger(sides) || sides < 8)
    throw new RangeError('Use integer egg rings/sides >=8');
  const count = (rings + 1) * (sides + 1),
    positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3),
    uvs = new Float32Array(count * 2),
    list = [];
  for (let i = 0; i <= rings; i++) {
    const v = (i / rings) * Math.PI;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2,
        k = i * (sides + 1) + j;
      if (j === sides) {
        const first = i * (sides + 1) * 3;
        positions.set(positions.subarray(first, first + 3), k * 3);
        normals.set(normals.subarray(first, first + 3), k * 3);
      } else if ((i === 0 || i === rings) && j > 0) {
        const first = i * (sides + 1) * 3;
        positions.set(positions.subarray(first, first + 3), k * 3);
        normals.set(normals.subarray(first, first + 3), k * 3);
      } else {
        positions.set(shellPoint(v, a), k * 3);
        normals.set(shellNormal(v, a), k * 3);
      }
      uvs.set([j / sides, 1 - i / rings], k * 2);
      if (i < rings && j < sides) {
        const b = k + sides + 1;
        if (i > 0) list.push(k, k + 1, b);
        if (i < rings - 1) list.push(k + 1, b + 1, b);
      }
    }
  }
  return { positions, normals, uvs, indices: count > 65535 ? new Uint32Array(list) : new Uint16Array(list) };
}
