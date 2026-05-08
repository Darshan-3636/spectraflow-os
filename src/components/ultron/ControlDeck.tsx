import { useSim, type FaultKind } from "@/sim/store";
import { useEffect, useRef, useState } from "react";

export function Terminal() {
  const logs = useSim((s) => s.logs);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);
  return (
    <div className="panel relative p-3 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <span className="hud-label">Command Terminal · /var/log/ultron</span>
        <span className="hud-value flicker" style={{ color: "var(--spark-cyan)" }}>● LIVE</span>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto pr-1 space-y-[2px]">
        {logs.map((l, i) => (
          <div key={i} className="terminal-line">
            <span className="t">{l.t.toFixed(2)}s</span>{" "}
            <span className={l.kind === "err" ? "e" : l.kind === "warn" ? "w" : ""}>{l.msg}</span>
          </div>
        ))}
        {logs.length === 0 && <div className="terminal-line opacity-60">awaiting kernel events…</div>}
      </div>
    </div>
  );
}

export function ControlDeck() {
  const clock = useSim((s) => s.clockMultiplier);
  const dilation = useSim((s) => s.timeDilation);
  const execSpeed = useSim((s) => s.executionSpeed);
  const decayRate = useSim((s) => s.decayRate);
  const running = useSim((s) => s.running);
  const setClock = useSim((s) => s.setClock);
  const setDilation = useSim((s) => s.setDilation);
  const setExecSpeed = useSim((s) => s.setExecutionSpeed);
  const setDecayRate = useSim((s) => s.setDecayRate);
  const setRunning = useSim((s) => s.setRunning);
  const simulateFault = useSim((s) => s.simulateFault);
  const reset = useSim((s) => s.reset);
  const simTime = useSim((s) => s.simTime);
  const faults = useSim((s) => s.faultsTotal);
  const io = useSim((s) => s.ioTotal);
  const [fault, setFault] = useState<FaultKind>("page");

  const FAULTS: { v: FaultKind; label: string }[] = [
    { v: "page", label: "Page Fault" },
    { v: "cache_miss", label: "Cache Miss" },
    { v: "segfault", label: "Segmentation Fault" },
    { v: "stack_overflow", label: "Stack Overflow" },
    { v: "div_by_zero", label: "Div-by-Zero Trap" },
    { v: "deadlock", label: "Deadlock" },
  ];

  return (
    <div className="panel relative p-3 h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="hud-label">Control Deck · ALL COMMANDS</span>
        <div className="flex gap-3 text-[10px] text-[color:var(--hud-dim)]">
          <span>T <span className="hud-value">{simTime.toFixed(2)}s</span></span>
          <span>FAULTS <span className="hud-value" style={{color:"var(--spark-red)"}}>{faults}</span></span>
          <span>I/O <span className="hud-value" style={{color:"var(--spark-blue)"}}>{io}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="flex flex-col gap-2 overflow-y-auto pr-2 min-h-0">
          <label className="hud-label">Clock Speed × {clock.toFixed(2)}</label>
          <input className="ult" type="range" min={0.25} max={4} step={0.05} value={clock} onChange={(e) => setClock(parseFloat(e.target.value))} />
          <label className="hud-label">Time Dilation × {dilation.toFixed(2)}</label>
          <input className="ult" type="range" min={0.1} max={2} step={0.05} value={dilation} onChange={(e) => setDilation(parseFloat(e.target.value))} />
          <label className="hud-label">Execution Speed · {execSpeed.toFixed(1)} u/s</label>
          <input className="ult" type="range" min={1} max={30} step={0.5} value={execSpeed} onChange={(e) => setExecSpeed(parseFloat(e.target.value))} />
          <label className="hud-label">Decay Rate · {decayRate.toFixed(2)} /s · life {(1/Math.max(0.05,decayRate)).toFixed(1)}s</label>
          <input className="ult" type="range" min={0.1} max={3} step={0.05} value={decayRate} onChange={(e) => setDecayRate(parseFloat(e.target.value))} />
        </div>
        <div className="flex flex-col gap-2 justify-center">
          <button onClick={() => setRunning(!running)} className="text-[11px] tracking-[0.2em] uppercase border border-[color:var(--grid-line)] py-2 hover:bg-[color:oklch(1_0_0/0.04)]" style={{ color: running ? "var(--spark-cyan)" : "var(--spark-amber)" }}>
            {running ? "■ pause" : "▶ resume"}
          </button>
          <label className="hud-label">Fault Type</label>
          <select
            value={fault}
            onChange={(e) => setFault(e.target.value as FaultKind)}
            className="bg-transparent text-[11px] tracking-[0.15em] uppercase border border-[color:var(--grid-line)] py-2 px-2 text-[color:var(--hud-text)]"
          >
            {FAULTS.map((f) => (
              <option key={f.v} value={f.v} style={{ background: "#0a0d14" }}>{f.label}</option>
            ))}
          </select>
          <button
            onClick={() => simulateFault(fault)}
            className="text-[11px] tracking-[0.2em] uppercase border border-[color:var(--grid-line)] py-2 hover:bg-[color:oklch(1_0_0/0.04)]"
            style={{ color: "var(--spark-red)" }}
          >
            ⚠ simulate fault
          </button>
          <button onClick={reset} className="text-[11px] tracking-[0.2em] uppercase border border-[color:var(--grid-line)] py-2 hover:bg-[color:oklch(1_0_0/0.04)]" style={{ color: "var(--spark-red)" }}>
            ⟲ reset kernel
          </button>
        </div>
        <div className="flex flex-col gap-1 text-[10px] text-[color:var(--hud-dim)] justify-center">
          <div>TRAJECTORY LOOP</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full" style={{background:"var(--spark-cyan)"}}/> execution line · spawns nodes on impact</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full" style={{background:"var(--spark-magenta)"}}/> nodes fade by decay rate</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full" style={{background:"var(--spark-amber)"}}/> cache pulses every spawn</div>
          <div className="mt-2 opacity-70">Scheduler: priority round-robin</div>
        </div>
      </div>
    </div>
  );
}
