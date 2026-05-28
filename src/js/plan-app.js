/* global Vue, SqlHelp */
(function () {
  'use strict';
  const { createApp } = Vue;
  const S = SqlHelp;

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.1;

  const PlanDiagramCanvas = {
    name: 'PlanDiagramCanvas',
    props: {
      layout: { type: Object, default: null }
    },
    inject: ['planUi'],
    template: `
      <svg v-if="layout && layout.nodes.length"
           class="plan-diagram-svg"
           :viewBox="'0 0 ' + layout.width + ' ' + layout.height"
           preserveAspectRatio="xMinYMin meet">
        <defs>
          <marker id="plan-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4"
                  orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 z" class="plan-arrow-head"/>
          </marker>
        </defs>
        <g class="plan-edges">
          <path v-for="(edge, i) in layout.edges" :key="'e-' + i"
                :d="edge.path"
                class="plan-edge"
                :stroke-width="edge.strokeWidth"
                marker-end="url(#plan-arrow)"
                fill="none"/>
        </g>
        <g class="plan-nodes">
          <g v-for="n in layout.nodes" :key="n.id"
             :transform="'translate(' + n.x + ',' + n.y + ')'"
             :class="planUi.nodeVisualClass(n.data)">
            <rect class="plan-node-rect" :width="n.w" :height="n.h" rx="4"/>
            <text class="plan-node-cost-badge" :x="n.w/2" y="14" text-anchor="middle">
              {{ planUi.formatPct(n.data.costPercent) }}
            </text>
            <text class="plan-node-op-text" :x="n.w/2" y="30" text-anchor="middle">
              {{ truncate(n.data.physicalOp, 22) }}
            </text>
            <text v-if="n.data.objectRef && n.data.objectRef.table"
                  class="plan-node-table-text" :x="n.w/2" y="44" text-anchor="middle">
              {{ truncate(n.data.objectRef.table, 20) }}
            </text>
            <text class="plan-node-rows-text" :x="n.w/2" y="62" text-anchor="middle">
              est {{ planUi.formatInt(n.data.estimateRows) }}
              <tspan v-if="n.data.actualRows != null"> · act {{ planUi.formatInt(n.data.actualRows) }}</tspan>
            </text>
          </g>
        </g>
      </svg>
      <p v-else class="text-muted small mb-0 p-3">Plano sem operadores RelOp.</p>
    `,
    methods: {
      truncate(s, max) {
        const t = String(s || '');
        return t.length > max ? t.slice(0, max - 1) + '…' : t;
      }
    }
  };

  createApp({
    components: { PlanDiagramCanvas },
    provide() {
      return {
        planUi: {
          formatPct: (n) => this.formatPct(n),
          formatInt: (n) => this.formatInt(n),
          nodeVisualClass: (node) => S.planNodeVisualClass(node)
        }
      };
    },
    data() {
      return {
        theme: localStorage.getItem('sqlhelp-theme') || 'dark',
        planRawXml: '',
        planParsed: false,
        planParseError: '',
        planResult: null,
        selectedStatementId: null,
        planTab: 'diagram',
        diagramZoom: 1,
        diagramPan: { x: 0, y: 0 },
        diagramFullscreen: false,
        diagramLayout: null,
        fileName: '',
        toastMessage: ''
      };
    },
    computed: {
      selectedStatement() {
        if (!this.planResult || !this.selectedStatementId) return null;
        return (
          this.planResult.statements.find((s) => s.statementId === this.selectedStatementId) ||
          this.planResult.statements[0] ||
          null
        );
      },
      highlightedSql() {
        const st = this.selectedStatement;
        if (!st) return '';
        return S.highlightPlanSql(st.statementText);
      },
      diagramZoomPct() {
        return Math.round(this.diagramZoom * 100);
      },
      diagramStageStyle() {
        return {
          transform: `translate(${this.diagramPan.x}px, ${this.diagramPan.y}px) scale(${this.diagramZoom})`,
          transformOrigin: '0 0'
        };
      }
    },
    watch: {
      selectedStatement: {
        handler(st) {
          this.updateDiagramLayout(st);
          this.$nextTick(() => this.diagramFitToView());
        },
        immediate: true
      }
    },
    mounted() {
      this._onDiagramKeydown = (e) => {
        if (e.key === 'Escape' && this.diagramFullscreen) this.closeDiagramFullscreen();
      };
      document.addEventListener('keydown', this._onDiagramKeydown);
      this._onFullscreenChange = () => {
        if (!document.fullscreenElement && this.diagramFullscreen) {
          this.diagramFullscreen = false;
        }
      };
      document.addEventListener('fullscreenchange', this._onFullscreenChange);
    },
    unmounted() {
      document.removeEventListener('keydown', this._onDiagramKeydown);
      document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    },
    methods: {
      formatCost(cost) {
        const v = Number(cost);
        if (!Number.isFinite(v)) return '—';
        if (v >= 1) return v.toFixed(3);
        if (v >= 0.001) return v.toFixed(4);
        return v.toExponential(2);
      },
      formatInt(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        return v.toLocaleString('pt-BR');
      },
      formatPct(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        return v.toFixed(1) + '%';
      },
      rowClass(stmt) {
        if (stmt.rowMismatch === 'high') return 'plan-row-mismatch-high';
        if (stmt.rowMismatch === 'medium') return 'plan-row-mismatch-med';
        if ((stmt.issues || []).some((i) => i.severity === 'danger')) return 'plan-row-issue';
        return '';
      },
      updateDiagramLayout(st) {
        if (st && st.planRoot) {
          this.diagramLayout = S.layoutPlanDiagram(st.planRoot);
        } else {
          this.diagramLayout = null;
        }
      },
      getDiagramViewportEl() {
        return this.$refs.diagramViewport;
      },
      onDiagramWheel(ev) {
        const vp = this.getDiagramViewportEl();
        if (!vp) return;
        ev.preventDefault();
        const rect = vp.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const delta = ev.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.diagramZoom + delta));
        if (newZoom === this.diagramZoom) return;
        const ratio = newZoom / this.diagramZoom;
        this.diagramPan = {
          x: mx - (mx - this.diagramPan.x) * ratio,
          y: my - (my - this.diagramPan.y) * ratio
        };
        this.diagramZoom = newZoom;
      },
      zoomIn() {
        this.applyZoomAtCenter(this.diagramZoom + ZOOM_STEP);
      },
      zoomOut() {
        this.applyZoomAtCenter(this.diagramZoom - ZOOM_STEP);
      },
      zoomReset() {
        this.diagramZoom = 1;
        this.diagramPan = { x: 0, y: 0 };
      },
      applyZoomAtCenter(newZoom) {
        const vp = this.getDiagramViewportEl();
        if (!vp) {
          this.diagramZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
          return;
        }
        const rect = vp.getBoundingClientRect();
        const mx = rect.width / 2;
        const my = rect.height / 2;
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
        const ratio = clamped / this.diagramZoom;
        this.diagramPan = {
          x: mx - (mx - this.diagramPan.x) * ratio,
          y: my - (my - this.diagramPan.y) * ratio
        };
        this.diagramZoom = clamped;
      },
      diagramFitToView() {
        const vp = this.getDiagramViewportEl();
        if (!vp || !this.diagramLayout) return;
        const rect = vp.getBoundingClientRect();
        const pad = 16;
        const scaleX = (rect.width - pad * 2) / this.diagramLayout.width;
        const scaleY = (rect.height - pad * 2) / this.diagramLayout.height;
        const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(scaleX, scaleY)));
        this.diagramZoom = scale;
        const contentW = this.diagramLayout.width * scale;
        const contentH = this.diagramLayout.height * scale;
        this.diagramPan = {
          x: (rect.width - contentW) / 2,
          y: (rect.height - contentH) / 2
        };
      },
      toggleDiagramFullscreen() {
        if (this.diagramFullscreen) {
          this.closeDiagramFullscreen();
        } else {
          this.diagramFullscreen = true;
          this.$nextTick(() => {
            const el = this.$refs.diagramShell;
            if (el && el.requestFullscreen) {
              el.requestFullscreen().catch(() => {});
            }
            this.diagramFitToView();
          });
        }
      },
      closeDiagramFullscreen() {
        this.diagramFullscreen = false;
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        this.$nextTick(() => this.diagramFitToView());
      },
      selectStatement(stmt) {
        this.selectedStatementId = stmt.statementId;
        this.planTab = 'diagram';
      },
      onFileChange(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        this.fileName = file.name;
        const reader = new FileReader();
        reader.onload = () => {
          this.planRawXml = reader.result;
          this.parsePlanInput();
        };
        reader.onerror = () => {
          this.planParseError = 'Erro ao ler o arquivo.';
        };
        reader.readAsText(file, 'UTF-8');
        ev.target.value = '';
      },
      async loadPlanSample() {
        this.planParseError = '';
        if (location.protocol === 'file:') {
          this.planParseError =
            'Página aberta como arquivo local (file://). Use Importar arquivo e selecione samples/Plano de execução.xml, ou sirva a pasta com um servidor HTTP (Live Server, etc.).';
          return;
        }
        try {
          const res = await fetch(S.PLAN_SAMPLE_PATH);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.planRawXml = await res.text();
          this.fileName = 'Plano de execução.xml (exemplo)';
          this.parsePlanInput();
        } catch (e) {
          this.planParseError =
            'Não foi possível carregar o exemplo. Use Importar arquivo com samples/Plano de execução.xml.';
        }
      },
      parsePlanInput() {
        this.planParseError = '';
        try {
          this.planResult = S.parseShowPlanXml(this.planRawXml);
          this.planParsed = true;
          const costliest = this.planResult.statements.reduce((a, b) =>
            (b.statementCost || 0) > (a.statementCost || 0) ? b : a
          );
          this.selectedStatementId = costliest.statementId;
        } catch (e) {
          this.planParsed = false;
          this.planResult = null;
          this.planParseError = e.message || 'Erro ao analisar plano.';
        }
      },
      resetPlan() {
        this.planParsed = false;
        this.planResult = null;
        this.planParseError = '';
        this.planRawXml = '';
        this.fileName = '';
        this.selectedStatementId = null;
        this.diagramLayout = null;
      },
      issueIcon(severity) {
        if (severity === 'danger') return 'fa-exclamation-circle text-danger';
        if (severity === 'warning') return 'fa-exclamation-triangle text-warning';
        return 'fa-info-circle text-info';
      },
      showToast(msg) {
        S.showToast(this, msg);
      }
    },
    mixins: [S.themeMixin]
  }).mount('#app');
})();
