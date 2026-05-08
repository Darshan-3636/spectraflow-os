import { useSim } from "@/sim/store";

export function CPUSchematic() {
  const flash = useSim((s) => s.registerFlash);
  const cpu = useSim((s) => s.cpuLoadEMA);
  const cachePulse = useSim((s) => s.cachePulse);
  const cacheMiss = useSim((s) => s.cacheMiss);
  const ramPulse = useSim((s) => s.ramToCpuPulse);
  const regs = Array.from({ length: 8 });
  const cacheLines = ["L1", "L2", "L3"];
  const missColor = "oklch(0.7 0.27 25)";
  const hitColor = "oklch(0.85 0.18 200)";
  const cacheActive = cachePulse > 0.05;
  const cacheFill = cacheMiss > 0.05 ? missColor : (cacheActive ? hitColor : "transparent");
  return (
    <div className="panel relative p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="hud-label">CPU · Ryzen 7 5800H</span>
        <span className="hud-value" style={{ color: "var(--spark-amber)" }}>UTIL {(cpu * 100).toFixed(1)}%</span>
      </div>
      {/* CPU utilization bar */}
      <div className="mb-2 h-1.5 w-full bg-[color:oklch(1_0_0/0.06)] relative overflow-hidden">
        <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, cpu*100)}%`, background: "linear-gradient(90deg, var(--spark-cyan), var(--spark-amber))", boxShadow: "0 0 8px var(--spark-amber)" }} />
      </div>
      <svg viewBox="0 0 200 150" className="w-full">
        <rect x="2" y="2" width="196" height="146" fill="none" stroke="oklch(1 0 0 / 0.15)" />
        <text x="8" y="14" fill="oklch(0.7 0.02 250)" fontSize="7" fontFamily="monospace">REGISTERS</text>
        {regs.map((_, i) => {
          const active = flash && flash.reg === i;
          const x = 8 + (i % 4) * 46;
          const y = 22 + Math.floor(i / 4) * 22;
          return (
            <g key={i}>
              <rect x={x} y={y} width="42" height="18" fill={active ? "oklch(0.85 0.18 70)" : "transparent"} stroke="oklch(0.6 0.02 250 / 0.7)" />
              <text x={x + 4} y={y + 12} fontSize="8" fill={active ? "#000" : "oklch(0.8 0.02 250)"} fontFamily="monospace">R{i.toString().padStart(2,"0")}</text>
            </g>
          );
        })}
        <line x1="8" y1="74" x2="192" y2="74" stroke="oklch(1 0 0 / 0.2)" strokeDasharray="2 2" />
        <text x="8" y="84" fontSize="7" fill={cacheMiss>0.05?missColor:"oklch(0.7 0.02 250)"} fontFamily="monospace">
          CACHE {cacheMiss>0.05?"· MISS":"· L1/L2/L3"}
        </text>
        {/* L1/L2/L3 cache cells */}
        {cacheLines.map((lab, i) => {
          const x = 8 + i * 62;
          return (
            <g key={lab}>
              <rect x={x} y={90} width="58" height="20" fill={cacheFill} fillOpacity={Math.max(cachePulse, cacheMiss)} stroke={cacheMiss>0.05?missColor:"oklch(0.6 0.02 250 / 0.7)"} />
              <text x={x+6} y={103} fontSize="8" fill={cacheActive||cacheMiss>0.05?"#000":"oklch(0.8 0.02 250)"} fontFamily="monospace">{lab}</text>
            </g>
          );
        })}
        {/* RAM->CPU latency pulse */}
        <g opacity={ramPulse}>
          <line x1="8" y1="125" x2="192" y2="125" stroke={missColor} strokeDasharray="3 2" />
          <circle r="2.5" fill={missColor}>
            <animate attributeName="cx" from="192" to="8" dur="0.6s" repeatCount="indefinite" />
            <animate attributeName="cy" from="125" to="125" dur="0.6s" repeatCount="indefinite" />
          </circle>
          <text x="100" y="122" fontSize="6" fill={missColor} fontFamily="monospace" textAnchor="middle">RAM → CPU LATENCY</text>
        </g>
        {/* freq curve */}
        <polyline
          points={Array.from({ length: 40 }).map((_, i) => {
            const px = 8 + i * 4.6;
            const py = 142 - (Math.sin(i * 0.6 + Date.now()*0.001) * 0.5 + 0.5) * 8 - cpu * 4;
            return `${px},${py}`;
          }).join(" ")}
          fill="none" stroke="oklch(0.85 0.18 200)" strokeWidth="0.8" opacity="0.85"
        />
      </svg>
    </div>
  );
}

export function GPUSchematic() {
  const procs = Object.values(useSim((s) => s.processes));
  const gpu = Math.min(1, procs.reduce((a, p) => a + p.cpuLoad * 0.4, 0) / 6);
  return (
    <div className="panel relative p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="hud-label">GPU · RX 6600M</span>
        <span className="hud-value" style={{ color: "var(--spark-magenta)" }}>{(gpu * 100).toFixed(1)}%</span>
      </div>
      <svg viewBox="0 0 200 70" className="w-full">
        <rect x="2" y="2" width="196" height="66" fill="none" stroke="oklch(1 0 0 / 0.15)" />
        <text x="8" y="14" fill="oklch(0.7 0.02 250)" fontSize="7" fontFamily="monospace">28 CU · 8GB GDDR6</text>
        <rect x="8" y="22" width="184" height="6" fill="none" stroke="oklch(0.6 0.02 250 / 0.6)" />
        <rect x="8" y="22" width={184 * gpu} height="6" fill="oklch(0.7 0.30 330)" opacity="0.8" />
        <text x="8" y="44" fontSize="7" fill="oklch(0.7 0.02 250)" fontFamily="monospace">SHADER UNITS</text>
        <g>
          {Array.from({ length: 28 }).map((_, i) => (
            <rect key={i} x={8 + i * 6.6} y={48} width="5" height="14" fill={i / 28 < gpu ? "oklch(0.7 0.30 330)" : "transparent"} stroke="oklch(0.5 0.05 320 / 0.6)" />
          ))}
        </g>
      </svg>
    </div>
  );
}
