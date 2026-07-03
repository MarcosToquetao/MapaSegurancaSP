// Aba SÉRIES — séries temporais das principais naturezas + condutas-proxy.
import * as echarts from "echarts";
import { dados, CORES, fmt } from "./estado.js";
import { TEMA, grafico, rotuloMes, mediaMovel } from "./tema-grafico.js";

// séries oferecidas: naturezas oficiais + condutas com leitura cidadã
// cores: tons do tricolor preto/vermelho/branco (vermelhos, vinhos, pratas, brancos)
const CATALOGO = [
  { id: "ROUBO DE CELULAR", rotulo: "Roubo de celular", cor: CORES.celular, tipo: "nat" },
  { id: "FURTO DE CELULAR", rotulo: "Furto de celular", cor: "#ff8d85", tipo: "nat" },
  { id: "HOMICÍDIO DOLOSO", rotulo: "Homicídio doloso", cor: CORES.letais, tipo: "nat" },
  { id: "LATROCÍNIO", rotulo: "Latrocínio", cor: "#7c0e18", tipo: "nat" },
  { id: "ROUBO - OUTROS", rotulo: "Roubo (geral)", cor: CORES.roubos, tipo: "nat" },
  { id: "ROUBO DE VEÍCULO", rotulo: "Roubo de veículo", cor: "#d3404d", tipo: "nat" },
  { id: "roubos::Transeunte", rotulo: "Roubo a transeunte*", cor: "#e9848d", tipo: "conduta" },
  { id: "FURTO - OUTROS", rotulo: "Furto (geral)", cor: CORES.furtos, tipo: "nat" },
  { id: "FURTO DE VEÍCULO", rotulo: "Furto de veículo", cor: "#6b737d", tipo: "nat" },
  { id: "furtos::Transeunte", rotulo: "Furto a transeunte*", cor: "#c9d0d8", tipo: "conduta" },
  { id: "ESTUPRO", rotulo: "Estupro", cor: CORES.genero, tipo: "nat" },
  { id: "ESTUPRO DE VULNERÁVEL", rotulo: "Estupro de vulnerável", cor: "#b9bfc7", tipo: "nat" },
];

const ativas = new Set(["ROUBO DE CELULAR", "FURTO DE CELULAR", "HOMICÍDIO DOLOSO", "ROUBO - OUTROS"]);
let usarMM = true;
let gPrincipal;
const gMultiplos = new Map();

function serieDe(item) {
  if (item.tipo === "conduta") {
    const [cat, conduta] = item.id.split("::");
    return dados.agg.cidade.por_conduta[cat]?.[conduta] ?? null;
  }
  return dados.agg.cidade.por_natureza[item.id] ?? null;
}

export function initSeries() {
  const el = document.getElementById("s-series");
  el.innerHTML = CATALOGO.map((s) =>
    `<button data-id="${s.id}" style="--cor-chip:${s.cor}" class="${ativas.has(s.id) ? "ativo" : ""}"
       aria-pressed="${ativas.has(s.id)}">${s.rotulo}</button>`
  ).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.id;
    if (ativas.has(id)) ativas.delete(id); else ativas.add(id);
    b.classList.toggle("ativo");
    b.setAttribute("aria-pressed", ativas.has(id));
    renderPrincipal();
  });

  document.getElementById("s-opcoes").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    usarMM = !usarMM;
    b.classList.toggle("ativo", usarMM);
    b.setAttribute("aria-pressed", usarMM);
    renderPrincipal();
  });

  gPrincipal = grafico(echarts, document.getElementById("s-grafico"));
  renderPrincipal();
  renderMultiplos();
}

function renderPrincipal() {
  const rotulos = dados.agg.meses.map(rotuloMes);
  const series = CATALOGO.filter((s) => ativas.has(s.id)).flatMap((s) => {
    const bruta = serieDe(s);
    if (!bruta) return [];
    const linha = {
      name: s.rotulo, type: "line", symbol: "none",
      data: usarMM ? mediaMovel(bruta) : bruta,
      lineStyle: { color: s.cor, width: 2.2 },
      itemStyle: { color: s.cor },
      emphasis: { focus: "series" },
    };
    return usarMM
      ? [linha, {
          name: `${s.rotulo} (bruto)`, type: "line", symbol: "none",
          data: bruta, silent: true, tooltip: { show: false },
          lineStyle: { color: s.cor, width: 1, opacity: 0.22 },
          itemStyle: { color: s.cor },
        }]
      : [linha];
  });

  gPrincipal.setOption({
    ...TEMA.base,
    grid: { left: 52, right: 16, top: 34, bottom: 26 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis" },
    legend: {
      top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 4,
      textStyle: { color: "#a9adb4", fontSize: 11 },
      data: CATALOGO.filter((s) => ativas.has(s.id)).map((s) => s.rotulo),
    },
    xAxis: { type: "category", data: rotulos, ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series,
  }, true);
}

function renderMultiplos() {
  const alvo = document.getElementById("s-multiplos");
  alvo.innerHTML = CATALOGO.map((s) =>
    `<article class="cartao"><h3 style="color:${s.cor}">${s.rotulo}</h3><div class="grafico" id="s-mini-${cssId(s.id)}"></div></article>`
  ).join("");
  for (const s of CATALOGO) {
    const bruta = serieDe(s);
    const el = document.getElementById(`s-mini-${cssId(s.id)}`);
    if (!bruta || !el) continue;
    const g = gMultiplos.get(s.id) ?? grafico(echarts, el);
    gMultiplos.set(s.id, g);
    g.setOption({
      ...TEMA.base,
      grid: { left: 34, right: 6, top: 6, bottom: 18 },
      tooltip: { ...TEMA.base.tooltip, trigger: "axis", formatter: (ps) => `${ps[0].axisValue}<br><b>${fmt.format(ps[0].value)}</b>` },
      xAxis: { type: "category", data: dados.agg.meses.map(rotuloMes), ...TEMA.eixoX, axisLabel: { ...TEMA.eixoX.axisLabel, interval: 11 } },
      yAxis: { type: "value", ...TEMA.eixoY, axisLabel: { ...TEMA.eixoY.axisLabel, fontSize: 9 } },
      series: [{
        type: "line", data: bruta, symbol: "none",
        lineStyle: { color: s.cor, width: 1.6 },
        areaStyle: { color: s.cor, opacity: 0.10 },
      }],
    });
  }
}

const cssId = (s) => s.replace(/[^a-z0-9]/gi, "-");
