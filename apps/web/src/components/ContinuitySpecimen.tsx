import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createSceneController, SPECIMEN_BEATS } from "../lib/scene";

const CHAPTERS = [
  ["Observe", "Initial position", "Ten raw tokens. Ten economic shares at $100 each."],
  [
    "Attest",
    "Adjustment pending",
    "The 4:1 action docks. New exposure is gated while the event is pending.",
  ],
  [
    "Reconcile",
    "Units change. Value stays.",
    "Ten raw tokens represent forty economic shares at $25 each. Observed 4×; last verified 1×.",
  ],
  [
    "Protect",
    "Agreement restored",
    "Reconciliation verifies the 4× factor. The $1,000 boundary remains intact.",
  ],
] as const;

const chapterProgress = [0.06, 0.22, 0.62, 0.83];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const span = (p: number, from: number, to: number) => clamp((p - from) / (to - from));
const smooth = (n: number) => n * n * (3 - 2 * n);

/** A single lit object. Its ten ceramic holders never leave the constant-value frame. */
export function ContinuitySpecimen() {
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createSceneController> | null>(null);
  const currentChapter = useRef(0);
  const [chapter, setChapter] = useState(0);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const stage = mount.current;
    const root = host.current;
    if (!stage || !root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      root.dataset.motion = "reduced";
      setSupported(false);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setSupported(false);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    const ambient = new THREE.AmbientLight(0xfff5e1, 2.1);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffe7bb, 3.4);
    key.position.set(-3, 5, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdcead7, 1.2);
    fill.position.set(4, -2, 5);
    scene.add(fill);

    const instrument = new THREE.Group();
    scene.add(instrument);
    const ceramic = new THREE.MeshPhysicalMaterial({
      color: 0xf6ead2,
      roughness: 0.37,
      metalness: 0.02,
      clearcoat: 0.25,
    });
    const rim = new THREE.MeshStandardMaterial({
      color: 0x48503e,
      roughness: 0.43,
      metalness: 0.58,
    });
    const vermilion = new THREE.MeshStandardMaterial({
      color: 0xb83f28,
      roughness: 0.49,
      metalness: 0.06,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xb6a775,
      roughness: 0.31,
      metalness: 0.72,
    });
    const amber = new THREE.MeshStandardMaterial({
      color: 0xd6a143,
      roughness: 0.42,
      emissive: 0x4c2608,
    });
    const green = new THREE.MeshStandardMaterial({
      color: 0x417353,
      roughness: 0.42,
      metalness: 0.12,
    });
    const redTone = vermilion.color.clone();
    const amberTone = amber.color.clone();
    const greenTone = green.color.clone();
    const slipRed = vermilion.clone();
    const box = (
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    box(5.58, 3.2, 0.23, rim, instrument, 0, 0, -0.16);
    box(5.42, 3.04, 0.18, ceramic, instrument, 0, 0, -0.01);
    const holders: THREE.Group[] = [];
    const partitions: THREE.Mesh[][] = [];
    for (let i = 0; i < 10; i++) {
      const group = new THREE.Group();
      const col = i % 5;
      const row = Math.floor(i / 5);
      group.position.set((col - 2) * 1.02, (0.5 - row) * 1.42, 0.15);
      instrument.add(group);
      box(0.88, 1.25, 0.16, gold, group, 0, 0, 0);
      box(0.83, 1.2, 0.17, ceramic, group, 0, 0, 0.045);
      const cells: THREE.Mesh[] = [];
      for (let j = 0; j < 4; j++) {
        const cell = box(0.17, 0.88, 0.035, vermilion, group, (j - 1.5) * 0.19, 0, 0.15);
        cells.push(cell);
      }
      holders.push(group);
      partitions.push(cells);
    }
    const observed = box(4.85, 0.045, 0.07, amber, instrument, 0, 0.06, 0.3);
    const verified = box(4.85, 0.045, 0.07, gold, instrument, 0, -0.06, 0.3);
    const slip = new THREE.Group();
    instrument.add(slip);
    box(0.72, 0.96, 0.065, ceramic, slip);
    box(0.53, 0.065, 0.016, slipRed, slip, 0, 0.27, 0.047);
    box(0.53, 0.025, 0.016, gold, slip, 0, 0.08, 0.047);
    slip.position.set(-4.3, 2.2, 1.3);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xd6d5c4, roughness: 1 });
    const ground = box(7.1, 4.4, 0.06, groundMaterial, scene, 0, -0.13, -0.57);
    ground.castShadow = false;

    let inView = true;
    const visibility = new IntersectionObserver(
      ([entry]) => {
        inView = !!entry?.isIntersecting;
      },
      { rootMargin: "200px" },
    );
    visibility.observe(stage);
    const resize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    const draw = (p: number) => {
      const approach = smooth(span(p, SPECIMEN_BEATS.approach, SPECIMEN_BEATS.dock));
      const docking = smooth(span(p, SPECIMEN_BEATS.dock, SPECIMEN_BEATS.partition));
      const partition = smooth(span(p, SPECIMEN_BEATS.partition, SPECIMEN_BEATS.divergence));
      const mismatch = smooth(span(p, SPECIMEN_BEATS.divergence, SPECIMEN_BEATS.reconcile));
      const reconcile = smooth(span(p, SPECIMEN_BEATS.reconcile, SPECIMEN_BEATS.carry));
      const supported = smooth(span(p, 0.82, SPECIMEN_BEATS.carry));
      const carry = smooth(span(p, SPECIMEN_BEATS.carry, SPECIMEN_BEATS.end));
      camera.position.set(
        3.1 - 0.7 * approach + 0.55 * mismatch,
        2.2 - 0.25 * approach,
        11 - 1.7 * approach + 0.7 * mismatch,
      );
      camera.lookAt(0, 0, 0);
      instrument.rotation.y = -0.08 + 0.1 * approach - 0.09 * mismatch + 0.06 * reconcile;
      instrument.rotation.x = -0.12 + 0.04 * approach;
      holders.forEach((holder, i) => {
        holder.position.z = 0.15 + Math.sin(i * 1.6) * 0.035 * partition;
        holder.rotation.z = (i % 2 ? 1 : -1) * 0.008 * partition;
      });
      partitions.forEach((cells) =>
        cells.forEach((cell, j) => {
          cell.scale.x = 3.8 - 2.8 * partition;
          cell.position.x = (j - 1.5) * 0.19 * partition;
          cell.position.z = 0.15 + 0.045 * partition;
          cell.visible = partition > 0.02 || j === 0;
        }),
      );
      vermilion.color.copy(redTone).lerp(greenTone, supported);
      amber.color.copy(amberTone).lerp(greenTone, supported);
      slip.position.set(
        -4.3 + 4.3 * docking + 3.6 * carry,
        2.2 - 2.2 * docking + 0.8 * carry,
        1.3 - 0.77 * docking,
      );
      slip.rotation.z = -0.22 + 0.22 * docking - 0.35 * carry;
      observed.position.y = 0.06 + 0.2 * mismatch * (1 - reconcile);
      verified.position.y = -0.06 - 0.2 * mismatch * (1 - reconcile);
      root.dataset.beat =
        p < 0.12
          ? "approach"
          : p < 0.3
            ? "dock"
            : p < 0.55
              ? "partition"
              : p < 0.74
                ? "divergence"
                : p < 0.9
                  ? "reconcile"
                  : "carry";
      const nextChapter = p < 0.12 ? 0 : p < 0.3 ? 1 : p < 0.74 ? 2 : 3;
      if (nextChapter !== currentChapter.current) {
        currentChapter.current = nextChapter;
        setChapter(nextChapter);
      }
      root.style.setProperty("--guide", String(approach));
      root.style.setProperty("--dock", String(docking));
      root.style.setProperty("--partition", String(partition));
      root.style.setProperty("--mismatch", String(mismatch * (1 - reconcile)));
      root.style.setProperty("--reconciled", String(reconcile));
      root.style.setProperty(
        "--mismatch-label",
        String(mismatch * (1 - smooth(span(p, 0.8, 0.85)))),
      );
      root.style.setProperty("--supported-label", String(smooth(span(p, 0.85, 0.9))));
      if (inView) renderer.render(scene, camera);
    };
    controller.current = createSceneController(
      (root.closest(".editorial-hero") as HTMLElement) ?? root,
      draw,
      { scroll: innerWidth >= 900, intro: 0.1 },
    );
    draw(0);
    return () => {
      controller.current?.destroy();
      controller.current = null;
      visibility.disconnect();
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      [ceramic, rim, vermilion, slipRed, gold, amber, green, groundMaterial].forEach((material) =>
        material.dispose(),
      );
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const seek = (index: number) => {
    currentChapter.current = index;
    setChapter(index);
    controller.current?.seek(chapterProgress[index] ?? 0);
    if (host.current?.dataset.motion === "reduced") host.current.dataset.chapter = String(index);
  };
  return (
    <div
      ref={host}
      className="split-instrument specimen-instrument"
      data-chapter={chapter}
      data-beat="approach"
    >
      <div className="instrument-top">
        <span>FIG. 01 / ECONOMIC CONTINUITY</span>
        <span>10 RAW / $1,000 BOUNDARY</span>
      </div>
      <div
        className="specimen-stage"
        aria-label="Illustration of ten raw token holders partitioning into forty economic shares inside a fixed $1,000 value frame"
      >
        <div ref={mount} className="specimen-canvas" aria-hidden="true" />
        {!supported && (
          <div className="specimen-fallback" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        )}
        <svg
          className="specimen-guides"
          viewBox="0 0 600 420"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="specimen-guide-line" d="M57 51H543V365H57Z" />
          <path
            className="specimen-connector"
            d="M120 115C170 32 435 32 481 115M120 306C170 389 435 389 481 306"
          />
          <path className="specimen-rail-path" d="M66 210H534" />
        </svg>
        <span className="specimen-label specimen-label-value">CONSTANT VALUE / $1,000</span>
        <span className="specimen-label specimen-label-raw">10 RAW HOLDERS</span>
        <span className="specimen-label specimen-label-units">10 → 40 ECONOMIC SHARES</span>
        <span className="specimen-label specimen-label-rails">OBSERVED 4× / VERIFIED 1×</span>
        <span className="specimen-label specimen-label-slip">4:1 ACTION</span>
        <span className="specimen-label specimen-label-supported">VERIFIED / SUPPORTED</span>
      </div>
      <div className="instrument-readout">
        <div>
          <span className="micro-label">Collateral value</span>
          <strong>
            $1,000<span>.00</span>
          </strong>
        </div>
        <span className="preserved-label">
          <span /> VALUE PRESERVED
        </span>
      </div>
      <div className="instrument-control">
        <div className="split-switch" role="group" aria-label="Illustrate a stock split">
          <button aria-pressed={chapter < 2} onClick={() => seek(0)}>
            Before split <span>1:1</span>
          </button>
          <button aria-pressed={chapter >= 2} onClick={() => seek(2)}>
            After split <span>4:1</span>
          </button>
        </div>
        <span className="instrument-equation">{chapter >= 2 ? "40 × $25" : "10 × $100"}</span>
      </div>
      <div className="chapter-controls" role="group" aria-label="Continuity chapters">
        {CHAPTERS.map(([label], i) => (
          <button key={label} aria-pressed={chapter === i} onClick={() => seek(i)}>
            <span>0{i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="chapter-caption" aria-live="polite">
        <strong>{CHAPTERS[chapter]?.[1]}</strong>
        <p>{CHAPTERS[chapter]?.[2]}</p>
      </div>
      <div className="instrument-disclaimer">
        Illustrative only · USD per economic share. Never multiply a price already normalized per
        raw token. Controls send no transactions.
      </div>
    </div>
  );
}
