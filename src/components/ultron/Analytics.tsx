import { useSim, SIM_CONST } from "@/sim/store";
import { useEffect, useRef } from "react";
import * as d3 from "d3";

export function ToneMap() {
  const ref = useRef<SVGSVGElement>(null);
  const metrics = useSim((s) => s.metrics);
  useEffect(() => {
    const svg = d3.select(ref.current);
    const w = ref.current?.clientWidth || 240;
    const h = ref.current?.clientHeight || 140;
    svg.selectAll("*").remove();
    const x = d3.scaleLinear().domain([0, SIM_CONST.TOTAL_DISK_BLOCKS]).range([26, w - 6]);
    const y = d3.scaleLinear().domain([0, SIM_CONST.TOTAL_FRAMES]).range([h - 18, 6]);
    // axes
    svg.append("g").attr("transform", `translate(0,${h - 18})`).call(d3.axisBottom(x).ticks(4).tickSize(2)).attr("color", "#444").selectAll("text").style("font-size", "8px").style("fill", "#888");
    svg.append("g").attr("transform", `translate(26,0)`).call(d3.axisLeft(y).ticks(4).tickSize(2)).attr("color", "#444").selectAll("text").style("font-size", "8px").style("fill", "#888");
    const pts = metrics.filter((m) => m.scatter).slice(-300);
    svg.selectAll("circle").data(pts).enter().append("circle")
      .attr("cx", (d) => x(d.scatter!.virt))
      .attr("cy", (d) => y(d.scatter!.phys))
      .attr("r", (d) => 1 + d.scatter!.intensity * 2)
      .attr("fill", (d) => `hsl(${d.scatter!.hue}, 90%, 65%)`)
      .attr("opacity", 0.7);
  }, [metrics]);
  return <svg ref={ref} className="w-full h-full" />;
}

export function PCAWaveform() {
  const ref = useRef<SVGSVGElement>(null);
  const metrics = useSim((s) => s.metrics);
  useEffect(() => {
    const svg = d3.select(ref.current);
    const w = ref.current?.clientWidth || 240;
    const h = ref.current?.clientHeight || 140;
    svg.selectAll("*").remove();
    if (metrics.length < 2) return;
    const x = d3.scaleLinear().domain([metrics[0].t, metrics[metrics.length - 1].t]).range([4, w - 4]);
    const yCpu = d3.scaleLinear().domain([0, 1]).range([h - 4, 4]);
    const maxF = d3.max(metrics, (m) => m.faults) || 1;
    const maxIo = d3.max(metrics, (m) => m.io) || 1;
    const yF = d3.scaleLinear().domain([0, maxF]).range([h - 4, 4]);
    const yI = d3.scaleLinear().domain([0, maxIo]).range([h - 4, 4]);
    const lineCpu = d3.line<typeof metrics[number]>().x((d) => x(d.t)).y((d) => yCpu(d.cpu)).curve(d3.curveMonotoneX);
    const lineF = d3.line<typeof metrics[number]>().x((d) => x(d.t)).y((d) => yF(d.faults));
    const lineI = d3.line<typeof metrics[number]>().x((d) => x(d.t)).y((d) => yI(d.io));
    svg.append("path").datum(metrics).attr("fill", "none").attr("stroke", "#ff5577").attr("stroke-width", 1).attr("d", lineCpu as never).attr("opacity", 0.9);
    svg.append("path").datum(metrics).attr("fill", "none").attr("stroke", "#55ff99").attr("stroke-width", 1).attr("d", lineF as never).attr("opacity", 0.7);
    svg.append("path").datum(metrics).attr("fill", "none").attr("stroke", "#5599ff").attr("stroke-width", 1).attr("d", lineI as never).attr("opacity", 0.6);
  }, [metrics]);
  return <svg ref={ref} className="w-full h-full" />;
}
