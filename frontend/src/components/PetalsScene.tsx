/** Transparent 3D layer of drifting rose petals for the photo hero. */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function Petals({ count, animate, spread = 7, size = 1, color = '#efb9c7', opacity = 0.9 }: { count: number; animate: boolean; spread?: number; size?: number; color?: string; opacity?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * spread,
        y: Math.random() * 6 - 2,
        z: (Math.random() - 0.5) * 3 + 0.5,
        speed: 0.12 + Math.random() * 0.18,
        spin: Math.random() * Math.PI * 2,
        drift: Math.random() * 2,
      })),
    [count],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const frame = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    if (!animate && frame.current > 0) return;
    frame.current++;
    const step = Math.min(dt, 0.05);
    data.forEach((p, i) => {
      p.y -= p.speed * step;
      p.spin += step * 0.8;
      if (p.y < -3) {
        p.y = 3.4;
        p.x = (Math.random() - 0.5) * spread;
      }
      dummy.position.set(p.x + Math.sin(p.y * 1.3 + p.drift) * 0.3, p.y, p.z);
      dummy.rotation.set(p.spin, p.spin * 0.6, p.spin * 0.3);
      dummy.scale.set(0.075 * size, 0.03 * size, 0.05 * size);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.6} transparent opacity={opacity} />
    </instancedMesh>
  );
}

export default function PetalsScene({ count = 30, animate = true, onReady }: { count?: number; animate?: boolean; onReady?: () => void }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.4, 6], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      frameloop={animate ? 'always' : 'demand'}
      onCreated={() => onReady?.()}
      aria-hidden
    >
      <ambientLight intensity={0.9} color="#fff3ea" />
      <directionalLight position={[3, 5, 4]} intensity={1.4} color="#fff1e4" />
      <Petals count={count} animate={animate} spread={12} size={0.85} color="#f8cdd8" opacity={0.7} />
    </Canvas>
  );
}
