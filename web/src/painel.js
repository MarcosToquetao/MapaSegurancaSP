// Aba PAINEL — dashboard: KPIs, evolução, ranking de subprefeituras,
// composição por natureza e circunstância (conduta).
import * as echarts from "echarts";
import {
  estado, dados, ROTULOS, CORES, ORDEM_CHIPS, fmt, fmt1, anosDisponiveis, taxa100k,
} from "./estado.js";
import { TEMA, grafico, rotuloMes } from "./tema-grafico.js";

// filtros próprios da aba (não interferem no mapa)
// regiao: null = cidade | "s:ID" subprefeitura | "d:CD" distrito
const f = { categoria: "celular", natureza: null, regiao: null, ano: null };

/** dados da região selecionada: {nome, pop, cat, nat} ou null (cidade) */
function regiaoSel() {
  if (!f.regiao) return null;
  const [tipo, id] = f.regiao.split(":");
  return tipo === "s" ? dados.agg.subs[id] : dados.agg.distritos[id];
}
let gEvolucao, gRanking, gNaturezas, gCondutas;

export function initPainel() {
  f.ano = anosDisponiveis().at(-1);
  if (!dados.agg.cidade.por_categoria[f.categoria]) f.categoria = dados.agg.categorias[0];
  initFiltros();
  gEvolucao = grafico(echarts, document.getElementById("p-evolucao"));
  gRanking = grafico(echarts, document.getElementById("p-ranking"));
  gNaturezas = grafico(echarts, document.getElementById("p-naturezas"));
  gCondutas = grafico(echarts, document.getElementById("p-condutas"));
  render();
}

const idxAno = (ano) =>
  dados.agg.meses.map((m, i) => [m, i]).filter(([m]) => m.startsWith(ano)).map(([, i]) => i);

const soma = (serie, idx) => (serie ? idx.reduce((s, i) => s + serie[i], 0) : 0);

/** série da seleção atual (cidade, subprefeitura ou distrito) */
function serieSelecao() {
  const r = regiaoSel();
  if (r) return f.natureza ? r.nat[f.natureza] : r.cat[f.categoria];
  const c = dados.agg.cidade;
  return f.natureza ? c.por_natureza[f.natureza] : c.por_categoria[f.categoria];
}

function initFiltros() {
  const elCat = document.getElementById("p-categorias");
  elCat.innerHTML = ORDEM_CHIPS.filter((c) => dados.agg.categorias.includes(c)).map((c) =>
    `<button data-cat="${c}" style="--cor-chip:${CORES[c]}" class="${c === f.categoria ? "ativo" : ""}">${ROTULOS[c]}</button>`
  ).join("");
  elCat.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    elCat.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
    f.categoria = b.dataset.cat; f.natureza = null;
    preencherNaturezas(); render();
  });

  preencherNaturezas();
  document.getElementById("p-natureza").addEventListener("change", (e) => {
    f.natureza = e.target.value || null; render();
  });

  const elSub = document.getElementById("p-sub");
  const ordena = (obj) => Object.entries(obj).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  elSub.innerHTML = `<option value="">Cidade inteira</option>` +
    `<optgroup label="Subprefeituras (32)">` +
    ordena(dados.agg.subs).map(([id, s]) => `<option value="s:${id}">${s.nome}</option>`).join("") +
    `</optgroup><optgroup label="Distritos (96)">` +
    ordena(dados.agg.distritos).map(([cd, d]) => `<option value="d:${cd}">${d.nome}</option>`).join("") +
    `</optgroup>`;
  elSub.addEventListener("change", (e) => { f.regiao = e.target.value || null; render(); });

  const elAno = document.getElementById("p-ano");
  elAno.innerHTML = anosDisponiveis().reverse().map((a) => `<option>${a}</option>`).join("");
  elAno.value = f.ano;
  elAno.addEventListener("change", (e) => { f.ano = e.target.value; render(); });
}

function preencherNaturezas() {
  document.getElementById("p-natureza").innerHTML =
    `<option value="">todas as naturezas</option>` +
    dados.agg.naturezas[f.categoria].map((n) => `<option value="${n}">${n.toLowerCase()}</option>`).join("");
}

function render() {
  renderKpis();
  renderEvolucao();
  renderRanking();
  renderNaturezas();
  renderCondutas();
  document.getElementById("p-titulo-contexto").textContent =
    `· ${regiaoSel()?.nome ?? "cidade"} · série completa`;
}

function renderKpis() {
  const idx = idxAno(f.ano);
  const serie = serieSelecao();
  const total = soma(serie, idx);
  const mediaMes = total / idx.length;

  const anoAnt = String(+f.ano - 1);
  const idxAnt = idxAno(anoAnt).filter((i) =>
    idx.some((j) => dados.agg.meses[j].slice(5) === dados.agg.meses[i].slice(5)));
  const totalAnt = soma(serie, idxAnt);
  const delta = totalAnt ? ((total - totalAnt) / totalAnt) * 100 : null;

  const pop = regiaoSel()?.pop ?? 11451999;
  const taxa = taxa100k(total, pop, idx);

  document.getElementById("p-kpis").innerHTML = `
    <div class="kpi" style="--cor-kpi:${CORES[f.categoria]}">
      <div class="valor">${fmt.format(total)}</div>
      <div class="kpi-rotulo">ocorrências em ${f.ano}</div>
    </div>
    <div class="kpi">
      <div class="valor">${taxa != null ? fmt1.format(taxa) : "–"}</div>
      <div class="kpi-rotulo">por 100 mil hab./ano</div>
    </div>
    <div class="kpi">
      <div class="valor">${fmt.format(Math.round(mediaMes))}</div>
      <div class="kpi-rotulo">média por mês</div>
    </div>
    <div class="kpi">
      <div class="valor delta ${delta > 0 ? "sobe" : "desce"}" style="font-size:28px">
        ${delta == null ? "–" : (delta > 0 ? "+" : "") + fmt1.format(delta) + "%"}
      </div>
      <div class="kpi-rotulo">vs mesmos meses de ${anoAnt}</div>
    </div>`;
}

function renderEvolucao() {
  const serie = serieSelecao() ?? [];
  gEvolucao.setOption({
    ...TEMA.base,
    grid: { left: 52, right: 12, top: 16, bottom: 26 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis" },
    xAxis: { type: "category", data: dados.agg.meses.map(rotuloMes), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", data: serie, barWidth: "62%",
      itemStyle: {
        color: (p) => dados.agg.meses[p.dataIndex].startsWith(f.ano)
          ? CORES[f.categoria] : "#33363b",
        borderRadius: [3, 3, 0, 0],
      },
    }],
  }, true);
}

function renderRanking() {
  const idx = idxAno(f.ano);
  const linhas = Object.entries(dados.agg.subs).map(([id, s]) => {
    const n = soma(f.natureza ? s.nat[f.natureza] : s.cat[f.categoria], idx);
    return { nome: s.nome, n, taxa: taxa100k(n, s.pop, idx) ?? 0 };
  }).sort((a, b) => b.taxa - a.taxa);

  document.getElementById("p-ranking-sufixo").textContent = `taxa /100k · ${f.ano}`;
  gRanking.setOption({
    ...TEMA.base,
    grid: { left: 118, right: 46, top: 4, bottom: 22 },
    tooltip: {
      ...TEMA.base.tooltip,
      formatter: (p) => `<b>${p.name}</b><br>${fmt1.format(p.value)}/100k · ${fmt.format(linhas[linhas.length - 1 - p.dataIndex].n)} ocorrências`,
    },
    xAxis: { type: "value", ...TEMA.eixoX, splitLine: { lineStyle: { color: "#1f2124" } } },
    yAxis: {
      type: "category",
      data: linhas.map((l) => l.nome).reverse(),
      axisLabel: { color: "#a9adb4", fontSize: 10.5 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar", data: linhas.map((l) => +l.taxa.toFixed(1)).reverse(), barWidth: "58%",
      itemStyle: { color: CORES[f.categoria], borderRadius: [0, 3, 3, 0] },
      label: {
        show: true, position: "right", color: "#6f747c", fontSize: 9.5,
        fontFamily: "IBM Plex Mono, monospace",
      },
    }],
  }, true);
}

function renderNaturezas() {
  const idx = idxAno(f.ano);
  const fonte = regiaoSel()?.nat ?? dados.agg.cidade.por_natureza;
  const linhas = dados.agg.naturezas[f.categoria]
    .map((n) => ({ n, v: soma(fonte[n], idx) }))
    .filter((l) => l.v > 0)
    .sort((a, b) => b.v - a.v);
  gNaturezas.setOption({
    ...TEMA.base,
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => `${p.name}<br><b>${fmt.format(p.value)}</b>` },
    xAxis: { type: "value", ...TEMA.eixoX, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: "category", data: linhas.map((l) => l.n.toLowerCase()).reverse(),
      axisLabel: { color: "#a9adb4", fontSize: 10.5, width: 150, overflow: "truncate" },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar", data: linhas.map((l) => l.v).reverse(), barWidth: "55%",
      itemStyle: { color: CORES[f.categoria], borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: "right", color: "#a9adb4", fontSize: 10, fontFamily: "IBM Plex Mono, monospace", formatter: (p) => fmt.format(p.value) },
    }],
  }, true);
}

function renderCondutas() {
  const idx = idxAno(f.ano);
  const porCat = dados.agg.cidade.por_conduta[["roubos", "furtos", "celular"].includes(f.categoria) ? f.categoria : "roubos"] ?? {};
  const linhas = Object.entries(porCat)
    .map(([c, serie]) => ({ c, v: soma(serie, idx) }))
    .filter((l) => l.v > 0).sort((a, b) => b.v - a.v);
  gCondutas.setOption({
    ...TEMA.base,
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => `${p.name}<br><b>${fmt.format(p.value)}</b> (${p.percent}%)` },
    legend: { show: false },
    series: [{
      type: "pie", radius: ["44%", "72%"], center: ["50%", "50%"],
      data: linhas.map((l, i) => ({
        name: l.c, value: l.v,
        // tons do tricolor: vermelhos, vinhos, pratas e brancos
        itemStyle: { color: ["#e8112d", "#9aa5b1", "#a41220", "#f5f6f8", "#ff5147", "#6b737d", "#7c0e18", "#c9d0d8"][i % 8] },
      })),
      label: { color: "#a9adb4", fontSize: 10.5, formatter: "{b}" },
      labelLine: { lineStyle: { color: "#2c2e33" } },
      itemStyle: { borderColor: "#161719", borderWidth: 2 },
    }],
  }, true);
}
