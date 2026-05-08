import { useSim, SIM_CONST } from "@/sim/store";
import { useMemo } from "react";

export function MemoryPane() {
  const processes = useSim((s) => s.processes);
  const freeFrames = useSim((s) => s.freeFrames);
  const freeDisk = useSim((s) => s.freeDiskBlocks);

  const usedFrames = SIM_CONST.TOTAL_FRAMES - freeFrames.length;
  const usedDisk = SIM_CONST.TOTAL_DISK_BLOCKS - freeDisk.length;

  // RAM grid: 8x8 = 64 frames; color by owning process hue
  const frameOwner = useMemo(() => {
    const map = new Array<number | null>(SIM_CONST.TOTAL_FRAMES).fill(null);
    for (const p of Object.values(processes)) {
      for (const f of p.framesAllocated) map[f] = p.pid;
    }
    return map;
  }, [processes]);

  const diskOwner = useMemo(() => {
    const map = new Array<number | null>(SIM_CONST.TOTAL_DISK_BLOCKS).fill(null);
    for (const p of Object.values(processes)) {
      for (const b of p.diskBlocks) map[b] = p.pid;
    }
    return map;
  }, [processes]);

  const procColor = (pid: number | null) => {
    if (pid == null) return "transparent";
    const p = processes[pid];
    if (!p) return "transparent";
    return `oklch(0.75 0.2 ${p.hue})`;
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* RAM */}
      <div className="panel relative p-3 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="hud-label">Main Memory · RAM</span>
          <span className="hud-value" style={{ color: "var(--spark-cyan)" }}>{usedFrames}/{SIM_CONST.TOTAL_FRAMES}</span>
        </div>
        <div className="text-[9px] text-[color:var(--hud-dim)] mb-2">USAGE {((usedFrames / SIM_CONST.TOTAL_FRAMES) * 100).toFixed(1)}%</div>
        <div className="grid grid-cols-8 gap-[3px] flex-1">
          {frameOwner.map((pid, i) => (
            <div key={i} className="aspect-square border border-[color:var(--grid-line)] relative overflow-hidden">
              {pid !== null && (
                <div
                  className="absolute inset-0"
                  style={{
                    background: procColor(pid),
                    opacity: 0.85,
                    boxShadow: `inset 0 0 6px ${procColor(pid)}, 0 0 6px ${procColor(pid)}`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[9px] text-[color:var(--hud-dim)] flex justify-between">
          <span>FRAME 0x00</span><span>FRAME 0x3F</span>
        </div>
      </div>

      {/* DISK */}
      <div className="panel relative p-3 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="hud-label">Secondary Memory · DISK</span>
          <span className="hud-value" style={{ color: "var(--spark-magenta)" }}>{usedDisk}/{SIM_CONST.TOTAL_DISK_BLOCKS}</span>
        </div>
        <div className="text-[9px] text-[color:var(--hud-dim)] mb-2">SECTORS — H/D PLATTER</div>
        <div className="grid grid-cols-16 gap-[2px] flex-1" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
          {diskOwner.map((pid, i) => (
            <div key={i} className="aspect-square border border-[color:var(--grid-line)] relative">
              {pid !== null && (
                <div className="absolute inset-0" style={{ background: procColor(pid), opacity: 0.55 }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
