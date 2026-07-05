// Aba HORÁRIOS — quando os crimes acontecem: heatmap semana×hora,
// perfil 24h e ranking de distritos por período do dia.
// Base: série completa 2022–2026 (hora do fato; cobertura em nota).
import * as echarts from "echarts";
import { dados, GRUPOS, PERIODOS_DIA, vetorHorarioDoGrupo, fmt, fmt1 } from "./estado.js";
import { TEMA, grafico, RAMPA_GRAVE } from "./tema-grafico.js";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const f = { grupo: "celular-roubo", periodo: 3 }; // ranking abre à noite
let gSemana, gPerfil, gRanking;

const grupoSel = () => GRUPOS.find((g) => g.id === f.grupo);

export function initHorarios() {
  const elG = document.getElementById("h-grupos");
  elG.innerHTML = GRUPOS.map((g) =>
    `<button data-g="${g.id}" style="--cor-chip:${g.cor}" class="${g.id === f.grupo ? "ativo" : ""}">${g.rotulo}</button>`
  ).join("");
  elG.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    elG.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
    f.grupo = b.dataset.g;
    render();
  });

  const elP = document.getElementById("h-periodos");
  elP.innerHTML = PERIODOS_DIA.map((p, i) =>
    `<button data-p="${i}" class="${i === f.periodo ? "ativo" : ""}">${p}</button>`).join("");
  elP.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    elP.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
    f.periodo = +b.dataset.p;
    renderRanking();
  });

  gSemana = grafico(echarts, document.getElementById("h-semana"));
  gPerfil = grafico(echarts, document.getElementById("h-perfil"));
  gRanking = grafico(echarts, document.getElementById("h-ranking"));

  const h = dados.agg.horarios;
  document.getElementById("h-cobertura").textContent =
    `Hora exata conhecida em ${Math.round(h.cobertura_hora * 100)}% dos registros ` +
    `(período do dia em ${Math.round(h.cobertura_periodo * 100)}%); ` +
    `os gráficos usam só os registros com horário informado, série 2022–2026. ` +
    `Atenção: a hora é a do fato relatado no BO — furtos percebidos depois ` +
    `(ex.: ao acordar) puxam contagens para certos horários.`;
  render();
}

function render() {
  const g = grupoSel();
  document.getElementById("h-contexto").textContent = `· ${g.rotulo} · 2022–2026`;
  renderSemana();
  renderPerfil();
  renderRanking();
}

function renderSemana() {
  const g = grupoSel();
  const flat = vetorHorarioDoGrupo(dados.agg.horarios.semana, g, 168);
  const celulas = [];
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) celulas.push([h, d, flat[d * 24 + h]]);
  const max = Math.max(...flat, 1);

  gSemana.setOption({
    ...TEMA.base,
    grid: { left: 44, right: 70, top: 12, bottom: 30 },
    tooltip: {
      ...TEMA.base.tooltip,
      formatter: (p) => `${DIAS[p.value[1]]} ${String(p.value[0]).padStart(2, "0")}h<br><b>${fmt.format(p.value[2])}</b> ocorrências`,
    },
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => `${h}h`), ...TEMA.eixoX, splitArea: { show: false } },
    yAxis: { type: "category", data: DIAS, ...TEMA.eixoY, splitLine: { show: false } },
    visualMap: {
      min: 0, max, calculable: false, orient: "vertical", right: 4, top: "center",
      itemHeight: 120, text: ["mais", "menos"], textStyle: { color: "#6f747c", fontSize: 9 },
      // escuro = mais grave: pálido (poucas ocorrências) → vermelho profundo (pico)
      inRange: { color: RAMPA_GRAVE },
    },
    series: [{
      type: "heatmap", data: celulas,
      itemStyle: { borderColor: "#0d0e10", borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: "#ffffff", borderWidth: 1 } },
    }],
  }, true);
}

function renderPerfil() {
  const g = grupoSel();
  const v = vetorHorarioDoGrupo(dados.agg.horarios.hora, g, 24);
  gPerfil.setOption({
    ...TEMA.base,
    grid: { left: 46, right: 10, top: 12, bottom: 24 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis",
      formatter: (ps) => `${ps[0].axisValue}<br><b>${fmt.format(ps[0].value)}</b> ocorrências` },
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => `${h}h`), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", data: v, barWidth: "70%",
      itemStyle: { color: g.cor, borderRadius: [2, 2, 0, 0] },
    }],
  }, true);
}

function renderRanking() {
  const g = grupoSel();
  document.getElementById("h-ranking-sufixo").textContent =
    `taxa /100k · ${PERIODOS_DIA[f.periodo]}`;

  const dp = dados.agg.horarios.distrito_periodo;
  const nats = g.nat ? [g.nat] : dados.agg.naturezas[g.cat] ?? [];
  const linhas = Object.entries(dp).map(([cd, porNat]) => {
    let n = 0;
    for (const nat of nats) n += porNat[nat]?.[f.periodo] ?? 0;
    const info = dados.agg.distritos[cd];
    if (!info?.pop) return null;
    return { nome: info.nome, n, taxa: (n / info.pop) * 100000 };
  }).filter(Boolean).sort((a, b) => b.taxa - a.taxa).slice(0, 10);

  gRanking.setOption({
    ...TEMA.base,
    grid: { left: 110, right: 40, top: 4, bottom: 18 },
    tooltip: { ...TEMA.base.tooltip,
      formatter: (p) => { const l = linhas[linhas.length - 1 - p.dataIndex]; return `<b>${l.nome}</b><br>${fmt1.format(l.taxa)}/100k (2022–26, ${PERIODOS_DIA[f.periodo]})<br>${fmt.format(l.n)} ocorrências`; } },
    xAxis: { type: "value", ...TEMA.eixoX, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: { type: "category", data: linhas.map((l) => l.nome).reverse(),
      axisLabel: { color: "#a9adb4", fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", data: linhas.map((l) => +l.taxa.toFixed(1)).reverse(), barWidth: "58%",
      itemStyle: { color: g.cor, borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: "right", color: "#6f747c", fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace" },
    }],
  }, true);
}
