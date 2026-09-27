// Seção EXPLORAR — crossfilter sobre a base principal de ocorrências (2022+).
// Microdado codificado (painel.bin, uint8); todo gráfico de barras é clicável e
// cruza com os demais. O mapa de calor semana × hora e a evolução mensal
// reagem aos filtros, mas não filtram.
import * as echarts from "echarts";
import { fmt, fmt1 } from "./estado.js";
import { TEMA, COR, RAMPA_GRAVE, grafico, rotuloMes } from "./tema-grafico.js";
import { criarCrossfilter } from "./crossfilter.js";

const ACENTO = COR.placa;
const DIM = COR.apagado;
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

let META = null;
let cf = null;
const COLS = {};
const graficos = new Map();
let anoAtivo = null; // null = todos os anos

// dims histogramadas a cada render
const SPECS = [
  { dim: "tipo", tam: 13 }, { dim: "zona", tam: 6 }, { dim: "hora", tam: 25 },
  { dim: "conduta", tam: 11 }, { dim: "local", tam: 9 }, { dim: "slot", tam: 169 },
];
// barras que não informam nada: conduta 0 = "Não especificada", local 8 = "n/i"
const OCULTAR = { conduta: [0], local: [8] };

export async function initPainel() {
  const [meta, buf] = await Promise.all([
    fetch("data/painel_meta.json").then((r) => r.json()),
    fetch("data/painel.bin").then((r) => r.arrayBuffer()),
  ]);
  META = meta;
  meta.colunas.forEach((c, i) => { COLS[c] = new Uint8Array(buf, i * meta.nrows, meta.nrows); });
  cf = criarCrossfilter(COLS, meta.nrows);
  SPECS.find((s) => s.dim === "tipo").tam = meta.rotulos.tipo.length;
  window.__painel = { cf, render, alternar }; // depuração

  for (const id of ["p-tipo", "p-zona", "p-hora", "p-evolucao", "p-conduta", "p-local", "p-semana"])
    graficos.set(id, grafico(echarts, document.getElementById(id)));

  // anos como filtro rápido (seleção única) sobre a dimensão mês
  const anos = [...new Set(meta.meses.map((m) => m.slice(0, 4)))].sort().reverse();
  const elAnos = document.getElementById("p-anos");
  elAnos.innerHTML = `<button data-ano="" class="ativo">Todos os anos</button>` +
    anos.map((a) => `<button data-ano="${a}">${a}</button>`).join("");
  elAnos.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    elAnos.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
    anoAtivo = b.dataset.ano || null;
    const meses = anoAtivo
      ? meta.meses.map((m, i) => [m, i]).filter(([m]) => m.startsWith(anoAtivo)).map(([, i]) => i)
      : null;
    cf.definir("mes", meses);
    render();
  });

  document.getElementById("p-limpar").addEventListener("click", () => {
    cf.limpar(); anoAtivo = null;
    elAnos.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x.dataset.ano === ""));
    render();
  });
  render();
}

function alternar(dim, valor) { cf.alternar(dim, valor); render(); }

function render() {
  const { outs, total } = cf.histogramas(SPECS);
  const nMeses = anoAtivo
    ? META.meses.filter((m) => m.startsWith(anoAtivo)).length
    : META.meses.length;

  renderChipsAtivos();
  renderHighlights(outs, total, nMeses);
  barra("p-tipo", "tipo", outs.tipo, META.rotulos.tipo);
  renderZona(outs.zona, nMeses);
  renderHora(outs.hora);
  renderSemana(outs.slot);
  renderEvolucao();
  barra("p-conduta", "conduta", outs.conduta, META.rotulos.conduta);
  barra("p-local", "local", outs.local, META.rotulos.local);
}

function renderChipsAtivos() {
  const rotDim = { tipo: META.rotulos.tipo, zona: META.rotulos.zona,
    conduta: META.rotulos.conduta, local: META.rotulos.local };
  const chips = [];
  for (const [dim, set] of cf.filtros) {
    if (dim === "mes") continue; // ano tem sua própria linha
    for (const v of set) chips.push({ dim, v, rot: dim === "hora" ? `${v}h` : rotDim[dim]?.[v] ?? v });
  }
  const alvo = document.getElementById("p-filtros-ativos");
  alvo.innerHTML = chips.map((c) => `<button data-d="${c.dim}" data-v="${c.v}" aria-label="Remover filtro ${c.rot}">${c.rot} ✕</button>`).join("");
  alvo.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => alternar(b.dataset.d, +b.dataset.v)));
  document.getElementById("p-limpar").hidden = !chips.length && !anoAtivo;
}

function renderHighlights(outs, total, nMeses) {
  const iTipo = argmax(outs.tipo);
  const somaTipo = soma(outs.tipo) || 1;
  const noite = outs.hora.slice(18, 24).reduce((a, b) => a + b, 0);
  const comHora = outs.hora.slice(0, 24).reduce((a, b) => a + b, 0) || 1;
  const taxasZona = [0, 1, 2, 3, 4].map((z) => ({ z, t: (outs.zona[z] / (META.pop_zonas[z] || 1)) }));
  const zTop = taxasZona.sort((a, b) => b.t - a.t)[0];
  const cards = [
    { v: fmt.format(Math.round(total / nMeses)), r: "ocorrências por mês" },
    { v: `${fmt1.format((outs.tipo[iTipo] / somaTipo) * 100)}%`, r: `são ${META.rotulos.tipo[iTipo].toLowerCase()}` },
    { v: META.rotulos.zona[zTop.z], r: "região com mais casos por habitante" },
    { v: `${fmt1.format((noite / comHora) * 100)}%`, r: "à noite (18h–0h)" },
  ];
  document.getElementById("p-highlights").innerHTML = cards.map((c) => `
    <div class="kpi"><div class="valor">${c.v}</div><div class="kpi-rotulo">${c.r}</div></div>`).join("");
}

/* ---- barras horizontais clicáveis (tipo, conduta, local) ---- */
function barra(elId, dim, cont, rotulos) {
  const sel = cf.filtros.get(dim);
  const esconder = new Set(OCULTAR[dim] ?? []);
  const itens = rotulos.map((r, i) => ({ r, i, v: cont[i] }))
    .filter((x) => !esconder.has(x.i) && (x.v > 0 || sel?.has(x.i)))
    .sort((a, b) => a.v - b.v);
  const g = graficos.get(elId);
  g.setOption({
    ...TEMA.base,
    grid: { left: 8, right: 52, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => `${p.name}<br><b>${fmt.format(p.value)}</b>` },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category", data: itens.map((x) => x.r),
      axisLabel: { color: COR.texto, fontSize: 11.5, width: 150, overflow: "truncate" },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar", barWidth: "64%", cursor: "pointer",
      data: itens.map((x) => ({ value: x.v, itemStyle: { color: sel && !sel.has(x.i) ? DIM : ACENTO, borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: "right", ...TEMA.rotulo, formatter: (p) => fmt.format(p.value) },
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar(dim, itens[p.dataIndex].i));
}

function renderZona(cont, nMeses) {
  const sel = cf.filtros.get("zona");
  const fator = 12 / nMeses;
  const itens = [0, 1, 2, 3, 4].map((z) => ({
    z, nome: META.rotulos.zona[z], n: cont[z],
    taxa: (cont[z] / (META.pop_zonas[z] || 1)) * 100000 * fator,
  })).sort((a, b) => a.taxa - b.taxa);
  const g = graficos.get("p-zona");
  g.setOption({
    ...TEMA.base,
    grid: { left: 8, right: 52, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => { const it = itens[p.dataIndex]; return `<b>${it.nome}</b><br>${fmt.format(Math.round(it.taxa))} por 100 mil hab./ano<br>${fmt.format(it.n)} ocorrências`; } },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: itens.map((x) => x.nome),
      axisLabel: { color: COR.texto, fontSize: 12 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", barWidth: "60%", cursor: "pointer",
      data: itens.map((x) => ({ value: Math.round(x.taxa), itemStyle: { color: sel && !sel.has(x.z) ? DIM : ACENTO, borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: "right", ...TEMA.rotulo, formatter: (p) => fmt.format(p.value) },
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar("zona", itens[p.dataIndex].z));
}

function renderHora(cont) {
  const sel = cf.filtros.get("hora");
  const g = graficos.get("p-hora");
  g.setOption({
    ...TEMA.base,
    grid: { left: 44, right: 8, top: 10, bottom: 22 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis", formatter: (ps) => `${ps[0].axisValue}<br><b>${fmt.format(ps[0].value)}</b>` },
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => `${h}h`), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", barWidth: "72%", cursor: "pointer",
      data: cont.slice(0, 24).map((v, h) => ({ value: v, itemStyle: { color: sel && !sel.has(h) ? DIM : ACENTO, borderRadius: [2, 2, 0, 0] } })),
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar("hora", p.dataIndex));
}

/* ---- quando acontece: dia da semana × hora ---- */
function renderSemana(slots) {
  const celulas = [];
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) celulas.push([h, d, slots[d * 24 + h]]);
  const max = Math.max(...slots.slice(0, 168), 1);
  const estreito = document.getElementById("p-semana").clientWidth < 520;
  graficos.get("p-semana").setOption({
    ...TEMA.base,
    grid: { left: 36, right: 8, top: 4, bottom: 40 },
    tooltip: { ...TEMA.base.tooltip,
      formatter: (p) => `${DIAS[p.value[1]]} ${String(p.value[0]).padStart(2, "0")}h<br><b>${fmt.format(p.value[2])}</b> ocorrências` },
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => `${h}h`), ...TEMA.eixoX,
      axisLabel: { ...TEMA.eixoX.axisLabel, interval: estreito ? 5 : 1 } },
    yAxis: { type: "category", data: DIAS, ...TEMA.eixoY, splitLine: { show: false }, inverse: true },
    visualMap: {
      min: 0, max, show: true, orient: "horizontal", left: "center", bottom: 0,
      itemWidth: 10, itemHeight: 140, text: ["mais", "menos"], calculable: false,
      textStyle: { color: COR.texto3, fontSize: 10 }, inRange: { color: RAMPA_GRAVE },
    },
    series: [{ type: "heatmap", data: celulas, itemStyle: { borderColor: "#FFFFFF", borderWidth: 1.5 } }],
  }, true);
}

// evolução mensal: contexto (não filtra); destaca o ano ativo
function renderEvolucao() {
  const { outs } = cf.histogramas([{ dim: "mes", tam: META.meses.length }]);
  graficos.get("p-evolucao").setOption({
    ...TEMA.base,
    grid: { left: 52, right: 10, top: 10, bottom: 24 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis" },
    xAxis: { type: "category", data: META.meses.map(rotuloMes), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", data: outs.mes, barWidth: "64%",
      itemStyle: {
        color: (p) => (anoAtivo && !META.meses[p.dataIndex].startsWith(anoAtivo)) ? DIM : ACENTO,
        borderRadius: [2, 2, 0, 0],
      },
    }],
  }, true);
}

const soma = (a) => a.reduce((x, y) => x + y, 0);
const argmax = (a) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0);
