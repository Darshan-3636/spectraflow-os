import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSim } from "@/sim/store";

function GridFloor() {
  return (
    <gridHelper args={[40, 40, "#1a1a2a", "#101020"]} position={[0, -6, 0]} />
  );
}

function ProcessNode({ pid }: { pid: number }) {
  const proc = useSim((s) => s.processes[pid]);
  const groupRef = useRef<THREE.Group>(null);
  // generate a stable web of points and lines per process
  const { positions, lineGeom } = useMemo(() => {
    const n = 18 + (pid % 12);
    const pos: number[] = [];
    const r = 0.4 + ((pid * 13) % 5) * 0.06;
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const rr = r * (0.6 + Math.random() * 0.6);
      pos.push(rr * Math.sin(phi) * Math.cos(theta), rr * Math.sin(phi) * Math.sin(theta), rr * Math.cos(phi));
    }
    // connect each point to 2 nearest
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
    return { positions: new Float32Array(pos), lineGeom: lg };
  }, [pid]);

  useFrame(() => {
    if (!groupRef.current || !proc) return;
    groupRef.current.position.set(proc.x, proc.y, proc.z);
    groupRef.current.rotation.y += 0.003;
    groupRef.current.rotation.x += 0.001;
    const scale = 1 + proc.flare * 0.6 + proc.cpuLoad * 0.3;
    groupRef.current.scale.setScalar(scale);
  });

  if (!proc) return null;
  // color by state
  let color: string;
  if (proc.state === "fault") color = "#ff3a4a";
  else if (proc.state === "running") color = `hsl(${(proc.hue + 60) % 360}, 90%, 70%)`;
  else color = `hsl(${proc.hue}, 80%, 60%)`;
  const intensity = 0.6 + proc.flare * 1.4 + proc.cpuLoad * 0.6;

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.06} sizeAttenuation transparent opacity={Math.min(1, intensity)} />
      </points>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial color={color} transparent opacity={0.25 + proc.flare * 0.6} />
      </lineSegments>
    </group>
  );
}

function Spark() {
  const spark = useSim((s) => s.spark);
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

  return (
    <group>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[spark.x, spark.y, spark.z]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color="#9be8ff" transparent opacity={0.18} />
      </mesh>
      <primitive object={trailLine} />
    </group>
  );
}

function MigrationStreams() {
  // For each process whose pages are not yet fully in RAM, draw a faint stream from "disk" (-10, -6, 8) to its node.
  const procs = Object.values(useSim((s) => s.processes));
  return (
    <>
      {procs.map((p) => {
        if (p.framesAllocated.length === p.memoryPages) return null;
        const start = new THREE.Vector3(-10, -6, 8);
        const end = new THREE.Vector3(p.x, p.y, p.z);
        const points = [];
        const segs = 20;
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const v = start.clone().lerp(end, t);
          v.y += Math.sin(t * Math.PI) * 2;
          points.push(v);
        }
        const g = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: `hsl(${p.hue}, 80%, 60%)`, transparent: true, opacity: 0.25 });
        const line = new THREE.Line(g, mat);
        return <primitive key={p.pid} object={line} />;
      })}
    </>
  );
}

function CameraOrbit() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime() * 0.05;
    camera.position.x = Math.sin(t) * 14;
    camera.position.z = Math.cos(t) * 14;
    camera.position.y = 4 + Math.sin(t * 0.7) * 2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function ExecutionManifold() {
  const pids = Object.keys(useSim((s) => s.processes));
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [12, 4, 12], fov: 55 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#050510"]} />
        <fog attach="fog" args={["#050510", 12, 38]} />
        <ambientLight intensity={0.3} />
        <GridFloor />
        <CameraOrbit />
        <MigrationStreams />
        {pids.map((pid) => (
          <ProcessNode key={pid} pid={Number(pid)} />
        ))}
        <Spark />
      </Canvas>
    </div>
  );
}
