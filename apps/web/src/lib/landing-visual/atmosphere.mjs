import * as THREE from 'three';

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = smooth(x - ix),
    fy = smooth(y - iy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), fx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}
function fbm(x, y, octaves = 5) {
  let value = 0,
    amplitude = 0.5,
    weight = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x, y) * amplitude;
    weight += amplitude;
    x = x * 2.03 + 13.7;
    y = y * 2.01 + 7.9;
    amplitude *= 0.5;
  }
  return value / weight;
}

/** Metres above groundY, with the nest centered at local world X/Z = 0. */
export function terrainHeight(x, z) {
  const radius = Math.hypot(x, z);
  const broad = fbm(x * 0.24 + 14.6, z * 0.24 - 8.4, 4);
  const middle = fbm(x * 1.19 - 7.3, z * 1.19 + 20.7, 3);
  const fine = noise(x * 3.7 + 23, z * 3.7 - 4);
  const mound = (broad - 0.4) * 0.48 + (middle - 0.5) * 0.155 + (fine - 0.5) * 0.018;
  const basin = -0.026 - Math.exp(-((x / 1.9) ** 2) - ((z - 0.25) / 1.1) ** 2) * 0.022;
  const inner = clamp(basin + (middle - 0.5) * 0.025 + (fine - 0.5) * 0.008, -0.066, 0.003);
  const collar = smooth((radius - 2.65) / 1.0);
  let height = mix(inner, clamp(mound, -0.14, 0.19), collar);
  // A low irregular crescent supports the model's actual front foot, whose
  // lowest vertices are near X=0,Z=1.405. Its top stays below the mesh.
  const footZ = 1.405 - 0.1 * x * x + 0.02 * Math.sin(4 * x);
  const support = Math.exp(-((Math.abs(x) / 0.78) ** 4) - ((z - footZ) / 0.19) ** 2);
  height = mix(height, Math.min(0.005, -0.003 + (middle - 0.4) * 0.018), support);
  // Meet the far ring exactly, with zero slope through the perimeter band.
  const edge = smooth((18 - Math.max(Math.abs(x), Math.abs(z))) / 3.25);
  return height * edge;
}

function nearTerrainGeometry() {
  const geometry = new THREE.PlaneGeometry(36, 36, 144, 144);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setZ(i, terrainHeight(positions.getX(i), -positions.getY(i)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function farTerrainGeometry() {
  // A real hole prevents a mean-height far plane from covering local valleys.
  const rectangles = [
    [-500, 500, -500, -18],
    [-500, 500, 18, 500],
    [-500, -18, -18, 18],
    [18, 500, -18, 18],
  ];
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  rectangles.forEach(([x0, x1, y0, y1], i) => {
    positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]) {
      normals.push(0, 0, 1);
      uvs.push(x / 36 + 0.5, y / 36 + 0.5);
    }
    const a = i * 4;
    indices.push(a, a + 1, a + 2, a, a + 2, a + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const TERRAIN_GLSL = `
varying vec3 vNestTerrainWorld;
float nestTerrainHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float nestTerrainNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(nestTerrainHash(i),nestTerrainHash(i+vec2(1.,0.)),f.x),
    mix(nestTerrainHash(i+vec2(0.,1.)),nestTerrainHash(i+vec2(1.)),f.x),f.y);
}
mat2 nestTerrainRotation(vec2 cell) {
  float a=nestTerrainHash(cell+17.13)*6.28318530718;
  float c=cos(a),s=sin(a);return mat2(c,-s,s,c);
}
vec2 nestTerrainOffset(vec2 cell) {
  return vec2(nestTerrainHash(cell+4.37),nestTerrainHash(cell+91.79))*29.71;
}
struct NestTerrainFrame {
  vec2 uv0;vec2 uv1;vec2 uv2;vec2 dx;vec2 dy;
  mat2 r0;mat2 r1;mat2 r2;vec3 weights;float macro;
};
NestTerrainFrame nestTerrainFrame(vec2 worldXZ) {
  NestTerrainFrame f;
  vec2 p=vec2(worldXZ.x,-worldXZ.y)*.62;
  vec2 warp=vec2(nestTerrainNoise(p*.37+vec2(3.7,9.1)),nestTerrainNoise(p*.37+vec2(19.7,-2.3)))-.5;
  p+=warp*.28;
  f.dx=dFdx(p);f.dy=dFdy(p);
  vec2 grid=p*.79,cell=floor(grid),q=fract(grid),c0,c1,c2;
  if(q.x+q.y<1.) {
    c0=cell;c1=cell+vec2(1.,0.);c2=cell+vec2(0.,1.);
    f.weights=vec3(1.-q.x-q.y,q.x,q.y);
  } else {
    c0=cell+vec2(1.);c1=cell+vec2(0.,1.);c2=cell+vec2(1.,0.);
    f.weights=vec3(q.x+q.y-1.,1.-q.x,1.-q.y);
  }
  f.weights=pow(max(f.weights,vec3(0.)),vec3(2.4));f.weights/=dot(f.weights,vec3(1.));
  f.r0=nestTerrainRotation(c0);f.r1=nestTerrainRotation(c1);f.r2=nestTerrainRotation(c2);
  f.uv0=f.r0*p+nestTerrainOffset(c0);f.uv1=f.r1*p+nestTerrainOffset(c1);f.uv2=f.r2*p+nestTerrainOffset(c2);
  f.macro=nestTerrainNoise(worldXZ*.19+vec2(11.2,-9.5))*.65+nestTerrainNoise(worldXZ*.57+3.7)*.35;
  return f;
}
vec4 nestTerrainSample(sampler2D source,NestTerrainFrame f) {
  return textureGrad(source,f.uv0,f.r0*f.dx,f.r0*f.dy)*f.weights.x
    +textureGrad(source,f.uv1,f.r1*f.dx,f.r1*f.dy)*f.weights.y
    +textureGrad(source,f.uv2,f.r2*f.dx,f.r2*f.dy)*f.weights.z;
}
vec2 nestTerrainUnrotate(vec2 n,mat2 rotation) { return vec2(dot(rotation[0],n),dot(rotation[1],n)); }
vec3 nestTerrainNormal(sampler2D source,NestTerrainFrame f) {
  vec3 n0=textureGrad(source,f.uv0,f.r0*f.dx,f.r0*f.dy).xyz*2.-1.;
  vec3 n1=textureGrad(source,f.uv1,f.r1*f.dx,f.r1*f.dy).xyz*2.-1.;
  vec3 n2=textureGrad(source,f.uv2,f.r2*f.dx,f.r2*f.dy).xyz*2.-1.;
  n0.xy=nestTerrainUnrotate(n0.xy,f.r0);n1.xy=nestTerrainUnrotate(n1.xy,f.r1);n2.xy=nestTerrainUnrotate(n2.xy,f.r2);
  return normalize(n0*f.weights.x+n1*f.weights.y+n2*f.weights.z);
}
`;

function stochasticTerrainMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNestTerrainWorld;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvNestTerrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `
        NestTerrainFrame nestGroundFrame=nestTerrainFrame(vNestTerrainWorld.xz);
        #ifdef USE_MAP
          vec4 sampledDiffuseColor=nestTerrainSample(map,nestGroundFrame);
          sampledDiffuseColor.rgb*=mix(vec3(.72,.81,.64),vec3(1.18,1.13,.94),nestGroundFrame.macro);
          diffuseColor*=sampledDiffuseColor;
        #endif
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor=roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor*=nestTerrainSample(roughnessMap,nestGroundFrame).g*mix(.85,1.13,nestGroundFrame.macro);
        #endif
      `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 mapN=nestTerrainNormal(normalMap,nestGroundFrame);
          mapN.xy*=normalScale;
          normal=normalize(tbn*mapN);
        #else
          #include <normal_fragment_maps>
        #endif
      `,
      );
  };
  material.customProgramCacheKey = () => 'nest-world-stochastic-terrain-v1';
  return material;
}
function tileNoise(x, y, period) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = smooth(x - ix),
    fy = smooth(y - iy);
  const wrap = (n) => ((n % period) + period) % period;
  return mix(
    mix(hash(wrap(ix), wrap(iy)), hash(wrap(ix + 1), wrap(iy)), fx),
    mix(hash(wrap(ix), wrap(iy + 1)), hash(wrap(ix + 1), wrap(iy + 1)), fx),
    fy,
  );
}
function tileFbm(x, y, firstFrequency, octaves) {
  let value = 0,
    weight = 0,
    amplitude = 0.5,
    frequency = firstFrequency;
  for (let i = 0; i < octaves; i++) {
    value += tileNoise(x * frequency, y * frequency, frequency) * amplitude;
    weight += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value / weight;
}
function seeded(seed = 173) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(width, height = width) {
  const value = document.createElement('canvas');
  value.width = width;
  value.height = height;
  return [value, value.getContext('2d')];
}
function texture(source, { color = false, repeat } = {}) {
  const map = new THREE.CanvasTexture(source);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
  }
  map.anisotropy = 4;
  return map;
}

function floorMaps() {
  const size = 768;
  const [albedo, ac] = canvas(size),
    [bump, bc] = canvas(size),
    [roughness, rc] = canvas(size),
    [normal, nc] = canvas(size);
  const ad = ac.createImageData(size, size),
    bd = bc.createImageData(size, size),
    rd = rc.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = x / size,
        ny = y / size;
      const broad = tileFbm(nx, ny, 3, 4);
      const wx = tileNoise(nx * 7 + 3, ny * 7 + 5, 7) - 0.5;
      const wy = tileNoise(nx * 7 + 19, ny * 7 + 13, 7) - 0.5;
      const qx = nx + wx * 0.14,
        qy = ny + wy * 0.14;
      const clump = tileFbm(qx, qy, 17, 3);
      const fine = tileFbm(qx, qy, 107, 3),
        grit = hash(x + 119, y + 73);
      const warpedX = qx * 43 + clump * 3.8,
        warpedY = qy * 43 + clump * 3.2;
      const contour = tileNoise(warpedX, warpedY, 43);
      const thread = Math.exp(-(((contour - 0.5) * 23) ** 2));
      const threadEdge = Math.exp(-(((contour - 0.425) * 29) ** 2));
      const moss = smooth((broad * 0.65 + clump * 0.35 - 0.24) * 2.35);
      const wet = smooth((0.46 - clump) * 5.2) * (1 - moss * 0.45);
      const grain = (fine - 0.5) * 13 + (grit - 0.5) * 3;
      const height = clamp(0.17 + broad * 0.2 + clump * 0.24 + fine * 0.12 + thread * 0.22 - threadEdge * 0.065);
      const k = (y * size + x) * 4;
      // Green shadowed cushions; young olive tips catch the grazing golden key.
      ad.data[k] = (13 + moss * 35 + thread * 13 + grain) * (1 - wet * 0.63);
      ad.data[k + 1] = (29 + moss * 43 + thread * 15 + grain) * (1 - wet * 0.55);
      ad.data[k + 2] = (10 + moss * 12 + thread * 4 + grain * 0.35) * (1 - wet * 0.55);
      ad.data[k + 3] = 255;
      bd.data[k] = bd.data[k + 1] = bd.data[k + 2] = Math.round(height * 255);
      bd.data[k + 3] = 255;
      const r = Math.round(166 + fine * 53 + moss * 22 - wet * 81 - thread * 17);
      rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = r;
      rd.data[k + 3] = 255;
    }
  ac.putImageData(ad, 0, 0);
  bc.putImageData(bd, 0, 0);
  rc.putImageData(rd, 0, 0);
  // Short wandering moss strands create recognizable microstructure beneath the
  // broad organic contour ridges. Wrapped drawing preserves a seamless tile.
  const random = seeded(713);
  for (let i = 0; i < 11500; i++) {
    const startX = random() * size,
      startY = random() * size;
    const length = 3 + random() * 11,
      bend = (random() - 0.5) * 0.42;
    const angle = tileNoise((startX / size) * 17, (startY / size) * 17, 17) * Math.PI * 5;
    const points = [[startX, startY]];
    let px = startX,
      py = startY;
    for (let j = 0; j < length; j++) {
      const a = angle + bend * j + Math.sin(j * 0.5 + i) * 0.4;
      px += Math.cos(a) * 1.1;
      py += Math.sin(a) * 1.1;
      points.push([px, py]);
    }
    const width = 0.55 + random() * 0.8,
      alpha = 0.16 + random() * 0.23;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        if (startX + ox < -20 || startX + ox > size + 20 || startY + oy < -20 || startY + oy > size + 20) continue;
        for (const [context, color, opacity] of [
          [ac, '116,136,49', alpha],
          [bc, '245,245,245', alpha * 0.72],
          [rc, '120,120,120', alpha * 0.44],
        ]) {
          context.lineWidth = width;
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.strokeStyle = `rgba(${color},${opacity})`;
          context.beginPath();
          points.forEach(([x, y], j) => {
            if (j) context.lineTo(x + ox, y + oy);
            else context.moveTo(x + ox, y + oy);
          });
          context.stroke();
        }
      }
  }
  const relief = bc.getImageData(0, 0, size, size).data,
    nd = nc.createImageData(size, size);
  const at = (x, y) => relief[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 4.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 4.4;
      const scale = 1 / Math.hypot(dx, dy, 1),
        k = (y * size + x) * 4;
      nd.data[k] = (-dx * scale * 0.5 + 0.5) * 255;
      nd.data[k + 1] = (dy * scale * 0.5 + 0.5) * 255;
      nd.data[k + 2] = (scale * 0.5 + 0.5) * 255;
      nd.data[k + 3] = 255;
    }
  nc.putImageData(nd, 0, 0);
  return {
    map: texture(albedo, { color: true, repeat: 25 }),
    bumpMap: texture(bump, { repeat: 25 }),
    roughnessMap: texture(roughness, { repeat: 25 }),
    normalMap: texture(normal, { repeat: 25 }),
  };
}

function backdropMap() {
  const [source, context] = canvas(1536, 768);
  context.fillStyle = '#040a05';
  context.fillRect(0, 0, 1536, 768);
  function glow(x, y, rx, ry, center) {
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const g = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, center);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = g;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }
  glow(815, 330, 610, 510, '#4c5b2b');
  glow(1055, 490, 530, 360, '#3f5325');
  glow(450, 415, 530, 330, '#2e4c2d');
  glow(675, 85, 420, 410, '#33471f');
  // Extremely soft columns break the empty studio backdrop into distant foliage.
  const random = seeded(18);
  context.filter = 'blur(45px)';
  for (let i = 0; i < 21; i++) {
    const x = random() * 1536,
      width = 20 + random() * 72;
    context.fillStyle = i % 3 ? 'rgba(2,8,3,.24)' : 'rgba(54,64,20,.11)';
    context.beginPath();
    context.moveTo(x, -80);
    context.lineTo(x + width, -80);
    context.lineTo(x + width - 80, 850);
    context.lineTo(x - 180, 850);
    context.fill();
  }
  context.filter = 'none';
  // Dissolve the far set into the same fog as the floor; no studio horizon seam.
  context.globalCompositeOperation = 'destination-in';
  const fade = context.createLinearGradient(0, 0, 0, 768);
  fade.addColorStop(0, '#fff');
  fade.addColorStop(0.4, '#fff');
  fade.addColorStop(0.72, 'rgba(255,255,255,0)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = fade;
  context.fillRect(0, 0, 1536, 768);
  context.globalCompositeOperation = 'source-over';
  return texture(source, { color: true });
}

function bokehMap() {
  const [source, context] = canvas(128);
  const g = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,.40)');
  g.addColorStop(0.45, 'rgba(255,255,255,.33)');
  g.addColorStop(0.64, 'rgba(255,255,255,.38)');
  g.addColorStop(0.78, 'rgba(255,255,255,.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = g;
  context.fillRect(0, 0, 128, 128);
  return texture(source);
}

function hazeMap() {
  const [source, context] = canvas(512, 128),
    data = context.createImageData(512, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 512; x++) {
      const dx = (x - 256) / 256,
        dy = (y - 64) / 64;
      const mask = Math.exp(-dx * dx * 4.5 - dy * dy * 5.5);
      const cloudy = fbm(x / 76, y / 37, 4);
      const k = (y * 512 + x) * 4;
      data.data[k] = data.data[k + 1] = data.data[k + 2] = 255;
      data.data[k + 3] = Math.round(mask * (0.3 + cloudy * 0.7) * 255);
    }
  context.putImageData(data, 0, 0);
  return texture(source);
}

/** Atmosphere has no clock or event listeners; the entrance controller owns time. */
export function createAtmosphere(scene, { groundY = -1.5 } = {}) {
  const group = new THREE.Group();
  group.name = 'nest_atmosphere';
  scene.add(group);
  const textures = [],
    materialSet = new Set(),
    geometrySet = new Set();
  const own = (object) => {
    group.add(object);
    if (object.material) materialSet.add(object.material);
    if (object.geometry) geometrySet.add(object.geometry);
    return object;
  };

  const maps = floorMaps();
  textures.push(...Object.values(maps));
  // Named aliases let the reflection pass share exactly the floor's relief.
  textures.bump = maps.bumpMap;
  textures.roughness = maps.roughnessMap;
  textures.albedo = maps.map;
  textures.normal = maps.normalMap;
  const groundMaterial = stochasticTerrainMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0xd7e9b4,
      ...maps,
      normalScale: new THREE.Vector2(0.7, 0.7),
      bumpScale: 0.095,
      roughness: 0.72,
      metalness: 0.045,
      clearcoat: 0.075,
      clearcoatRoughness: 0.65,
      envMapIntensity: 0.065,
    }),
  );
  const ground = own(new THREE.Mesh(nearTerrainGeometry(), groundMaterial));
  ground.name = 'nest_ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.castShadow = true;
  ground.receiveShadow = true;
  const farGround = own(new THREE.Mesh(farTerrainGeometry(), groundMaterial));
  farGround.name = 'nest_far_ground_ring';
  farGround.rotation.x = -Math.PI / 2;
  farGround.position.y = groundY;
  farGround.receiveShadow = true;

  const backdropTexture = backdropMap();
  textures.push(backdropTexture);
  const backdrop = own(
    new THREE.Mesh(
      new THREE.PlaneGeometry(88, 44),
      new THREE.MeshBasicMaterial({ map: backdropTexture, transparent: true, fog: false, depthWrite: false }),
    ),
  );
  backdrop.name = 'nest_distant_forest';
  backdrop.position.set(0, 8, -35);
  backdrop.renderOrder = -100;

  const hazeTexture = hazeMap();
  textures.push(hazeTexture);
  const haze = Array.from({ length: 6 }, (_, i) => {
    const material = new THREE.SpriteMaterial({
      map: hazeTexture,
      color: i % 2 ? 0x7a8842 : 0x71875c,
      transparent: true,
      opacity: 0.064,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const sprite = own(new THREE.Sprite(material));
    sprite.name = `nest_ground_haze_${i}`;
    sprite.position.set((i - 2.5) * 3.2, groundY + 0.5 + (i % 3) * 0.26, -3.5 - (i % 3) * 2.3);
    sprite.scale.set(12 + (i % 3) * 2, 2.5 + (i % 2), 1);
    sprite.userData.baseX = sprite.position.x;
    return sprite;
  });
  // Broad soft moss/olive shafts sit behind the upper sculpture, where the
  // reference retains cloudy forest depth rather than fading into black.
  const canopyHaze = Array.from({ length: 2 }, (_, i) => {
    const material = new THREE.SpriteMaterial({
      map: hazeTexture,
      color: i ? 0x536d35 : 0x6a773a,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sprite = own(new THREE.Sprite(material));
    sprite.name = `nest_upper_forest_haze_${i}`;
    sprite.position.set(i ? 2.8 : -2.3, i ? 1.6 : 2.2, i ? -7.2 : -5.4);
    sprite.scale.set(i ? 10.5 : 9, i ? 7 : 6.4, 1);
    sprite.userData.baseX = sprite.position.x;
    return sprite;
  });

  const random = seeded(261),
    bokehTexture = bokehMap();
  textures.push(bokehTexture);
  const bokeh = Array.from({ length: 34 }, (_, i) => {
    const material = new THREE.SpriteMaterial({
      map: bokehTexture,
      color: i % 4 === 0 ? 0xb5a35d : i % 3 === 0 ? 0xd97627 : 0x61734a,
      transparent: true,
      opacity: 0.065 + random() * 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = own(new THREE.Sprite(material));
    sprite.name = `nest_distant_bokeh_${i}`;
    const x = (random() - 0.5) * 27,
      y = -0.6 + random() * 9,
      z = -11 - random() * 19;
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.3 + random() ** 2 * 1.65);
    sprite.userData = { x, y, z, phase: random() * Math.PI * 2, opacity: material.opacity };
    return sprite;
  });

  const count = 3500,
    pointPositions = new Float32Array(count * 3),
    pointColors = new Float32Array(count * 3);
  const pointSizes = new Float32Array(count),
    pointPhases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const near = i < 3100;
    let x, y, z;
    if (near) {
      const side = i % 2 ? 1 : -1;
      // Correlated clusters, rather than an even star field: concentrated near
      // the two raised ribbon shoulders, fading outward and down toward moss.
      const cluster = i % 7,
        spread = random() ** 0.68;
      x = side * (2.42 + spread * 1.2 + Math.sin(cluster * 2.7) * 0.16);
      y = -0.85 + random() ** 0.82 * 2.6 + Math.sin(cluster * 1.9) * 0.22;
      z = -0.45 - random() * 2.1 + Math.cos(cluster * 2.1) * 0.3;
    } else {
      const angle = random() * Math.PI * 2,
        radius = 4 + random() * 10;
      x = Math.cos(angle) * radius;
      y = -0.6 + random() ** 1.5 * 7;
      z = Math.sin(angle) * radius * 0.45 - 10;
    }
    pointPositions.set([x, y, z], i * 3);
    const warm = near || random() < 0.58;
    pointColors.set(
      warm
        ? [1.7 + random() * 0.5, 0.22 + random() * 0.3, 0.008 + random() * 0.018]
        : [0.2 + random() * 0.16, 0.33 + random() * 0.1, 0.14],
      i * 3,
    );
    pointSizes[i] = near ? 0.024 + random() ** 3 * 0.06 : 0.015 + random() ** 3 * 0.045;
    pointPhases[i] = random() * Math.PI * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
  dustGeometry.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(pointSizes, 1));
  dustGeometry.setAttribute('aPhase', new THREE.BufferAttribute(pointPhases, 1));
  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0.72 }, uImpact: { value: 0 } },
    vertexShader: `
      attribute float aSize; attribute float aPhase;
      uniform float uTime; uniform float uImpact;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec3 p=position;
        p.x += sin(uTime*.20+aPhase)*.15;
        p.y += sin(uTime*.15+aPhase*1.8)*.18;
        p.z += cos(uTime*.17+aPhase)*.14;
        p.xz *= 1.0+uImpact*.018;
        vec4 view=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(aSize*650.0/max(1.0,-view.z),.8,3.4);
        vColor=color;
        vAlpha=(.52+.17*sin(aPhase+uTime*.23))*exp(-max(0.0,-view.z-8.0)*.038);
      }`,
    fragmentShader: `
      uniform float uAmount; uniform float uImpact;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float radius=length(gl_PointCoord-.5)*2.0;
        if(radius>1.0) discard;
        float alpha=pow(1.0-radius,1.35)*vAlpha*uAmount;
        gl_FragColor=vec4(vColor*(1.0+uImpact*.35),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dust = own(new THREE.Points(dustGeometry, dustMaterial));
  dust.name = 'nest_amber_and_olive_motes';
  dust.frustumCulled = false;

  let disposed = false;
  function update(time, { reduced = false, impact = 0, formation = 1 } = {}) {
    if (disposed) return;
    const t = reduced ? 8 : time;
    const gathered = clamp(formation),
      pulse = reduced ? 0 : clamp(impact);
    maps.normalMap.repeat.copy(maps.bumpMap.repeat);
    dustMaterial.uniforms.uTime.value = t;
    dustMaterial.uniforms.uAmount.value = 0.42 + gathered * 0.82;
    dustMaterial.uniforms.uImpact.value = pulse;
    haze.forEach((sprite, i) => {
      sprite.position.x = sprite.userData.baseX + Math.sin(t * 0.085 + i * 1.7) * 0.6;
      sprite.material.opacity = 0.048 + gathered * 0.025 + pulse * 0.008;
    });
    canopyHaze.forEach((sprite, i) => {
      sprite.position.x = sprite.userData.baseX + Math.sin(t * 0.025 + i * 2) * 0.13;
      sprite.material.opacity = 0.06 + gathered * 0.018;
    });
    bokeh.forEach((sprite) => {
      const data = sprite.userData;
      sprite.position.x = data.x + Math.sin(t * 0.035 + data.phase) * 0.24;
      sprite.position.y = data.y + Math.cos(t * 0.045 + data.phase) * 0.17;
      sprite.material.opacity = data.opacity * (0.88 + 0.12 * Math.sin(t * 0.12 + data.phase));
    });
  }
  update(8);
  return {
    update,
    ground,
    farGround,
    groundMaterial,
    group,
    textures,
    terrainHeight(worldX, worldZ) {
      return terrainHeight(worldX - group.position.x, worldZ - group.position.z);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometrySet.forEach((item) => {
        item.dispose();
      });
      materialSet.forEach((item) => {
        item.dispose();
      });
      textures.forEach((item) => {
        item.dispose();
      });
    },
  };
}
