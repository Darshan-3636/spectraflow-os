import { create } from "zustand";

export type ProcState = "ready" | "running" | "waiting" | "fault" | "terminated";

export interface SimProcess {
  pid: number;
  name: string;
  priority: number; // 0..1 (higher = top)
  memoryPages: number; // total pages required
  framesAllocated: number[]; // physical frame indices in RAM
  diskBlocks: number[]; // dormant location on disk
  executionRemaining: number; // simulated cycles
  faultProbability: number; // 0..0.2
  state: ProcState;
  threadCount: number;
  // 3D position in execution manifold
  x: number;
  y: number;
  z: number;
  hue: number; // 0..360
  flare: number; // 0..1 transient
  cpuLoad: number; // 0..1
}

export interface LogEntry {
  t: number;
  kind: "info" | "warn" | "err";
  msg: string;
}

export interface MetricSample {
  t: number;
  cpu: number;
  faults: number;
  io: number;
  scatter?: { virt: number; phys: number; intensity: number; hue: number };
}

const TOTAL_FRAMES = 64; // RAM frames
const TOTAL_DISK_BLOCKS = 256;

interface SimState {
  running: boolean;
  simTime: number; // seconds
  clockMultiplier: number; // 0.25..4
  timeDilation: number; // 0.1..2 (lower = slow-mo)
  targetProcesses: number; // 4..24
  processes: Record<number, SimProcess>;
  freeFrames: number[];
  freeDiskBlocks: number[];
  currentPid: number | null;
  quantumRemaining: number; // cycles
  spark: { x: number; y: number; z: number; tx: number; ty: number; tz: number; trail: { x: number; y: number; z: number; t: number }[] };
  logs: LogEntry[];
  metrics: MetricSample[];
  cpuLoadEMA: number;
  faultsTotal: number;
  ioTotal: number;
  registerFlash: { reg: number; t: number } | null;
  // actions
  setRunning: (v: boolean) => void;
  setClock: (v: number) => void;
  setDilation: (v: number) => void;
  setTarget: (v: number) => void;
  spawnProcess: () => void;
  killProcess: (pid: number) => void;
  tick: (dtRealSec: number) => void;
  reset: () => void;
}

let nextPid = 100;
const PROC_NAMES = ["kernel_task", "vmlinuz", "scheduler", "systemd", "neuralcore", "iohelper", "renderd", "audio_dsp", "netmgr", "ult_daemon", "shaderc", "pagefault_h", "blockio", "tty", "fsync", "mmu_pump"];

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function pickFreeBlocks(pool: number[], n: number) {
  const out: number[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function makeProcess(state: SimState): SimProcess | null {
  const pid = nextPid++;
  const memoryPages = Math.max(2, Math.floor(rand(2, 10)));
  const diskBlocks = pickFreeBlocks(state.freeDiskBlocks, memoryPages);
  if (diskBlocks.length < memoryPages) return null;
  const priority = Math.random();
  return {
    pid,
    name: PROC_NAMES[Math.floor(Math.random() * PROC_NAMES.length)] + "_" + pid,
    priority,
    memoryPages,
    framesAllocated: [],
    diskBlocks,
    executionRemaining: rand(40, 220),
    faultProbability: rand(0.005, 0.05),
    state: "ready",
    threadCount: Math.floor(rand(1, 6)),
    x: rand(-6, 6),
    y: (priority - 0.5) * 8,
    z: rand(-6, 6),
    hue: rand(180, 260),
    flare: 0,
    cpuLoad: 0,
  };
}

function tryAllocate(state: SimState, p: SimProcess) {
  // allocate any missing frames
  const need = p.memoryPages - p.framesAllocated.length;
  if (need <= 0) return true;
  if (state.freeFrames.length < need) return false;
  const frames = pickFreeBlocks(state.freeFrames, need);
  p.framesAllocated.push(...frames);
  return true;
}

function freeProcessMemory(state: SimState, p: SimProcess) {
  state.freeFrames.push(...p.framesAllocated);
  state.freeDiskBlocks.push(...p.diskBlocks);
  p.framesAllocated = [];
  p.diskBlocks = [];
}

function logPush(state: SimState, kind: LogEntry["kind"], msg: string) {
  state.logs.push({ t: state.simTime, kind, msg });
  if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
}

const initial = (): Omit<SimState, "setRunning" | "setClock" | "setDilation" | "setTarget" | "spawnProcess" | "killProcess" | "tick" | "reset"> => ({
  running: true,
  simTime: 0,
  clockMultiplier: 1,
  timeDilation: 1,
  targetProcesses: 10,
  processes: {},
  freeFrames: Array.from({ length: TOTAL_FRAMES }, (_, i) => i),
  freeDiskBlocks: Array.from({ length: TOTAL_DISK_BLOCKS }, (_, i) => i),
  currentPid: null,
  quantumRemaining: 0,
  spark: { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, trail: [] },
  logs: [],
  metrics: [],
  cpuLoadEMA: 0,
  faultsTotal: 0,
  ioTotal: 0,
  registerFlash: null,
});

export const useSim = create<SimState>((set, get) => ({
  ...initial(),
  setRunning: (v) => set({ running: v }),
  setClock: (v) => set({ clockMultiplier: v }),
  setDilation: (v) => set({ timeDilation: v }),
  setTarget: (v) => set({ targetProcesses: v }),
  spawnProcess: () => set((s) => {
    const p = makeProcess(s as SimState);
    if (!p) return {};
    logPush(s as SimState, "info", `LOADER: spawn PID ${p.pid} (${p.name}) — ${p.memoryPages} pages on disk`);
    return { processes: { ...s.processes, [p.pid]: p } };
  }),
  killProcess: (pid) => set((s) => {
    const p = s.processes[pid];
    if (!p) return {};
    freeProcessMemory(s as SimState, p);
    const next = { ...s.processes };
    delete next[pid];
    logPush(s as SimState, "info", `KERNEL: terminate PID ${pid}`);
    return { processes: next };
  }),
  reset: () => set({ ...initial() }),
  tick: (dtRealSec) => {
    const s = get();
    const dt = dtRealSec * s.clockMultiplier * s.timeDilation;
    if (!s.running || dt <= 0) return;
    s.simTime += dt;

    // --- Spawn / cull processes to maintain target ---
    const procs = Object.values(s.processes);
    if (procs.length < s.targetProcesses && Math.random() < dt * 2) {
      const p = makeProcess(s);
      if (p) {
        s.processes[p.pid] = p;
        logPush(s, "info", `LOADER: spawn PID ${p.pid} (${p.name})`);
      }
    }

    // --- Try to bring ready processes into RAM ---
    for (const p of Object.values(s.processes)) {
      if (p.state === "ready" && p.framesAllocated.length < p.memoryPages) {
        const before = p.framesAllocated.length;
        if (tryAllocate(s, p)) {
          if (before === 0) {
            logPush(s, "info", `MMU: PID ${p.pid} mapped ${p.memoryPages} pages → frames`);
            s.ioTotal += p.memoryPages;
          }
        }
      }
    }

    // --- Scheduler: priority-based round robin ---
    if (s.currentPid === null || s.quantumRemaining <= 0 || !s.processes[s.currentPid]) {
      // pick highest-priority ready/waiting that has frames
      const candidates = Object.values(s.processes).filter((p) =>
        p.state !== "terminated" && p.framesAllocated.length === p.memoryPages
      );
      if (candidates.length > 0) {
        // weighted by priority + small random
        candidates.sort((a, b) => (b.priority + Math.random() * 0.3) - (a.priority + Math.random() * 0.3));
        const next = candidates[0];
        const prev = s.currentPid;
        s.currentPid = next.pid;
        s.quantumRemaining = 0.4 / s.clockMultiplier; // seconds
        next.state = "running";
        next.flare = 1;
        if (prev && s.processes[prev]) s.processes[prev].state = "ready";
        // spark target
        s.spark.tx = next.x;
        s.spark.ty = next.y;
        s.spark.tz = next.z;
        // register flash
        s.registerFlash = { reg: Math.floor(Math.random() * 8), t: s.simTime };
        logPush(s, "info", `SCHEDULER: ctx switch → PID ${next.pid} q=${(s.quantumRemaining * 1000).toFixed(0)}ms`);
      }
    } else {
      s.quantumRemaining -= dt;
      const p = s.processes[s.currentPid];
      if (p) {
        p.executionRemaining -= dt * 30;
        p.cpuLoad = Math.min(1, p.cpuLoad + dt * 4);
        // page fault check
        if (Math.random() < p.faultProbability * dt * 60) {
          p.state = "fault";
          p.flare = 1;
          s.faultsTotal++;
          s.ioTotal += 1;
          s.quantumRemaining = 0;
          // evict one frame, will be re-fetched
          if (p.framesAllocated.length > 0) {
            const evicted = p.framesAllocated.pop()!;
            s.freeFrames.push(evicted);
          }
          logPush(s, "err", `MMU: PAGE FAULT on PID ${p.pid} — frame evicted, refetching from disk`);
          setTimeout(() => {
            const cur = get();
            const proc = cur.processes[p.pid];
            if (proc) proc.state = "ready";
          }, 300);
        }
        if (p.executionRemaining <= 0) {
          logPush(s, "info", `KERNEL: PID ${p.pid} exited cleanly`);
          freeProcessMemory(s, p);
          delete s.processes[p.pid];
          s.currentPid = null;
          s.quantumRemaining = 0;
        }
      }
    }

    // decay flares & cpuLoad on idle procs
    for (const p of Object.values(s.processes)) {
      p.flare = Math.max(0, p.flare - dt * 1.5);
      if (p.pid !== s.currentPid) p.cpuLoad = Math.max(0, p.cpuLoad - dt * 2);
      // gentle drift
      p.x += Math.sin(s.simTime * 0.3 + p.pid) * dt * 0.05;
      p.z += Math.cos(s.simTime * 0.27 + p.pid * 0.7) * dt * 0.05;
      p.y += (((p.priority - 0.5) * 8) - p.y) * dt * 0.5;
    }

    // spark animation toward target
    const sp = s.spark;
    sp.x += (sp.tx - sp.x) * Math.min(1, dt * 12);
    sp.y += (sp.ty - sp.y) * Math.min(1, dt * 12);
    sp.z += (sp.tz - sp.z) * Math.min(1, dt * 12);
    sp.trail.push({ x: sp.x, y: sp.y, z: sp.z, t: s.simTime });
    if (sp.trail.length > 60) sp.trail.shift();

    // metrics sample
    const totalCpu = Object.values(s.processes).reduce((a, p) => a + p.cpuLoad, 0) / Math.max(1, s.targetProcesses);
    s.cpuLoadEMA = s.cpuLoadEMA * 0.9 + totalCpu * 0.1;
    if (Math.random() < dt * 30) {
      // scatter sample using current proc's mapping
      let scatter;
      if (s.currentPid && s.processes[s.currentPid]) {
        const cp = s.processes[s.currentPid];
        if (cp.framesAllocated.length > 0) {
          const i = Math.floor(Math.random() * cp.framesAllocated.length);
          scatter = { virt: cp.diskBlocks[i] ?? 0, phys: cp.framesAllocated[i], intensity: cp.cpuLoad, hue: cp.hue };
        }
      }
      s.metrics.push({ t: s.simTime, cpu: s.cpuLoadEMA, faults: s.faultsTotal, io: s.ioTotal, scatter });
      if (s.metrics.length > 600) s.metrics.shift();
    }

    // trigger re-render (mutate-then-set pattern)
    set({ simTime: s.simTime, processes: { ...s.processes }, freeFrames: s.freeFrames, freeDiskBlocks: s.freeDiskBlocks, currentPid: s.currentPid, quantumRemaining: s.quantumRemaining, spark: { ...sp, trail: [...sp.trail] }, logs: [...s.logs], metrics: [...s.metrics], cpuLoadEMA: s.cpuLoadEMA, faultsTotal: s.faultsTotal, ioTotal: s.ioTotal, registerFlash: s.registerFlash });
  },
}));

export const SIM_CONST = { TOTAL_FRAMES, TOTAL_DISK_BLOCKS };
