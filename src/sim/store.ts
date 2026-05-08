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
  history: { x: number; y: number; z: number }[];
  histAccum: number;
  opacity: number; // 0..1, fades when dying
  dying: boolean;
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

const TOTAL_FRAMES = 64; // RAM frames (visualizes 16 GB)
const TOTAL_DISK_BLOCKS = 256; // disk blocks (visualizes 1 TB)
const RAM_LABEL = "16 GB";
const DISK_LABEL = "1 TB";
const X_DRIFT = 0.55; // units/sec — time flows along -X
const X_SPAWN = 9;
const X_DEATH = -11;

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
  cachePulse: number; // 0..1 decays
  cacheMiss: number; // 0..1 decays
  ramToCpuPulse: number; // 0..1 decays — visible as RAM->CPU latency
  pageMigrations: PageMigration[];
  pendingSwitch: { pid: number; at: number } | null; // ctx switch queued after cache pulse
  // Trajectory loop
  trajNodes: TrajNode[];
  trajSegments: TrajSegment[];
  trajHead: { x: number; y: number; z: number };
  trajTarget: { x: number; y: number; z: number };
  trajPrevTarget: { x: number; y: number; z: number };
  targetNodeId: number | null;
  executionSpeed: number; // units/sec
  decayRate: number; // 1/sec — higher = faster fade
  nodeSpawnRate: number; // nodes/sec — independent ready-queue spawn cadence
  spawnAccum: number; // internal accumulator
  // actions
  setRunning: (v: boolean) => void;
  setClock: (v: number) => void;
  setDilation: (v: number) => void;
  setTarget: (v: number) => void;
  setExecutionSpeed: (v: number) => void;
  setDecayRate: (v: number) => void;
  setNodeSpawnRate: (v: number) => void;
  simulateFault: (kind: FaultKind) => void;
  spawnProcess: () => void;
  killProcess: (pid: number) => void;
  tick: (dtRealSec: number) => void;
  reset: () => void;
}

export interface PageMigration {
  id: number;
  pid: number;
  hue: number;
  page: number; // virtual page index
  frame: number; // target frame
  t: number; // 0..1 progress
  duration: number; // sec
}
let nextMigId = 1;

export interface TrajNode {
  id: number;
  x: number; y: number; z: number;
  age: number;
  life: number;
  hue: number;
  faultKind?: FaultKind;
  pendingVisit?: boolean;
  visits: number;
}
export interface TrajSegment {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  age: number;
  life: number;
  hue: number;
}
export type FaultKind = "page" | "cache_miss" | "segfault" | "stack_overflow" | "div_by_zero" | "deadlock";
let nextNodeId = 100;

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
    x: X_SPAWN + rand(-0.5, 0.5),
    y: (priority - 0.5) * 8,
    z: rand(-4, 4),
    hue: rand(180, 260),
    flare: 0,
    cpuLoad: 0,
    history: [],
    histAccum: 0,
    opacity: 0,
    dying: false,
  };
}

function tryAllocate(state: SimState, p: SimProcess) {
  // allocate any missing frames; emit a per-page migration animation
  const need = p.memoryPages - p.framesAllocated.length;
  if (need <= 0) return true;
  if (state.freeFrames.length < need) return false;
  const frames = pickFreeBlocks(state.freeFrames, need);
  p.framesAllocated.push(...frames);
  for (let i = 0; i < frames.length; i++) {
    state.pageMigrations.push({
      id: nextMigId++,
      pid: p.pid,
      hue: p.hue,
      page: i,
      frame: frames[i],
      t: -i * 0.08, // staggered start so the pages "shatter" outward
      duration: 1.1 + Math.random() * 0.4,
    });
  }
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

function randomTarget() {
  return {
    x: (Math.random() - 0.5) * 18,
    y: (Math.random() - 0.5) * 10,
    z: (Math.random() - 0.5) * 14,
  };
}

const initial = (): Omit<SimState,
  "setRunning" | "setClock" | "setDilation" | "setTarget" | "spawnProcess" | "killProcess" | "tick" | "reset"
  | "setExecutionSpeed" | "setDecayRate" | "simulateFault"
> => ({
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
  cachePulse: 0,
  cacheMiss: 0,
  ramToCpuPulse: 0,
  pageMigrations: [],
  pendingSwitch: null,
  trajNodes: [],
  trajSegments: [],
  trajHead: { x: 0, y: 0, z: 0 },
  trajTarget: randomTarget(),
  trajPrevTarget: { x: 0, y: 0, z: 0 },
  targetNodeId: null,
  executionSpeed: 9,
  decayRate: 0.5,
  nodeSpawnRate: 1.2,
  spawnAccum: 0,
});

export const useSim = create<SimState>((set, get) => ({
  ...initial(),
  setRunning: (v) => set({ running: v }),
  setClock: (v) => set({ clockMultiplier: v }),
  setDilation: (v) => set({ timeDilation: v }),
  setTarget: (v) => set({ targetProcesses: v }),
  setExecutionSpeed: (v) => set({ executionSpeed: v }),
  setDecayRate: (v) => set({ decayRate: v }),
  setNodeSpawnRate: (v) => set({ nodeSpawnRate: v }),
  simulateFault: (kind) => set((s) => {
    const labels: Record<FaultKind, string> = {
      page: "PAGE FAULT",
      cache_miss: "CACHE MISS",
      segfault: "SEGMENTATION FAULT",
      stack_overflow: "STACK OVERFLOW",
      div_by_zero: "DIV-BY-ZERO TRAP",
      deadlock: "DEADLOCK DETECTED",
    };
    logPush(s as SimState, "err", `FAULT INJECTED · ${labels[kind]}`);
    // Attach fault to most-recent node OR drop a new fault node at the execution head
    const nodes = [...s.trajNodes];
    if (nodes.length) {
      const last = nodes[nodes.length - 1];
      nodes[nodes.length - 1] = { ...last, faultKind: kind, age: 0, life: Math.max(last.life, 2.2) };
    } else {
      nodes.push({
        id: nextNodeId++,
        x: s.trajHead.x, y: s.trajHead.y, z: s.trajHead.z,
        age: 0, life: 2.2, hue: 0, faultKind: kind, visits: 0,
      });
    }
    const patch: Partial<SimState> = {
      faultsTotal: s.faultsTotal + 1,
      cachePulse: 1,
      registerFlash: { reg: Math.floor(Math.random() * 8), t: s.simTime },
      trajNodes: nodes,
    };
    if (kind === "cache_miss" || kind === "page") {
      patch.cacheMiss = 1;
      patch.ramToCpuPulse = 1;
    }
    return patch;
  }),
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
      if (!s.pendingSwitch) {
        const candidates = Object.values(s.processes).filter((p) =>
          !p.dying && p.state !== "terminated" && p.framesAllocated.length === p.memoryPages
        );
        if (candidates.length > 0) {
          candidates.sort((a, b) => (b.priority + Math.random() * 0.3) - (a.priority + Math.random() * 0.3));
          const next = candidates[0];
          // arm cache pulse before the spark jumps
          s.cachePulse = 1;
          const miss = Math.random() < 0.25;
          if (miss) {
            s.cacheMiss = 1;
            s.ramToCpuPulse = 1;
            logPush(s, "warn", `CACHE: L2 MISS — fetching from RAM (PID ${next.pid})`);
          }
          const delay = miss ? 0.45 : 0.18;
          s.pendingSwitch = { pid: next.pid, at: s.simTime + delay };
          s.registerFlash = { reg: Math.floor(Math.random() * 8), t: s.simTime };
        }
      } else if (s.simTime >= s.pendingSwitch.at) {
        const nextPid = s.pendingSwitch.pid;
        const next = s.processes[nextPid];
        s.pendingSwitch = null;
        if (next) {
          const prev = s.currentPid;
          s.currentPid = next.pid;
          s.quantumRemaining = 0.4 / s.clockMultiplier;
          next.state = "running";
          next.flare = 1;
          if (prev && s.processes[prev]) s.processes[prev].state = "ready";
          s.spark.tx = next.x;
          s.spark.ty = next.y;
          s.spark.tz = next.z;
          logPush(s, "info", `SCHEDULER: ctx switch → PID ${next.pid} q=${(s.quantumRemaining * 1000).toFixed(0)}ms`);
        }
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
          p.dying = true;
          s.currentPid = null;
          s.quantumRemaining = 0;
        }
      }
    }

    // decay flares & cpuLoad on idle procs; drive X-axis time flow + history trails
    const toDelete: number[] = [];
    for (const p of Object.values(s.processes)) {
      p.flare = Math.max(0, p.flare - dt * 1.5);
      if (p.pid !== s.currentPid) p.cpuLoad = Math.max(0, p.cpuLoad - dt * 2);
      // Time axis: cluster drifts toward -X. Spark/active procs drift slightly slower for readability.
      const drift = X_DRIFT * (p.pid === s.currentPid ? 0.6 : 1);
      p.x -= dt * drift;
      // Z = CPU footprint (live), Y = priority band; both are organic
      const targetZ = (p.cpuLoad - 0.5) * 6 + Math.sin(s.simTime * 0.4 + p.pid) * 0.4;
      p.z += (targetZ - p.z) * Math.min(1, dt * 2);
      p.y += (((p.priority - 0.5) * 8) - p.y) * Math.min(1, dt * 2);
      // opacity: fade in on spawn, fade out on dying
      if (p.dying) p.opacity = Math.max(0, p.opacity - dt * 1.4);
      else p.opacity = Math.min(1, p.opacity + dt * 2.5);
      // record history sample roughly every 0.07s
      p.histAccum += dt;
      if (p.histAccum > 0.07) {
        p.histAccum = 0;
        p.history.push({ x: p.x, y: p.y, z: p.z });
        if (p.history.length > 50) p.history.shift();
      }
      if (p.x < X_DEATH || (p.dying && p.opacity <= 0.01)) {
        if (!p.dying) freeProcessMemory(s, p);
        toDelete.push(p.pid);
      }
    }
    for (const pid of toDelete) delete s.processes[pid];

    // page migration progress
    if (s.pageMigrations.length) {
      s.pageMigrations = s.pageMigrations
        .map((m) => ({ ...m, t: m.t + dt / m.duration }))
        .filter((m) => m.t < 1.15);
    }

    // cache / ram pulses decay
    s.cachePulse = Math.max(0, s.cachePulse - dt * 1.8);
    s.cacheMiss = Math.max(0, s.cacheMiss - dt * 1.2);
    s.ramToCpuPulse = Math.max(0, s.ramToCpuPulse - dt * 1.6);

    // === TRAJECTORY LOOP ===
    // Independent spawn cadence -> ready queue. CPU head pulls FIFO from queue.
    {
      // 1) Spawn pending nodes at nodeSpawnRate (capped queue)
      s.spawnAccum += dt * s.nodeSpawnRate;
      const pendingCount = s.trajNodes.filter((n) => n.pendingVisit).length;
      const queueCap = 18;
      while (s.spawnAccum >= 1) {
        s.spawnAccum -= 1;
        if (pendingCount + 1 > queueCap) break;
        const t = randomTarget();
        const baseLife = Math.max(0.3, 1 / Math.max(0.05, s.decayRate));
        s.trajNodes.push({
          id: nextNodeId++, x: t.x, y: t.y, z: t.z,
          age: 0, life: baseLife + 14, hue: 170 + Math.random() * 90,
          pendingVisit: true, visits: 0,
        });
      }
      // 2) Pick next target (FIFO ready queue, occasionally revisit a completed node)
      if (s.targetNodeId == null || !s.trajNodes.find((n) => n.id === s.targetNodeId)) {
        const pending = s.trajNodes.filter((n) => n.pendingVisit && !n.faultKind);
        const completed = s.trajNodes.filter((n) => !n.pendingVisit && !n.faultKind);
        let chosen: TrajNode | undefined;
        if (completed.length > 2 && pending.length > 0 && Math.random() < 0.30) {
          chosen = completed[Math.floor(Math.random() * completed.length)];
        } else if (pending.length > 0) {
          chosen = pending[0]; // oldest first — true ready queue
        } else if (completed.length > 0) {
          chosen = completed[Math.floor(Math.random() * completed.length)];
        }
        if (chosen) {
          s.trajTarget = { x: chosen.x, y: chosen.y, z: chosen.z };
          s.targetNodeId = chosen.id;
        }
      }
      const head = s.trajHead;
      const tgt = s.trajTarget;
      const dx = tgt.x - head.x, dy = tgt.y - head.y, dz = tgt.z - head.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const step = s.executionSpeed * dt;
      if (dist <= step + 0.01) {
        // arrived — mark visit, spawn segment, queue next target
        head.x = tgt.x; head.y = tgt.y; head.z = tgt.z;
        const life = Math.max(0.3, 1 / Math.max(0.05, s.decayRate));
        const node = s.trajNodes.find((n) => n.id === s.targetNodeId);
        const hue = node ? node.hue : 170 + Math.random() * 90;
        if (node) {
          node.pendingVisit = false;
          node.visits += 1;
          node.age = 0;
          node.life = life + 1.5; // refresh life on each visit
        }
        s.trajSegments.push({
          ax: s.trajPrevTarget.x, ay: s.trajPrevTarget.y, az: s.trajPrevTarget.z,
          bx: tgt.x, by: tgt.y, bz: tgt.z,
          age: 0, life, hue,
        });
        s.trajPrevTarget = { x: tgt.x, y: tgt.y, z: tgt.z };
        s.targetNodeId = null; // triggers next pick on the following tick
        // pulse cache + register on every spawn
        s.cachePulse = 1;
        s.registerFlash = { reg: Math.floor(Math.random() * 8), t: s.simTime };
        if (Math.random() < 0.18) { s.cacheMiss = 1; s.ramToCpuPulse = 1; }
      } else {
        head.x += (dx / dist) * step;
        head.y += (dy / dist) * step;
        head.z += (dz / dist) * step;
      }
      // Age & cull
      for (const n of s.trajNodes) n.age += dt;
      for (const seg of s.trajSegments) seg.age += dt;
      s.trajNodes = s.trajNodes.filter((n) => n.pendingVisit || n.age < n.life);
      s.trajSegments = s.trajSegments.filter((sg) => sg.age < sg.life);
    }

    // spark animation toward target
    const sp = s.spark;
    sp.x += (sp.tx - sp.x) * Math.min(1, dt * 12);
    sp.y += (sp.ty - sp.y) * Math.min(1, dt * 12);
    sp.z += (sp.tz - sp.z) * Math.min(1, dt * 12);
    sp.trail.push({ x: sp.x, y: sp.y, z: sp.z, t: s.simTime });
    if (sp.trail.length > 60) sp.trail.shift();

    // metrics sample
    const procLoad = Object.values(s.processes).reduce((a, p) => a + p.cpuLoad, 0) / Math.max(1, s.targetProcesses);
    const queueLoad = Math.min(1, s.trajNodes.filter((n) => n.pendingVisit).length / 10);
    const speedLoad = Math.min(1, s.executionSpeed / 30);
    const trajLoad = Math.min(1, queueLoad * 0.55 + speedLoad * 0.55);
    const totalCpu = Math.min(1, procLoad * 0.35 + trajLoad * 0.75);
    s.cpuLoadEMA = s.cpuLoadEMA * 0.85 + totalCpu * 0.15;
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
    set({
      simTime: s.simTime,
      processes: { ...s.processes },
      freeFrames: s.freeFrames,
      freeDiskBlocks: s.freeDiskBlocks,
      currentPid: s.currentPid,
      quantumRemaining: s.quantumRemaining,
      spark: { ...sp, trail: [...sp.trail] },
      logs: [...s.logs],
      metrics: [...s.metrics],
      cpuLoadEMA: s.cpuLoadEMA,
      faultsTotal: s.faultsTotal,
      ioTotal: s.ioTotal,
      registerFlash: s.registerFlash,
      cachePulse: s.cachePulse,
      cacheMiss: s.cacheMiss,
      ramToCpuPulse: s.ramToCpuPulse,
      pageMigrations: [...s.pageMigrations],
      pendingSwitch: s.pendingSwitch,
      trajNodes: [...s.trajNodes],
      trajSegments: [...s.trajSegments],
      trajHead: { ...s.trajHead },
      trajTarget: { ...s.trajTarget },
      trajPrevTarget: { ...s.trajPrevTarget },
      targetNodeId: s.targetNodeId,
    });
  },
}));

export const SIM_CONST = { TOTAL_FRAMES, TOTAL_DISK_BLOCKS, RAM_LABEL, DISK_LABEL };
