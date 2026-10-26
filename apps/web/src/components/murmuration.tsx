import { useEffect, useRef } from 'react';

import type { NestSurface } from '../lib/landing-visual/geometry.mjs';

const GATHER_SECONDS = 3;
const WIDE_VIEWPORT = 960;

const VERTEX_SHADER = `
attribute vec3 aScatter, aOffset;
attribute vec4 aData;
uniform float uTime, uGather, uPx;
varying vec3 vColor;
varying float vAlpha;
const float PI = 3.14159265359;
float ease(float x) { x=clamp(x,0.,1.); return x*x*x*(x*(x*6.-15.)+10.); }
vec3 bezier(vec3 a,vec3 b,vec3 c,vec3 d,float t) {
  float v=1.-t; return v*v*v*a+3.*v*v*t*b+3.*v*t*t*c+t*t*t*d;
}
vec3 ribbon(float i,float u) {
  if(i<.5) return bezier(vec3(-.50,1.60,-1.45),vec3(-2.50,1.52,-1.27),vec3(-2.45,.80,-.20),vec3(-1.83,.30,.02),u);
  if(i<1.5) return bezier(vec3(.50,1.57,-1.45),vec3(2.50,1.48,-1.28),vec3(2.43,.72,-.25),vec3(1.77,.26,.06),u);
  float theta,rx,rz,y,z=0.;
  if(i<2.5) { theta=mix(-2.55,-5.70,u);rx=2.48;rz=1.37;
    float c=-cos(theta);y=.02-.38*cos(theta)-.23*sin(theta)+.11*(c+sqrt(c*c+.0025)); }
  else if(i<3.5) { theta=mix(-.45,2.58,u);rx=2.52;rz=1.68;
    float c=cos(theta);y=.02+.34*cos(theta)-.24*sin(theta)+.14*(c+sqrt(c*c+.0025));z=-.015; }
  else if(i<4.5) { theta=mix(2.83,.35,u);rx=2.18;rz=1.39;y=-.61-.51*sin(PI*u)-.16*u;z=.015; }
  else { theta=mix(PI-.10,.08,u);rx=2.58;rz=.95;y=-.20-.98*sin(PI*u)+.04*cos(PI*u);z=-.055; }
  return vec3(rx*cos(theta),y,rz*sin(theta)+z);
}
vec3 incoming(float i,float s,float time) {
  vec3 a,b;
  if(i<.5){a=vec3(24.,2.4,-1.8);b=vec3(13.,5.2,1.);}
  else if(i<1.5){a=vec3(-24.,2.,-2.2);b=vec3(-13.,4.7,.7);}
  else if(i<2.5){a=vec3(7.5,22.,-4.);b=vec3(2.5,11.5,-5.);}
  else if(i<3.5){a=vec3(-4.,1.,-18.);b=vec3(-3.,.5,-10.);}
  else if(i<4.5){a=vec3(-24.,-.4,-8.);b=vec3(-13.,.5,-5.);}
  else {a=vec3(-8.,-18.,-8.);b=vec3(-6.,12.,-5.);}
  vec3 d=ribbon(i,0.),c=d-(ribbon(i,.0001)-d)*6666.667;
  float v=1.+s*.5;
  vec3 p=v<0.?a+v*3.*(b-a):bezier(a,b,c,d,v);
  float mask=pow(sin(PI*clamp(v,0.,1.)),2.)*(1.-smoothstep(3.8,5.2,time));
  float phase=v*9.-time*3.2+i*1.7;
  return p+vec3(.30*sin(phase*.82),.68*sin(phase),.64*cos(phase*.91))*mask;
}
void main() {
  float index=aData.x, u=aData.y, seed=aData.z;
  bool egg=index>5.5;
  vec3 p=position;
  float opacity=1.;
  if(!egg) {
    float clock=uTime*1.85;
    float shift=2.52*(1.-ease(max(0.,clock-index*.14)/4.40));
    float s=u-shift;
    vec3 center=s<0.?incoming(index,s,clock):ribbon(index,s);
    p=center+aOffset;
    float flutter=(1.-smoothstep(3.6,5.2,clock))*sin(PI*clamp(s,0.,1.));
    p.y+=.105*sin(s*8.-clock*3.+index)*flutter;
    p.z+=.075*sin(s*7.2-clock*2.7+index*1.3)*flutter;
  } else {
    float fall=clamp((uTime-1.66)/.72,0.,1.);
    float after=max(0.,uTime-2.38);
    float bounce=max(0.,sin(after*11.))*exp(-after*5.)*.24;
    p.y+=6.2*(1.-fall*fall)+bounce;
    opacity=smoothstep(1.62,1.84,uTime);
    float impact=exp(-pow((uTime-2.38)/.11,2.));
    p.y=(p.y-.15)*(1.-impact*.045)+.15;
  }
  float loose=1.-uGather;
  p=mix(aScatter,p,uGather);
  p+=vec3(sin(seed*19.+uTime*.55+p.y*2.),cos(seed*23.+uTime*.46+p.x),sin(seed*17.+uTime*.41))*mix(.008,.30,loose);
  p+=normal*.012;
  vec4 world=modelMatrix*vec4(p,1.);
  vec4 mv=viewMatrix*world;
  gl_Position=projectionMatrix*mv;
  vec3 n=normalize(mat3(modelMatrix)*normal);
  vec3 viewDirection=normalize(cameraPosition-world.xyz);
  vec3 light=normalize(vec3(-.65,.95,.8));
  float key=max(0.,dot(n,light));
  float rim=pow(1.-abs(dot(n,viewDirection)),2.7);
  float shine=pow(max(0.,dot(reflect(-light,n),viewDirection)),26.);
  vec3 orange=vec3(1.,.13,.003)*(.36+key*.85);
  orange+=vec3(1.,.43,.035)*(rim*.38+shine*.50);
  vec3 ivory=vec3(1.,.85,.55)*(.32+key*.88)+vec3(1.,.94,.75)*rim*.32;
  vColor=mix(orange,ivory,egg?1.:0.)*(1.6+seed*.8);
  float facing=smoothstep(-.25,.45,dot(n,viewDirection));
  vAlpha=opacity*mix(.15,1.05,facing)*(.75+seed*.25);
  gl_PointSize=clamp(aData.w*uPx*(7./-mv.z),.65,4.6);
}`;

const FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float r=length(gl_PointCoord-.5)*2.;
  if(r>1.)discard;
  float alpha=(1.-smoothstep(.14,1.,r))*vAlpha;
  gl_FragColor=vec4(vColor,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Murmuration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => {};

    void Promise.all([
      import('three'),
      import('../lib/landing-visual/geometry.mjs'),
      import('../lib/landing-visual/atmosphere.mjs'),
    ])
      .then(([THREE, nest, forest]) => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
        renderer.setClearColor(0x050c07);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.VSMShadowMap;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050c07);
        scene.fog = new THREE.FogExp2(0x050c07, 0.055);
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
        const sculpture = new THREE.Group();
        scene.add(sculpture);
        const surfaces = nest.RIBBONS.map((_, index) => nest.createRibbonGeometry(index, { segments: 144, sides: 24 }));
        surfaces.push(nest.createEggGeometry({ rings: 48, sides: 80 }));
        const count = window.innerWidth > WIDE_VIEWPORT ? 116_000 : 58_000;
        const geometry = particleGeometry(THREE, surfaces, nest.sampleRibbon, count);
        const uniforms = { uTime: { value: 0 }, uGather: { value: 1 }, uPx: { value: renderer.getPixelRatio() } };
        const material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending,
          uniforms,
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        sculpture.add(points);
        const shadowMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
        const shadowGroup = new THREE.Group();
        for (const [index, surface] of surfaces.entries()) {
          const meshGeometry = new THREE.BufferGeometry();
          meshGeometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
          meshGeometry.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
          meshGeometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
          const mesh = new THREE.Mesh(meshGeometry, shadowMaterial);
          mesh.castShadow = true;
          if (index === 6) mesh.position.y = 0.15;
          shadowGroup.add(mesh);
        }
        sculpture.add(shadowGroup);
        const atmosphere = forest.createAtmosphere(scene, { groundY: -1.51 });
        atmosphere.groundMaterial.normalScale.set(0.38, 0.38);
        atmosphere.groundMaterial.bumpScale = 0.028;
        atmosphere.groundMaterial.clearcoat = 0.025;
        atmosphere.groundMaterial.roughness = 0.93;
        const key = new THREE.DirectionalLight(0xffd88a, 4.6);
        key.position.set(-3, 6, 5);
        key.target.position.set(1.9, 0, 0);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.blurSamples = 8;
        key.shadow.radius = 5;
        key.shadow.bias = -0.00015;
        key.shadow.normalBias = 0.025;
        Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -6, near: 0.5, far: 28 });
        scene.add(key, key.target);
        scene.add(new THREE.HemisphereLight(0x98b878, 0x060b04, 0.36));
        const green = new THREE.SpotLight(0xa1bd71, 45, 35, 0.85, 1, 2);
        green.position.set(-5, 4, -4);
        green.target.position.set(1, -1.4, 2);
        scene.add(green, green.target);
        const warmth = new THREE.PointLight(0xff8a24, 3.3, 8, 2);
        warmth.position.set(1.1, -0.5, 1.4);
        scene.add(warmth);

        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        let still = media.matches;
        let pointerX = 0;
        let pointerY = 0;
        let targetX = 0;
        let targetY = 0;
        let frame = 0;
        let visible = !document.hidden;
        const started = performance.now();

        function draw() {
          const t = still ? 8 : (performance.now() - started) / 1000;
          pointerX += (targetX - pointerX) * 0.04;
          pointerY += (targetY - pointerY) * 0.04;
          const progress = Math.min(1, t / GATHER_SECONDS);
          const scrolled = Math.min(1, window.scrollY / window.innerHeight);
          uniforms.uTime.value = t;
          uniforms.uGather.value = 1 - 0.55 * scrolled;
          sculpture.rotation.set(pointerY * 0.075, -0.08 + Math.sin(t * 0.12) * 0.09 + pointerX * 0.22, 0);
          shadowGroup.visible = progress > 0.75;
          shadowMaterial.depthWrite = scrolled < 0.025;
          key.shadow.intensity = Math.max(0, 1 - scrolled * 2) * Math.min(1, Math.max(0, (t - 2.3) / 0.7));
          atmosphere.update(t * 1.85, { reduced: still, formation: progress * (1 - scrolled * 0.7) });
          renderer.render(scene, camera);
          renderer.domElement.dataset.nestScene = 'ready';
          renderer.domElement.dataset.nestMotion = still ? 'reduced' : 'animated';
          renderer.domElement.dataset.nestScroll = scrolled.toFixed(3);
        }
        function loop() {
          if (!visible) return;
          draw();
          if (!still) frame = requestAnimationFrame(loop);
        }
        function resize() {
          const width = window.innerWidth;
          const height = window.innerHeight;
          const wide = width > WIDE_VIEWPORT;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          const centerX = wide ? Math.min(1.9, Math.max(0.8, (camera.aspect - 1.1) * 2.2)) : 0;
          sculpture.position.set(centerX, wide ? 0.35 : 1.8, 0);
          atmosphere.group.position.copy(sculpture.position);
          const distance = Math.max(
            wide ? 8.5 : 10.5,
            (wide ? centerX + 2.9 : 3.15) / (Math.tan((19 * Math.PI) / 180) * camera.aspect),
          );
          camera.position.set(0, 1, distance);
          camera.lookAt(0, -0.2, 0);
          if (still) draw();
        }
        function onPointer(event: PointerEvent) {
          targetX = (event.clientX / window.innerWidth) * 2 - 1;
          targetY = (event.clientY / window.innerHeight) * 2 - 1;
        }
        function onScroll() {
          if (still) draw();
        }
        function onVisibility() {
          visible = !document.hidden;
          cancelAnimationFrame(frame);
          if (visible) loop();
        }
        function onMotion() {
          still = media.matches;
          cancelAnimationFrame(frame);
          loop();
        }

        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pointermove', onPointer, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        media.addEventListener('change', onMotion);
        loop();
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('resize', resize);
          window.removeEventListener('scroll', onScroll);
          window.removeEventListener('pointermove', onPointer);
          document.removeEventListener('visibilitychange', onVisibility);
          media.removeEventListener('change', onMotion);
          geometry.dispose();
          material.dispose();
          shadowGroup.children.forEach((mesh) => {
            if (mesh instanceof THREE.Mesh) mesh.geometry.dispose();
          });
          shadowMaterial.dispose();
          key.shadow.dispose();
          atmosphere.dispose();
          renderer.dispose();
        };
      })
      .catch(() => {
        canvas.dataset.nestScene = 'fallback';
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0 block h-screen w-screen bg-[radial-gradient(ellipse_at_68%_45%,#26391a_0%,#071109_56%,#040a06_100%)]"
      />
    </div>
  );
}

function particleGeometry(
  THREE: typeof import('three'),
  surfaces: NestSurface[],
  sampleRibbon: (index: number, u: number, time?: number) => number[],
  count: number,
) {
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const scattered = new Float32Array(count * 3);
  const offsets = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const random = seededRandom(713);
  let cursor = 0;
  for (const [part, surface] of surfaces.entries()) {
    const areas: number[] = [];
    let area = 0;
    for (let i = 0; i < surface.indices.length; i += 3) {
      const a = (surface.indices[i] ?? 0) * 3;
      const b = (surface.indices[i + 1] ?? 0) * 3;
      const c = (surface.indices[i + 2] ?? 0) * 3;
      const ab = [0, 1, 2].map((axis) => (surface.positions[b + axis] ?? 0) - (surface.positions[a + axis] ?? 0));
      const ac = [0, 1, 2].map((axis) => (surface.positions[c + axis] ?? 0) - (surface.positions[a + axis] ?? 0));
      area += Math.hypot(
        (ab[1] ?? 0) * (ac[2] ?? 0) - (ab[2] ?? 0) * (ac[1] ?? 0),
        (ab[2] ?? 0) * (ac[0] ?? 0) - (ab[0] ?? 0) * (ac[2] ?? 0),
        (ab[0] ?? 0) * (ac[1] ?? 0) - (ab[1] ?? 0) * (ac[0] ?? 0),
      );
      areas.push(area);
    }
    const allocation =
      part === 6 ? count - cursor : Math.floor(count * ([0.12, 0.12, 0.16, 0.18, 0.14, 0.1][part] ?? 0));
    for (let j = 0; j < allocation; j++) {
      const target = random() * area;
      let lo = 0;
      let hi = areas.length - 1;
      while (lo < hi) {
        const middle = (lo + hi) >>> 1;
        if ((areas[middle] ?? 0) < target) lo = middle + 1;
        else hi = middle;
      }
      const a = surface.indices[lo * 3] ?? 0;
      const b = surface.indices[lo * 3 + 1] ?? 0;
      const c = surface.indices[lo * 3 + 2] ?? 0;
      const root = Math.sqrt(random());
      const v = random();
      const weights = [1 - root, root * (1 - v), root * v];
      let u = 0;
      const p = [0, 0, 0];
      const n = [0, 0, 0];
      for (const [vertex, index] of [a, b, c].entries()) {
        const weight = weights[vertex] ?? 0;
        u += (surface.uvs[index * 2] ?? 0) * weight;
        for (let axis = 0; axis < 3; axis++) {
          p[axis] = (p[axis] ?? 0) + (surface.positions[index * 3 + axis] ?? 0) * weight;
          n[axis] = (n[axis] ?? 0) + (surface.normals[index * 3 + axis] ?? 0) * weight;
        }
      }
      const center = part < 6 ? sampleRibbon(part, u, 8) : [0, 0, 0];
      const i = cursor++;
      for (let axis = 0; axis < 3; axis++) {
        positions[i * 3 + axis] = (p[axis] ?? 0) + (part === 6 && axis === 1 ? 0.15 : 0);
        normals[i * 3 + axis] = (n[axis] ?? 0) / Math.hypot(...n);
        offsets[i * 3 + axis] = (p[axis] ?? 0) - (center[axis] ?? 0);
      }
      const phi = random() * Math.PI * 2;
      const y = random() * 2 - 1;
      const r = 6 + random() * 7;
      const ring = Math.sqrt(1 - y * y);
      scattered.set([r * ring * Math.cos(phi), r * y, r * ring * Math.sin(phi)], i * 3);
      data.set([part, u, random(), 1.6 + random() * 1.0], i * 4);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scattered, 3));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
  geometry.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  return geometry;
}

function seededRandom(initial: number) {
  let seed = initial;
  return function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
