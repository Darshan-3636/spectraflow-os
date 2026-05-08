import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSim, SIM_CONST } from "@/sim/store";

const DISK_POS = new THREE.Vector3(-11, -5, 7);
const RAM_POS = new THREE.Vector3(11, -5, -7);

function GridFloor() {
  return (
    <gridHelper args={[60, 60, "#1a2030", "#0c1018"]} position={[0, -7, 0]} />
  );
}

function DiskAnchor() {
  return (
    <group position={DISK_POS.toArray()}>
      <mesh>
        <cylinderGeometry args={[1.2, 1.2, 0.6, 32, 1, true]} />
        <meshBasicMaterial color="#7a3aa0" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 1.2, 32]} />
        <meshBasicMaterial color="#b07acc" wireframe transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function RamAnchor() {
  // 8x8 grid front face hint
  const lines = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = -0.9 + (i / 8) * 1.8;
      pts.push(t, -0.9, 0, t, 0.9, 0);
      pts.push(-0.9, t, 0, 0.9, t, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group position={RAM_POS.toArray()}>
      <mesh>
        <boxGeometry args={[1.8, 1.8, 1.8]} />
        <meshBasicMaterial color="#3aa0ff" wireframe transparent opacity={0.5} />
      </mesh>
      <lineSegments geometry={lines} position={[0, 0, 0.91]}>
        <lineBasicMaterial color="#9be8ff" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

function frameLocalOffset(frame: number) {
  // 8x8x1 face mapping inside RAM cube
  const col = frame % 8;
  const row = Math.floor(frame / 8) % 8;
  const x = -0.8 + (col / 7) * 1.6;
  const y = -0.8 + (row / 7) * 1.6;
  return new THREE.Vector3(x, y, 0.9);
}

function ProcessNode({ pid }: { pid: number }) {
  const proc = useSim((s) => s.processes[pid]);
  const groupRef = useRef<THREE.Group>(null);
  const { positions, lineGeom, ringGeom } = useMemo(() => {
    const n = 22 + (pid % 14);
    const pos: number[] = [];
    const r = 0.45 + ((pid * 13) % 5) * 0.06;
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const rr = r * (0.55 + Math.random() * 0.7);
      pos.push(rr * Math.sin(phi) * Math.cos(theta), rr * Math.sin(phi) * Math.sin(theta), rr * Math.cos(phi));
    }
    const lines: number[] = [];
    for (let i = 0; i < n; i++) {
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = pos[i*3] - pos[j*3], dy = pos[i*3+1] - pos[j*3+1], dz = pos[i*3+2] - pos[j*3+2];
        dists.push({ j, d: dx*dx+dy*dy+dz*dz });
      }
      dists.sort((a,b)=>a.d-b.d);
      for (let k = 0; k < 2; k++) {
        const j = dists[k].j;
        lines.push(pos[i*3], pos[i*3+1], pos[i*3+2], pos[j*3], pos[j*3+1], pos[j*3+2]);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    // equator ring
    const ring: number[] = [];
    const segs = 48;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      ring.push(Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(ring, 3));
    return { positions: new Float32Array(pos), lineGeom: lg, ringGeom: rg };
  }, [pid]);

  useFrame((_, dt) => {
    if (!groupRef.current || !proc) return;
    groupRef.current.position.set(proc.x, proc.y, proc.z);
    groupRef.current.rotation.y += dt * 0.4;
    groupRef.current.rotation.x += dt * 0.15;
    const scale = 1 + proc.flare * 0.5 + proc.cpuLoad * 0.25;
    groupRef.current.scale.setScalar(scale);
  });

  if (!proc) return null;
  let color: string;
  if (proc.state === "fault") color = "#ff3a4a";
  else if (proc.state === "running") color = `hsl(${(proc.hue + 50) % 360}, 95%, 72%)`;
  else color = `hsl(${proc.hue}, 80%, 65%)`;
  const op = proc.opacity;
  const intensity = (0.7 + proc.flare * 1.4 + proc.cpuLoad * 0.6) * op;

  return (
    <group ref={groupRef}>
      {/* core glow sphere */}
      <mesh>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={Math.min(1, 0.55 * op + proc.flare * 0.4)} />
      </mesh>
      {/* halo */}
      <mesh>
        <sphereGeometry args={[0.45 + proc.cpuLoad * 0.25, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.08 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* point cloud */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.07} sizeAttenuation transparent opacity={Math.min(1, intensity)} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      {/* web */}
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial color={color} transparent opacity={(0.22 + proc.flare * 0.5) * op} />
      </lineSegments>
      {/* equator ring */}
      <line>
        <primitive object={ringGeom} attach="geometry" />
        <lineBasicMaterial color={color} transparent opacity={(0.35 + proc.cpuLoad * 0.4) * op} />
      </line>
    </group>
  );
}

function HistoryTrails() {
  const procs = Object.values(useSim((s) => s.processes));
  return (
    <>
      {procs.map((p) => {
        if (!p.history || p.history.length < 2) return null;
        // include current position as the leading point
        const pts = p.history.map((h) => new THREE.Vector3(h.x, h.y, h.z));
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const colorsArr = new Float32Array(pts.length * 3);
        const c = new THREE.Color(`hsl(${p.hue}, 85%, 65%)`);
        for (let i = 0; i < pts.length; i++) {
          // newer (end) brighter, older fades
          const f = i / (pts.length - 1);
          colorsArr[i*3] = c.r * f;
          colorsArr[i*3+1] = c.g * f;
          colorsArr[i*3+2] = c.b * f;
        }
        g.setAttribute("color", new THREE.Float32BufferAttribute(colorsArr, 3));
        const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 * p.opacity });
        const line = new THREE.Line(g, mat);
        return <primitive key={p.pid} object={line} />;
      })}
    </>
  );
}

function PageMigrations() {
  const migs = useSim((s) => s.pageMigrations);
  return (
    <>
      {migs.map((m) => {
        const t = Math.max(0, Math.min(1, m.t));
        // Phase A (0..0.5): cluster moves from disk toward midpoint as one packet
        // Phase B (0.5..1): packet shatters; each page goes to its own frame slot
        const start = DISK_POS.clone();
        const frameOff = frameLocalOffset(m.frame);
        const end = RAM_POS.clone().add(frameOff);
        const mid = start.clone().lerp(end, 0.5);
        mid.y += 3.5; // arc
        let pos: THREE.Vector3;
        if (t < 0.5) {
          // packet path along arc to mid
          const u = t / 0.5;
          const a = start.clone().lerp(mid, u);
          // small wobble so it reads as a "cluster"
          a.y += Math.sin(u * Math.PI) * 0.4;
          pos = a;
        } else {
          const u = (t - 0.5) / 0.5;
          pos = mid.clone().lerp(end, u);
        }
        const color = `hsl(${m.hue}, 90%, 70%)`;
        const isShattered = t >= 0.5;
        const size = isShattered ? 0.10 : 0.16;
        const opacity = t < 0 ? 0 : (t > 1 ? Math.max(0, 1 - (t - 1) * 6) : 1);
        return (
          <group key={m.id} position={pos.toArray()}>
            <mesh>
              <sphereGeometry args={[size, 10, 10]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} />
            </mesh>
            <mesh>
              <sphereGeometry args={[size * 2.4, 12, 12]} />
              <meshBasicMaterial color={color} transparent opacity={opacity * 0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Spark() {
  const spark = useSim((s) => s.spark);
  const pending = useSim((s) => s.pendingSwitch);
  const dotRef = useRef<THREE.Mesh>(null);
  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    return g;
  }, []);
  const trailMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#9be8ff", transparent: true, opacity: 0.7 }), []);
  const trailLine = useMemo(() => new THREE.Line(trailGeom, trailMat), [trailGeom, trailMat]);

  useFrame(() => {
    if (!dotRef.current) return;
    dotRef.current.position.set(spark.x, spark.y, spark.z);
    const arr = trailGeom.attributes.position.array as Float32Array;
    const trail = spark.trail;
    for (let i = 0; i < 60; i++) {
      const t = trail[i] || trail[trail.length - 1] || { x: spark.x, y: spark.y, z: spark.z };
      arr[i*3] = t.x; arr[i*3+1] = t.y; arr[i*3+2] = t.z;
    }
    trailGeom.attributes.position.needsUpdate = true;
  });

  const dim = pending ? 0.4 : 1;
  return (
    <group>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={dim} />
      </mesh>
      <mesh position={[spark.x, spark.y, spark.z]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color="#9be8ff" transparent opacity={0.18 * dim} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <primitive object={trailLine} />
    </group>
  );
}

function CameraOrbit() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime() * 0.04;
    camera.position.x = Math.sin(t) * 16;
    camera.position.z = Math.cos(t) * 16;
    camera.position.y = 5 + Math.sin(t * 0.7) * 2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function TimeAxisLabel() {
  // a faint arrow line along x to communicate time direction
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([10, -6.5, 9, -10, -6.5, 9], 3));
    return g;
  }, []);
  return (
    <line>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color="#3a4a66" transparent opacity={0.5} />
    </line>
  );
}

export function ExecutionManifold() {
  const pids = Object.keys(useSim((s) => s.processes));
  // suppress unused const warning
  void SIM_CONST;
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [14, 5, 14], fov: 55 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#050510"]} />
        <fog attach="fog" args={["#050510", 14, 42]} />
        <ambientLight intensity={0.35} />
        <GridFloor />
        <CameraOrbit />
        <TimeAxisLabel />
        <DiskAnchor />
        <RamAnchor />
        <HistoryTrails />
        <PageMigrations />
        {pids.map((pid) => (
          <ProcessNode key={pid} pid={Number(pid)} />
        ))}
        <Spark />
      </Canvas>
    </div>
  );
}
