import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Person = 'Fran' | 'Yane';
type WorldOptions = {
  onPerson: (person: Person) => void;
  onUnavailable: () => void;
  reducedMotion: boolean;
  mode: 'calm' | 'party';
};

export type CapitalWorld = {
  update: (options: Partial<WorldOptions>) => void;
  playStep: (stepIndex: number, saleSnapshot?: unknown) => void;
  stopEffects: () => void;
  resize: () => void;
  dispose: () => void;
};

/** A presentation-only world: the ledger and all amounts stay outside WebGL. */
export async function createWorld(host: HTMLElement, initialOptions: WorldOptions): Promise<CapitalWorld> {
  let options = { ...initialOptions };
  let disposed = false;
  let visible = true;
  let raf = 0;
  let effectStart = 0;
  let effectStep = -1;
  let lastFrame = 0;
  const smallScreen = matchMedia('(max-width: 650px)');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, smallScreen.matches ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.touchAction = 'pan-y';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 80);
  camera.position.set(10.5, 12.5, 19);
  const lookAt = new THREE.Vector3(0, 0.85, 0);
  camera.lookAt(lookAt);
  scene.add(new THREE.HemisphereLight(0xfff5df, 0x678678, 2.8));
  const sun = new THREE.DirectionalLight(0xffedc7, 4.1);
  sun.position.set(-7, 13, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(smallScreen.matches ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 10, bottom: -9, near: 0.5, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd4e9ff, 0.8);
  fill.position.set(8, 5, -6);
  scene.add(fill);

  const materials: THREE.MeshStandardMaterial[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: number, roughness = 0.78, metalness = 0) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.push(result);
    return result;
  };
  const palette = {
    earth: material(0xc88c68), soil: material(0xe4b28e), grass: material(0x91cca5),
    cream: material(0xffefd2), path: material(0xf4dfb6), wood: material(0xb77749),
    lightWood: material(0xe0ad72), darkWood: material(0x6a4937), roof: material(0x279b91),
    roofLight: material(0x53b9a6), fran: material(0x428c71), franLight: material(0x8dce9a),
    yane: material(0x9481c3), yaneLight: material(0xc6b4ed), dark: material(0x314f4c),
    window: material(0xffd677, 0.36), gold: material(0xf4b83e, 0.33, 0.38),
    goldLight: material(0xffdf87, 0.4, 0.16), foliage: material(0x4f9d72),
    foliageLight: material(0x77b77a), pink: material(0xefb1a6), cloud: material(0xfff7e8),
  };
  const assembly = new THREE.Group();
  scene.add(assembly);
  const keep = <T extends THREE.BufferGeometry>(geometry: T): T => { geometries.add(geometry); return geometry; };
  const roundedCache = new Map<string, THREE.BufferGeometry>();
  const box = (width: number, height: number, depth: number, radius = 0.12) => {
    const key = [width, height, depth, radius].join(':');
    if (!roundedCache.has(key)) roundedCache.set(key, keep(new RoundedBoxGeometry(width, height, depth, 3, radius)));
    return roundedCache.get(key)!;
  };
  const sphere = keep(new THREE.SphereGeometry(1, 14, 10));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 24));
  const ring = keep(new THREE.TorusGeometry(1, 0.085, 6, 24));
  const mesh = (geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(x, y, z);
    assembly.add(object);
    return object;
  };
  const block = (size: number[], position: number[], surface: THREE.Material, radius = 0.12) =>
    mesh(box(size[0]!, size[1]!, size[2]!, radius), surface, position[0]!, position[1]!, position[2]!);
  const ball = (x: number, y: number, z: number, scale: number[], surface: THREE.Material) => {
    const object = mesh(sphere, surface, x, y, z);
    object.scale.set(scale[0]!, scale[1]!, scale[2]!);
    return object;
  };
  const disc = (x: number, y: number, z: number, radius: number, thickness: number, surface: THREE.Material, upright = false) => {
    const object = mesh(cylinder, surface, x, y, z);
    object.scale.set(radius, thickness, radius);
    if (upright) object.rotation.x = Math.PI / 2;
    return object;
  };
  const torus = (x: number, y: number, z: number, radius: number, surface: THREE.Material) => {
    const object = mesh(ring, surface, x, y, z);
    object.scale.setScalar(radius);
    return object;
  };
  const coinStack = (x: number, z: number, count: number, y = 0.89) => {
    for (let i = 0; i < count; i++) disc(x, y + i * 0.105, z, 0.24, 0.095, i === count - 1 ? palette.goldLight : palette.gold);
    const rim = torus(x, y + (count - 1) * 0.105 + 0.052, z, 0.17, palette.gold);
    rim.rotation.x = -Math.PI / 2;
  };

  // A rounded, layered floating island. The visible underside supplies real depth.
  const outline = [new THREE.Vector2(0, -2.1), new THREE.Vector2(2.4, -2.05), new THREE.Vector2(4.7, -1.45),
    new THREE.Vector2(6.15, -0.55), new THREE.Vector2(6.55, -0.05), new THREE.Vector2(6.65, 0.35),
    new THREE.Vector2(6.52, 0.5), new THREE.Vector2(0, 0.5)];
  const underside = mesh(keep(new THREE.LatheGeometry(outline, 64)), palette.earth, 0, 0, 0);
  underside.scale.z = 0.7;
  const soil = disc(0, 0.47, 0, 6.54, 0.22, palette.soil);
  soil.scale.z *= 0.7;
  const turf = disc(0, 0.65, 0, 6.45, 0.2, palette.grass);
  turf.scale.z *= 0.7;
  for (const position of [[-4.8, -0.6, 2.4], [4.9, -0.8, 1.4], [-2, -1.6, 2.2], [2.4, -1.7, 1.6]])
    ball(position[0]!, position[1]!, position[2]!, [0.4, 0.26, 0.3], palette.soil);
  block([2, 0.08, 5.4], [0, 0.8, 0.1], palette.path, 0.04);
  block([9.2, 0.07, 1.3], [0, 0.8, 0.9], palette.path, 0.035);
  for (let i = 0; i < 5; i++) block([0.7, 0.055, 0.33], [0, 0.85, 2.3 + i * 0.41], palette.cream, 0.025);

  // The shared business, made from warm timber and a soft, chunky teal roof.
  block([3.15, 2.25, 2.1], [0, 1.93, -1.17], palette.cream, 0.2);
  block([3.45, 0.23, 2.4], [0, 0.96, -1.15], palette.lightWood, 0.1);
  block([3.38, 0.22, 2.35], [0, 3.04, -1.17], palette.wood, 0.08);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.95, 0); roofShape.lineTo(0, 1.3); roofShape.lineTo(1.95, 0); roofShape.closePath();
  const roofGeometry = keep(new THREE.ExtrudeGeometry(roofShape, { depth: 2.45, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.12, bevelThickness: 0.12 }));
  mesh(roofGeometry, palette.roof, 0, 3.15, -2.42);
  const roofRidge = block([0.22, 0.18, 2.75], [0, 4.47, -1.17], palette.roofLight, 0.07);
  roofRidge.rotation.z = 0.02;
  for (const side of [-1, 1]) {
    block([0.18, 1.97, 0.2], [side * 1.43, 2, 0], palette.wood, 0.04);
    block([0.71, 0.86, 0.13], [side * 1.01, 2.1, -0.06], palette.wood, 0.08);
    block([0.53, 0.67, 0.08], [side * 1.01, 2.1, 0.03], palette.window, 0.07);
    block([0.045, 0.7, 0.06], [side * 1.01, 2.1, 0.1], palette.cream, 0.01);
    block([0.56, 0.045, 0.06], [side * 1.01, 2.1, 0.1], palette.cream, 0.01);
    block([0.87, 0.2, 0.38], [side * 1.01, 1.55, 0.13], palette.lightWood, 0.05);
    for (let sprig = 0; sprig < 3; sprig++) ball(side * 1.01 + (sprig - 1) * 0.22, 1.71, 0.14, [0.17, 0.16, 0.15], palette.foliage);
  }
  block([0.82, 1.49, 0.14], [0, 1.7, -0.01], palette.darkWood, 0.17);
  block([0.61, 1.28, 0.1], [0, 1.7, 0.07], palette.lightWood, 0.15);
  ball(0.18, 1.65, 0.15, [0.055, 0.055, 0.055], palette.gold);
  block([1.34, 0.4, 0.17], [0, 2.76, 0.04], palette.darkWood, 0.1);
  disc(0, 2.77, 0.17, 0.24, 0.075, palette.gold, true);
  block([0.06, 0.27, 0.04], [0, 2.77, 0.22], palette.goldLight, 0.015);
  block([1.5, 0.18, 0.58], [0, 0.97, 0.19], palette.wood, 0.06);

  const selectors: Array<THREE.Mesh> = [];
  const invisible = new THREE.MeshBasicMaterial({ visible: false });
  function vault(person: Person, x: number, body: THREE.Material, face: THREE.Material) {
    const z = 1.05;
    disc(x, 0.88, z, 1.51, 0.2, palette.cream);
    block([2.16, 1.91, 1.63], [x, 1.91, z], body, 0.22);
    block([2.24, 0.2, 1.72], [x, 2.94, z], face, 0.09);
    block([0.92, 0.08, 0.17], [x, 3.07, z], palette.dark, 0.035);
    disc(x, 1.94, z + 0.91, 0.77, 0.13, palette.cream, true);
    disc(x, 1.94, z + 1, 0.61, 0.12, face, true);
    torus(x, 1.94, z + 1.075, 0.51, body);
    disc(x, 1.94, z + 1.13, 0.16, 0.11, palette.gold, true);
    for (let i = 0; i < 3; i++) {
      const spoke = block([0.65, 0.09, 0.09], [x, 1.94, z + 1.18], palette.goldLight, 0.035);
      spoke.rotation.z = i * Math.PI / 3;
    }
    for (const side of [-1, 1]) {
      block([0.18, 0.32, 0.2], [x + side * 0.98, 1.42, z + 0.88], palette.gold, 0.04);
      block([0.18, 0.32, 0.2], [x + side * 0.98, 2.42, z + 0.88], palette.gold, 0.04);
    }
    // A separate little tray makes pending profits visually distinct from capital.
    block([1.25, 0.16, 0.62], [x + 0.2, 0.95, z + 1.65], palette.lightWood, 0.06);
    coinStack(x - 0.12, z + 1.66, 3, 1.08);
    coinStack(x + 0.4, z + 1.67, 2, 1.08);
    const target = new THREE.Mesh(box(2.7, 2.8, 2.5), invisible);
    target.position.set(x, 2.1, z);
    target.userData.person = person;
    target.updateMatrixWorld(true);
    selectors.push(target);
  }
  vault('Fran', -3.5, palette.fran, palette.franLight);
  vault('Yane', 3.5, palette.yane, palette.yaneLight);

  // A coin collection point is the visual origin of each saved sale's animation.
  disc(0, 0.98, 1.65, 0.87, 0.25, palette.wood);
  disc(0, 1.13, 1.65, 0.75, 0.08, palette.goldLight);
  coinStack(-0.19, 1.65, 4, 1.23);
  coinStack(0.32, 1.67, 2, 1.23);

  function tree(x: number, z: number, scale = 1) {
    const trunk = disc(x, 1.3, z, 0.13, 1.14, palette.wood);
    trunk.scale.y *= scale;
    ball(x, 1.9 + scale * 0.3, z, [0.66 * scale, 0.9 * scale, 0.66 * scale], palette.foliage);
    ball(x - 0.31 * scale, 2.05, z + 0.12, [0.47 * scale, 0.62 * scale, 0.48 * scale], palette.foliageLight);
    ball(x + 0.26 * scale, 1.99, z + 0.17, [0.45 * scale, 0.57 * scale, 0.44 * scale], palette.foliage);
  }
  tree(-4.48, -1.58, 1.1); tree(4.16, -1.9, 1.2); tree(2.55, -3.06, 0.7);
  for (const [x, z, scale] of [[-5.28, 0.05, 0.46], [5.25, -0.2, 0.5], [-4.4, 2.86, 0.34], [4.2, 2.9, 0.37], [-2.45, -2.5, 0.42]]) {
    ball(x!, 0.93, z!, [scale!, scale! * 0.72, scale!], palette.foliageLight);
    ball(x! + 0.27, 0.89, z! + 0.1, [scale! * 0.7, scale! * 0.54, scale! * 0.7], palette.foliage);
  }
  for (const [x, z] of [[-1.87, 2.9], [1.82, 2.95], [-5.1, 1.55], [5.15, 1.2]]) {
    disc(x!, 1.3, z!, 0.055, 1.0, palette.darkWood);
    block([0.35, 0.41, 0.35], [x!, 1.91, z!], palette.window, 0.06);
    block([0.44, 0.14, 0.44], [x!, 2.16, z!], palette.roof, 0.06);
  }
  for (const [x, z] of [[-2.25, 2.85], [2.28, 3.15], [-5.3, 0.8], [5.12, 2]]) {
    for (let i = 0; i < 3; i++) ball(x! + i * 0.14, 0.91 + i % 2 * 0.06, z!, [0.11, 0.11, 0.11], i % 2 ? palette.goldLight : palette.pink);
  }
  // Soft cloud puffs float outside the land; they stay still in calm mode.
  for (const [x, y, z, s] of [[-6.4, -0.7, -1.9, 0.7], [5.2, -1.35, 2.9, 0.72], [1.4, -2.5, -3.6, 0.62]]) {
    ball(x!, y!, z!, [s! * 1.5, s! * 0.45, s! * 0.7], palette.cloud);
    ball(x! + s! * 0.4, y! + s! * 0.28, z!, [s! * 0.6, s! * 0.5, s! * 0.6], palette.cloud);
  }

  // Batch static objects by material. Hundreds of small forms use ~22 draw calls.
  assembly.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  assembly.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (transformed.index) transformed.setIndex(transformed.index);
    const list = batches.get(object.material) || [];
    list.push(transformed);
    batches.set(object.material, list);
  });
  assembly.clear();
  for (const [surface, pieces] of batches) {
    // Geometries carry different UV/normal layouts; normalize to non-indexed data.
    const normalized = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece);
    const combined = mergeGeometries(normalized, false);
    if (combined) {
      keep(combined);
      const object = new THREE.Mesh(combined, surface);
      object.castShadow = true;
      object.receiveShadow = true;
      assembly.add(object);
    }
    for (const geometry of new Set([...pieces, ...normalized])) geometry.dispose();
  }

  const animatedCoins = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.14, 0.14, 0.065, 12)), palette.gold, 16);
  animatedCoins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  animatedCoins.frustumCulled = false;
  animatedCoins.visible = false;
  scene.add(animatedCoins);
  const confetti = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.045, 5, 4)), palette.goldLight, 18);
  confetti.frustumCulled = false;
  confetti.visible = false;
  scene.add(confetti);
  const dummy = new THREE.Object3D();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pointerDown: { x: number; y: number } | null = null;

  function effects(progress: number) {
    const branches = effectStep === 2 || effectStep === 3;
    animatedCoins.visible = true;
    for (let i = 0; i < 16; i++) {
      const phase = Math.min(1, Math.max(0, progress * 1.4 - i % 8 * 0.045));
      const t = phase * phase * (3 - 2 * phase);
      const side = i < 8 ? -1 : 1;
      if (effectStep === 0) { start.set((i % 4 - 1.5) * 0.28, 5.5 + i % 3 * 0.2, 2); end.set(0, 1.55, 1.65); }
      else { start.set(0, 1.55, 1.65); end.set(branches ? side * 3.5 : 0, effectStep === 2 ? 2.45 : 1.3, effectStep === 3 ? 2.7 : effectStep === 1 ? 0.1 : 1.6); }
      dummy.position.lerpVectors(start, end, t);
      dummy.position.y += Math.sin(t * Math.PI) * (branches ? 1.6 : 0.55);
      dummy.position.z += Math.sin(t * Math.PI) * (i % 3 - 1) * 0.12;
      dummy.rotation.set(Math.PI / 2 + progress * 4, progress * 2 + i, i * 0.4);
      dummy.scale.setScalar(phase === 0 || phase === 1 ? 0 : 0.85 + Math.sin(phase * Math.PI) * 0.2);
      dummy.updateMatrix();
      animatedCoins.setMatrixAt(i, dummy.matrix);
    }
    animatedCoins.instanceMatrix.needsUpdate = true;
    confetti.visible = options.mode === 'party' && effectStep === 3 && progress < 0.8;
    if (confetti.visible) {
      for (let i = 0; i < 18; i++) {
        const angle = i * 2.39996;
        const radius = progress * 2.3;
        dummy.position.set(Math.cos(angle) * radius + (i % 2 ? -3.5 : 3.5), 2 + Math.sin(progress * Math.PI) * 1.4 - progress, 1.6 + Math.sin(angle) * radius * 0.5);
        dummy.scale.setScalar(1 - progress);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    if (effectStep >= 0 && !options.reducedMotion) {
      if (now - lastFrame < 1000 / 30) { raf = requestAnimationFrame(frame); return; }
      lastFrame = now;
      const progress = Math.min(1, (now - effectStart) / 1550);
      effects(progress);
      if (progress < 1) raf = requestAnimationFrame(frame);
      else { effectStep = -1; animatedCoins.visible = false; confetti.visible = false; }
    }
    renderer.render(scene, camera);
  }
  function render() { if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(frame); }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    const halfWidth = aspect < 1.1 ? 8.75 : Math.max(8.2, 5.5 * aspect);
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.top = halfWidth / aspect; camera.bottom = -halfWidth / aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }
  function stopEffects() {
    effectStep = -1;
    animatedCoins.visible = false;
    confetti.visible = false;
    render();
  }
  function playStep(stepIndex: number, _saleSnapshot?: unknown) {
    stopEffects();
    if (disposed || options.reducedMotion || stepIndex < 0 || stepIndex > 3 || !Number.isInteger(stepIndex)) return;
    effectStep = stepIndex;
    effectStart = performance.now();
    render();
  }
  const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 9) { pointerDown = null; return; }
    pointerDown = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(selectors, false)[0];
    if (hit) options.onPerson(hit.object.userData.person as Person);
  };
  const onContextLost = (event: Event) => { event.preventDefault(); stopEffects(); options.onUnavailable(); };
  const onVisibility = () => { if (document.hidden) stopEffects(); else render(); };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  document.addEventListener('visibilitychange', onVisibility);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; if (visible) render(); else stopEffects(); });
  intersection.observe(host);
  resize();

  return {
    update(nextOptions) {
      options = { ...options, ...nextOptions };
      if (options.reducedMotion) stopEffects();
      render();
    },
    playStep,
    stopEffects,
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect(); intersection.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      invisible.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
