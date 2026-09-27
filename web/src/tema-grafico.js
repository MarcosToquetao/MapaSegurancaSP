// Tema compartilhado dos gráficos ECharts (concreto claro + mono nos eixos).
export const SEM_MOVIMENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;

const MONO = "JetBrains Mono, monospace";
export const COR = { texto: "#15171C", texto2: "#4B4A45", texto3: "#62605A", linha: "#E7E5E0", apagado: "#E2E0DA", placa: "#1C4A94" };

export const TEMA = {
  base: {
    animation: !SEM_MOVIMENTO,
    aria: { enabled: true, decal: { show: false } }, // descrição textual gerada para leitores de tela
    textStyle: { fontFamily: "Public Sans, sans-serif", color: COR.texto2 },
    tooltip: {
      backgroundColor: "#FFFFFF",
      borderColor: "#CFCDC7",
      textStyle: { color: COR.texto, fontSize: 12 },
      extraCssText: "box-shadow:0 4px 16px rgba(21,23,28,.14);border-radius:8px;",
    },
  },
  eixoX: {
    axisLabel: { color: COR.texto3, fontSize: 10, fontFamily: MONO },
    axisLine: { lineStyle: { color: "#CFCDC7" } },
    axisTick: { show: false },
  },
  eixoY: {
    axisLabel: { color: COR.texto3, fontSize: 10, fontFamily: MONO },
    splitLine: { lineStyle: { color: COR.linha } },
  },
  rotulo: { color: COR.texto2, fontSize: 10, fontFamily: MONO },
};

// Rampas sequenciais: baixo = claro, alto = escuro (mais crime = mais escuro).
export const RAMPA_GRAVE = ["#FBE8A6", "#F4B454", "#E0702F", "#B8341F", "#6E1414"];
export const RAMPA_GRAVE_ROSA = ["#FBE7EF", "#F2A7C0", "#D94A7B", "#9C1F55", "#5A0B2E"];

export function grafico(echarts, el) {
  const g = echarts.init(el);
  // o container pode ser medido antes do layout assentar (aba recém-exibida):
  // re-mede no próximo frame e sempre que o tamanho mudar de fato.
  requestAnimationFrame(() => g.resize());
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
    // ignora meses sem dado (null) em vez de tratar como zero — evita uma
    // "rampa" falsa quando a série só começa a existir no meio do eixo
    const fatia = serie.slice(ini, i + 1).filter((v) => v != null);
    if (!fatia.length) return null;
    return +(fatia.reduce((a, b) => a + b, 0) / fatia.length).toFixed(1);
  });
}
