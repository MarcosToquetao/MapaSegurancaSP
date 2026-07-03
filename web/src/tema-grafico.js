// Tema compartilhado dos gráficos ECharts (garoa + mono nos eixos).
export const SEM_MOVIMENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const TEMA = {
  base: {
    animation: !SEM_MOVIMENTO,
    textStyle: { fontFamily: "Archivo, sans-serif" },
    tooltip: {
      backgroundColor: "#1b2129",
      borderColor: "#303a46",
      textStyle: { color: "#eef2f6", fontSize: 12 },
    },
  },
  eixoX: {
    axisLabel: { color: "#6a7c8c", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" },
    axisLine: { lineStyle: { color: "#303a46" } },
    axisTick: { show: false },
  },
  eixoY: {
    axisLabel: { color: "#6a7c8c", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" },
    splitLine: { lineStyle: { color: "#232b35" } },
  },
};

export function grafico(echarts, el) {
  const g = echarts.init(el);
  new ResizeObserver(() => g.resize()).observe(el);
  return g;
}

/** rótulo "2025-03" → "mar 25" */
export function rotuloMes(m) {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[+m.slice(5) - 1]} ${m.slice(2, 4)}`;
}

export function mediaMovel(serie, janela = 3) {
  return serie.map((_, i) => {
    const ini = Math.max(0, i - janela + 1);
    const fatia = serie.slice(ini, i + 1);
    return +(fatia.reduce((a, b) => a + b, 0) / fatia.length).toFixed(1);
  });
}
