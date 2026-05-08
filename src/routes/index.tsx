import { createFileRoute } from "@tanstack/react-router";
import { SimTicker } from "@/components/ultron/SimTicker";
import { MemoryPane } from "@/components/ultron/MemoryPane";
import { ExecutionManifold } from "@/components/ultron/ExecutionManifold";
import { ToneMap, PCAWaveform, FaultsWaveform } from "@/components/ultron/Analytics";
import { CPUSchematic, GPUSchematic } from "@/components/ultron/Schematics";
import { Terminal, ControlDeck } from "@/components/ultron/ControlDeck";
import { useSim } from "@/sim/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ultron-OS · Spectral Operating System Simulator" },
      { name: "description", content: "Browser-based 3D simulator visualizing OS scheduling, paging and context switching as a spectral manifold." },
    ],
  }),
  component: Index,
});

function Index() {
  const cpu = useSim((s) => s.cpuLoadEMA);
  const faults = useSim((s) => s.faultsTotal);
  const io = useSim((s) => s.ioTotal);
  const procCount = Object.keys(useSim((s) => s.processes)).length;
  const cacheMiss = useSim((s) => s.cacheMiss);
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col text-[color:var(--hud-text)]" style={{ background: "var(--void)" }}>
      <SimTicker />
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--grid-line)]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[13px] tracking-[0.4em] uppercase glow-text" style={{ color: "var(--spark-cyan)" }}>Ultron-OS</h1>
          <span className="hud-label">Spectral OS Manifold · v3.0</span>
        </div>
        <div className="flex items-center gap-5 hud-label">
          <span>CPU UTIL <span className="hud-value" style={{ color: "var(--spark-amber)" }}>{(cpu * 100).toFixed(1)}%</span></span>
          <span>RAM <span className="hud-value" style={{ color: "var(--spark-cyan)" }}>16 GB</span></span>
          <span>DISK <span className="hud-value" style={{ color: "var(--spark-magenta)" }}>1 TB</span></span>
          <span>PROC <span className="hud-value">{procCount}</span></span>
          <span>FAULTS <span className="hud-value" style={{ color: "var(--spark-red)" }}>{faults}</span></span>
          <span>I/O <span className="hud-value" style={{ color: "var(--spark-blue)" }}>{io}</span></span>
          <span style={{ color: cacheMiss > 0.1 ? "var(--spark-red)" : "var(--spark-cyan)" }}>● {cacheMiss > 0.1 ? "CACHE MISS" : "ONLINE"}</span>
        </div>
      </header>

      {/* Main grid — right column spans full height down through footer area */}
      <main className="flex-1 grid grid-cols-[260px_1fr_300px] grid-rows-[1fr_210px] gap-3 p-3 min-h-0">
        <section className="min-h-0 row-span-1"><MemoryPane /></section>
        <section className="relative panel min-h-0 overflow-hidden row-span-1">
          <ExecutionManifold />
          <div className="absolute top-3 left-3 hud-label">3D Execution Space · Process Manifold</div>
          <div className="absolute top-3 right-3 hud-label">Y · PRIORITY  Z · CPU FOOTPRINT</div>
          <div className="absolute bottom-3 left-3 hud-label opacity-70">← TIME FLOW (X axis)</div>
          <div className="absolute bottom-3 right-3 hud-label opacity-70">DISK ◌  →  PAGE  →  RAM ▦</div>
        </section>
        <section className="flex flex-col gap-3 min-h-0 row-span-2">
          <CPUSchematic />
          <GPUSchematic />
          <div className="panel relative p-2 flex-1 min-h-[80px] flex flex-col">
            <div className="hud-label mb-1">Tone Map · Page→Frame</div>
            <div className="flex-1 min-h-0"><ToneMap /></div>
          </div>
          <div className="panel relative p-2 flex-1 min-h-[80px] flex flex-col">
            <div className="hud-label mb-1" style={{color:"var(--spark-red)"}}>PCA · CPU (red) / IO (blue)</div>
            <div className="flex-1 min-h-0"><PCAWaveform /></div>
          </div>
          <div className="panel relative p-2 flex-1 min-h-[80px] flex flex-col">
            <div className="hud-label mb-1" style={{color:"#55ff99"}}>Fault Counter · cumulative</div>
            <div className="flex-1 min-h-0"><FaultsWaveform /></div>
          </div>
        </section>
        <section className="min-h-0"><Terminal /></section>
        <section className="min-h-0"><ControlDeck /></section>
      </main>
    </div>
  );
}
