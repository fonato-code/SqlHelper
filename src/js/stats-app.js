/* global Vue, SqlHelp */
(function () {
  'use strict';
  const { createApp } = Vue;
  const S = SqlHelp;

  createApp({
    data() {
      return {
        theme: localStorage.getItem('sqlhelp-theme') || 'dark',
        statsRawInput: '',
        statsParsed: false,
        statsParseError: '',
        statsResult: null,
        toastMessage: ''
      };
    },
    methods: {
      formatMs(ms) {
        const n = Number(ms) || 0;
        return n + ' ms';
      },
      formatInt(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        return v.toLocaleString('pt-BR');
      },
      barPercent(value, max) {
        const v = Number(value) || 0;
        const m = Number(max) || 1;
        return Math.min(100, Math.round((v / m) * 100));
      },
      hotRowClass(elapsedMs) {
        const e = Number(elapsedMs) || 0;
        const threshold = this.statsResult?.elapsedThreshold || 50;
        if (e >= threshold * 2) return 'hot-high';
        if (e >= threshold) return 'hot-med';
        if (e > 0) return 'hot-low';
        return '';
      },
      loadStatsSample() {
        this.statsRawInput = S.SAMPLE_STATISTICS;
        this.statsParseError = '';
      },
      async parseStatsInputFromClipboard() {
        this.statsParseError = '';
        try {
          const text = await S.readClipboardText();
          if (!text.trim()) {
            this.statsParseError = 'Área de transferência vazia. Copie o resultado de STATISTICS IO/TIME antes de clicar.';
            return;
          }
          this.statsRawInput = text;
          this.parseStatsInput();
        } catch (e) {
          this.statsParseError = S.clipboardErrorMessage(e);
        }
      },
      parseStatsInput() {
        this.statsParseError = '';
        try {
          this.statsResult = S.parseStatisticsOutput(this.statsRawInput);
          this.statsParsed = true;
        } catch (e) {
          this.statsParsed = false;
          this.statsResult = null;
          this.statsParseError = e.message || 'Erro ao analisar estatísticas.';
        }
      },
      resetStats() {
        this.statsParsed = false;
        this.statsResult = null;
        this.statsParseError = '';
      },
      showToast(msg) {
        S.showToast(this, msg);
      }
    },
    mixins: [S.themeMixin]
  }).mount('#app');
})();
