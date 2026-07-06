// Orquestração: carrega dados, registra protocolo PMTiles, monta abas e views.
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { estado, dados, anosDisponiveis } from "./estado.js";
import { initMapa } from "./mapa.js";
import { initPainel } from "./painel.js";
import { initSeries } from "./series.js";
import { initHorarios } from "./horarios.js";
import { initMulheres } from "./mulheres.js";
import "./style.css";

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const iniciadas = new Set();

function initAbas() {
  const nav = document.getElementById("abas");
  nav.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const aba = b.dataset.aba;
    nav.querySelectorAll("button").forEach((x) =>
      x.setAttribute("aria-selected", x === b ? "true" : "false"));
    document.querySelectorAll(".view").forEach((v) => {
      const ativa = v.id === `view-${aba}`;
      v.classList.toggle("ativa", ativa);
      v.hidden = !ativa;
    });
    // inicialização preguiçosa: cada aba monta na primeira visita
    if (!iniciadas.has(aba)) {
      iniciadas.add(aba);
      if (aba === "painel") initPainel();
      if (aba === "series") initSeries();
      if (aba === "horarios") initHorarios();
      if (aba === "mulheres") initMulheres();
    }
  });
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
  estado.ano = anosDisponiveis().at(-1);
  // se os agregados ainda não trazem a categoria default, recua para a primeira
  if (!agg.cidade.por_categoria[estado.categoria]) estado.categoria = agg.categorias[0];

  initAbas();
  iniciadas.add("mapa");
  initMapa();

  const dlg = document.getElementById("dialogo-contato");
  document.getElementById("abrir-contato").addEventListener("click", () => dlg.showModal());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
})();
