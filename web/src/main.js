// Orquestração: carrega dados, registra PMTiles, monta seções e navegação.
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { estado, dados, anosDisponiveis, lerURL, mudar, MESES } from "./estado.js";
import { initMapa } from "./mapa.js";
import { initPainel } from "./painel.js";
import { initSeries } from "./series.js";
import { initMulheres } from "./mulheres.js";
import "./style.css";

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const INITS = { explorar: initPainel, tendencias: initSeries, mulheres: initMulheres };
const iniciadas = new Set(["mapa"]);

function irPara(aba) {
  document.querySelectorAll("#abas button").forEach((x) =>
    x.setAttribute("aria-selected", x.dataset.aba === aba ? "true" : "false"));
  document.querySelectorAll(".view").forEach((v) => {
    const ativa = v.id === `view-${aba}`;
    v.classList.toggle("ativa", ativa);
    v.hidden = !ativa;
  });
  // inicialização preguiçosa: cada seção monta na primeira visita
  if (!iniciadas.has(aba)) { iniciadas.add(aba); INITS[aba]?.(); }
  mudar({ aba });
}

(async function boot() {
  const [agg, distritos, pontosMeta] = await Promise.all([
    fetch("data/agg.json").then((r) => r.json()),
    fetch("data/distritos.geojson").then((r) => r.json()),
    fetch("data/points_meta.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  dados.agg = agg;
  dados.distritos = distritos;
  dados.pontosMeta = pontosMeta;
  lerURL();
  if (!anosDisponiveis().includes(estado.ano)) estado.ano = anosDisponiveis().at(-1);

  const ult = agg.meses.at(-1);
  document.getElementById("sobre-atualizado").textContent =
    `Dados até ${MESES[+ult.slice(5) - 1]}/${ult.slice(0, 4)}, atualizados todo mês.`;

  initMapa();
  document.getElementById("abas").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) irPara(b.dataset.aba);
  });
  irPara(estado.aba);
  // voltar/avançar do navegador e links com #secao (replaceState não dispara isto)
  addEventListener("hashchange", () => { lerURL(); irPara(estado.aba); });

  const dlg = document.getElementById("dialogo-sobre");
  document.getElementById("abrir-sobre").addEventListener("click", () => dlg.showModal());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
})();
