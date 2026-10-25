import { useEffect, useRef } from 'react';

const PARTICLES = 60_000;
/** Particles that form the warm core; the rest trace the bowl around it. */
const CORE_SHARE = 0.1;
const GATHER_SECONDS = 3;
const WIDE_VIEWPORT = 960;

const VERTEX_SHADER = `attribute vec3 aScatter;attribute vec2 aSeed;uniform float uTime,uGather,uPx;varying float vHot;varying float vA;
void main(){float s=aSeed.x*6.2831;vec3 p=mix(aScatter,position,uGather);
p+=0.05*vec3(sin(uTime*.7+s+p.y*2.),cos(uTime*.6+s*1.3+p.x*2.),sin(uTime*.5+s*.7+p.z*2.));
if(aSeed.y>.5){p.y+=0.04*sin(uTime*1.2);p*=1.0+0.03*sin(uTime*1.5+s);}
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
gl_PointSize=(aSeed.y>.5?2.8:1.7)*uPx*(7./-mv.z);vHot=aSeed.y;vA=.3+.7*aSeed.x;}`;

const FRAGMENT_SHADER = `varying float vHot;varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,0.,d);
vec3 col=mix(vec3(.95,.91,.84),vec3(1.,.38,.13),vHot);gl_FragColor=vec4(col,a*vA*(vHot>.5?.95:.5));}`;

/**
 * The landing page's background: particles gather from a scattered cloud into a bowl around a warm
 * core, drift with the pointer and loosen as the page scrolls. Three.js loads only on this page;
 * without WebGL the canvas keeps its gradient. With reduced motion it draws one still frame.
 */
export function Murmuration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => {};

    void import('three')
      .then((THREE) => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        const geometry = murmurationGeometry(THREE);
        const time = { value: 0 };
        const gather = { value: 0 };
        const material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: time, uGather: gather, uPx: { value: renderer.getPixelRatio() } },
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
        });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let pointerX = 0;
        let pointerY = 0;
        let targetX = 0;
        let targetY = 0;
        let frame = 0;
        const started = performance.now();

        function draw() {
          const t = still ? 0 : (performance.now() - started) / 1000;
          pointerX += (targetX - pointerX) * 0.04;
          pointerY += (targetY - pointerY) * 0.04;
          const progress = still ? 1 : Math.min(1, t / GATHER_SECONDS);
          const scrolled = Math.min(1, window.scrollY / window.innerHeight);
          time.value = t;
          gather.value = (1 - (1 - progress) ** 3) * (1 - 0.55 * scrolled);
          points.rotation.y = t * 0.07 + pointerX * 0.35;
          points.rotation.x = 0.12 + pointerY * 0.12;
          renderer.render(scene, camera);
        }
        function loop() {
          draw();
          frame = requestAnimationFrame(loop);
        }
        function resize() {
          const width = window.innerWidth;
          const height = window.innerHeight;
          const wide = width > WIDE_VIEWPORT;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          points.position.set(wide ? 1.9 : 0, wide ? 0.35 : 0.9, 0);
          camera.position.set(0, 1, wide ? 8.5 : 10.5);
          camera.lookAt(0, -0.2, 0);
          if (still) draw();
        }
        function onPointer(event: PointerEvent) {
          targetX = (event.clientX / window.innerWidth) * 2 - 1;
          targetY = (event.clientY / window.innerHeight) * 2 - 1;
        }

        resize();
        window.addEventListener('resize', resize);
        if (still) {
          window.addEventListener('scroll', draw, { passive: true });
        } else {
          window.addEventListener('pointermove', onPointer);
          loop();
        }
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('resize', resize);
          window.removeEventListener('scroll', draw);
          window.removeEventListener('pointermove', onPointer);
          geometry.dispose();
          material.dispose();
          renderer.dispose();
        };
      })
      .catch(() => {
        // The gradient behind the canvas stands in when Three.js cannot load.
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
        className="fixed inset-0 z-0 block h-screen w-screen bg-[radial-gradient(60%_60%_at_65%_45%,#17120e_0%,#08090a_70%)]"
      />
    </div>
  );
}

/** Each particle has a resting place in the bowl or core, a scattered start, and a random seed. */
function murmurationGeometry(THREE: typeof import('three')) {
  const positions = new Float32Array(PARTICLES * 3);
  const scattered = new Float32Array(PARTICLES * 3);
  const seeds = new Float32Array(PARTICLES * 2);
  for (let i = 0; i < PARTICLES; i++) {
    let x: number;
    let y: number;
    let z: number;
    let hot = 0;
    if (i < PARTICLES * (1 - CORE_SHARE)) {
      // 500 golden-angle strands wound around a sphere's lower half form the bowl.
      const strand = i % 500;
      const t = Math.random();
      const theta = strand * 2.39996 + t * Math.PI * 2 * (1.2 + (strand % 7) * 0.18);
      const latitude = -0.12 - 0.95 * (0.5 + 0.5 * Math.sin(t * Math.PI * (3 + (strand % 4)) + strand));
      const radius = 2.3 + (Math.random() - 0.5) * 0.14;
      x = radius * Math.cos(latitude) * Math.cos(theta);
      y = radius * Math.sin(latitude) + 0.9;
      z = radius * Math.cos(latitude) * Math.sin(theta);
    } else {
      const [ux, uy, uz] = randomDirection();
      const radius = 0.55 * Math.cbrt(Math.random());
      x = radius * ux;
      y = radius * uy * 1.2 - 0.5;
      z = radius * uz;
      hot = 1;
    }
    positions.set([x, y, z], i * 3);
    const [sx, sy, sz] = randomDirection();
    const spread = 6 + Math.random() * 7;
    scattered.set([spread * sx, spread * sy, spread * sz], i * 3);
    seeds.set([Math.random(), hot], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scattered, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 2));
  return geometry;
}

function randomDirection(): [number, number, number] {
  const u = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(phi), u, s * Math.sin(phi)];
}
