import { createFileRoute } from "@tanstack/react-router";
import { SimTicker } from "@/components/ultron/SimTicker";
import { MemoryPane } from "@/components/ultron/MemoryPane";
import { ExecutionManifold } from "@/components/ultron/ExecutionManifold";
import { ToneMap, PCAWaveform } from "@/components/ultron/Analytics";
import { CPUSchematic, GPUSchematic } from "@/components/ultron/Schematics";
import { Terminal, ControlDeck } from "@/components/ultron/ControlDeck";

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
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col text-[color:var(--hud-text)]" style={{ background: "var(--void)" }}>
      <SimTicker />
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--grid-line)]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[13px] tracking-[0.4em] uppercase glow-text" style={{ color: "var(--spark-cyan)" }}>Ultron-OS</h1>
          <span className="hud-label">Spectral OS Manifold · v3.0</span>
        </div>
        <div className="flex gap-4 hud-label">
          <span>CQT CHROMA MODEL</span>
          <span>·</span>
          <span>MICROTONE DOMAIN</span>
          <span>·</span>
          <span style={{ color: "var(--spark-cyan)" }}>● ONLINE</span>
        </div>
      </header>

      {/* Main grid */}
      <main className="flex-1 grid grid-cols-[260px_1fr_280px] gap-3 p-3 min-h-0">
        <section className="min-h-0"><MemoryPane /></section>
        <section className="relative panel min-h-0 overflow-hidden">
          <ExecutionManifold />
          <div className="absolute top-3 left-3 hud-label">3D Execution Space · Process Manifold</div>
          <div className="absolute top-3 right-3 hud-label">PRIORITY ↑ · CPU SPARK</div>
          <div className="absolute bottom-3 left-3 hud-label opacity-60">drift orbit · auto</div>
        </section>
        <section className="flex flex-col gap-3 min-h-0">
          <CPUSchematic />
          <GPUSchematic />
          <div className="panel relative p-3 flex-1 min-h-[120px] flex flex-col">
            <div className="hud-label mb-1">Tone Map · Page→Frame</div>
            <div className="flex-1 min-h-0"><ToneMap /></div>
          </div>
          <div className="panel relative p-3 flex-1 min-h-[120px] flex flex-col">
            <div className="hud-label mb-1">PCA Coordinates · CPU/Faults/IO</div>
            <div className="flex-1 min-h-0"><PCAWaveform /></div>
          </div>
        </section>
      </main>

      {/* Bottom */}
      <footer className="grid grid-cols-[1fr_420px] gap-3 p-3 pt-0 h-[210px]">
        <Terminal />
        <ControlDeck />
      </footer>
    </div>
  );
}
