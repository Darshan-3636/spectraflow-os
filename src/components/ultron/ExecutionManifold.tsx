import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSim } from "@/sim/store";

function GridFloor() {
  return <gridHelper args={[60, 60, "#141a26", "#0a0d14"]} position={[0, -7, 0]} />;
}

function TrajSegments() {
  const segs = useSim((s) => s.trajSegments);
  return (
    <>
      {segs.map((sg, i) => {
        const t = Math.min(1, sg.age / sg.life);
        const opacity = (1 - t) * 0.85;
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(sg.ax, sg.ay, sg.az),
          new THREE.Vector3(sg.bx, sg.by, sg.bz),
        ]);
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color(`hsl(${sg.hue}, 90%, 70%)`),
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        return <primitive key={i} object={new THREE.Line(g, mat)} />;
      })}
    </>
  );
}

function TrajNodes() {
  const nodes = useSim((s) => s.trajNodes);
  const head = useSim((s) => s.trajHead);
  const execSpeed = useSim((s) => s.executionSpeed);
  return (
    <>
      {nodes.map((n) => {
        const t = Math.min(1, n.age / n.life);
        const isFault = !!n.faultKind;
        const isPending = !!n.pendingVisit;
        // Pending nodes ramp opacity up as the head closes in.
        let op: number;
        if (isPending) {
          const dx = n.x - head.x, dy = n.y - head.y, dz = n.z - head.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          const tta = dist / Math.max(0.01, execSpeed); // seconds until arrival
          // start faint very early, grow as it gets closer
          op = Math.max(0.18, Math.min(0.9, 1 - tta / 6));
        } else {
          op = 1 - t;
        }
        const color = isFault ? "#ff3355" : `hsl(${n.hue}, 95%, 70%)`;
        const pulse = isFault ? 1 + Math.sin(n.age * 14) * 0.35
          : isPending ? 0.7 + Math.sin(n.age * 6) * 0.1
          : 1 + Math.min(0.4, n.visits * 0.15);
        return (
          <group key={n.id} position={[n.x, n.y, n.z]}>
            <mesh>
              <sphereGeometry args={[0.12 * pulse, 18, 18]} />
              <meshBasicMaterial color={color} transparent opacity={op} wireframe={isPending} />
            </mesh>
            <mesh>
              <sphereGeometry args={[(isFault ? 0.7 : 0.32) * pulse, 22, 22]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={op * (isFault ? 0.45 : 0.25)}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {n.visits > 1 && !isFault && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.22, 0.26, 32]} />
                <meshBasicMaterial color={color} transparent opacity={op * 0.6} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
              </mesh>
            )}
            {isFault && (
              <>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.6 + n.age * 1.4, 0.7 + n.age * 1.4, 48]} />
                  <meshBasicMaterial color={color} transparent opacity={op * 0.8} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <ringGeometry args={[0.4 + n.age * 0.9, 0.48 + n.age * 0.9, 48]} />
                  <meshBasicMaterial color={color} transparent opacity={op * 0.55} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
              </>
            )}
            <Html
              center
              distanceFactor={9}
              style={{
                pointerEvents: "none",
                fontFamily: "ui-monospace, monospace",
                fontSize: isFault ? 11 : 10,
                letterSpacing: "0.12em",
                color,
                opacity: op,
                textShadow: `0 0 6px ${color}`,
                whiteSpace: "nowrap",
                transform: "translate(14px, -12px)",
                fontWeight: isFault ? 700 : 400,
              }}
            >
              {isFault
                ? `⚠ ${n.faultKind?.toUpperCase()} · #${n.id}`
                : isPending
                  ? `⊙ QUEUED · #${n.id}`
                  : `ID: ${n.id}${n.visits > 1 ? ` ×${n.visits}` : ""}`}
            </Html>
          </group>
        );
      })}
    </>
  );
}

function ExecutionLine() {
  const head = useSim((s) => s.trajHead);
  const prev = useSim((s) => s.trajPrevTarget);
  const headRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (headRef.current) headRef.current.position.set(head.x, head.y, head.z);
    if (haloRef.current) haloRef.current.position.set(head.x, head.y, head.z);
  });

  const beam = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(prev.x, prev.y, prev.z),
      new THREE.Vector3(head.x, head.y, head.z),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: "#9be8ff",
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Line(g, mat);
  }, [prev.x, prev.y, prev.z, head.x, head.y, head.z]);

  return (
    <group>
      <primitive object={beam} />
      <mesh ref={headRef}>
        <sphereGeometry args={[0.16, 18, 18]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.55, 22, 22]} />
        <meshBasicMaterial
          color="#9be8ff"
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CameraOrbit() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime() * 0.04;
    camera.position.x = Math.sin(t) * 18;
    camera.position.z = Math.cos(t) * 18;
    camera.position.y = 4 + Math.sin(t * 0.7) * 2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function ExecutionManifold() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [16, 5, 16], fov: 55 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#040409"]} />
        <fog attach="fog" args={["#040409", 18, 50]} />
        <ambientLight intensity={0.3} />
        <GridFloor />
        <CameraOrbit />
        <TrajSegments />
        <TrajNodes />
        <ExecutionLine />
      </Canvas>
    </div>
  );
}