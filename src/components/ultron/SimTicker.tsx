import { useEffect, useRef } from "react";
import { useSim } from "@/sim/store";

export function SimTicker() {
  const tick = useSim((s) => s.tick);
  const last = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      if (last.current == null) last.current = t;
      const dt = Math.min(0.1, (t - last.current) / 1000);
      last.current = t;
      tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);
  return null;
}
