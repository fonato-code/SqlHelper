/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  const { createApp } = Vue;
  const S = SqlHelp;

  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 8;
  const ZOOM_STEP = 0.12;
  const PAN_DRAG_THRESHOLD = 5;

  const PlanDiagramCanvas = {
    name: 'PlanDiagramCanvas',
    props: {
      layout: { type: Object, default: null }
    },
    inject: ['planUi'],
    template: `
      <svg v-if="layout && layout.nodes.length"
           class="plan-diagram-svg"
           :width="layout.width"
           :height="layout.height"
           :viewBox="'0 0 ' + layout.width + ' ' + layout.height">
        <defs>
          <marker id="plan-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3"
                  orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L5,3 L0,6 z" class="plan-arrow-head"/>
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
             class="plan-node-group"
             :transform="'translate(' + n.x + ',' + n.y + ')'"
             :class="planUi.nodeVisualClass(n.data)"
             :data-node-id="n.id"
             :title="planUi.nodeGroupTitle(n.data)">
            <rect class="plan-node-rect" :width="n.w" :height="n.h" rx="4"/>
            <image v-if="planUi.operatorIconUrl(n.data)"
                   class="plan-node-op-icon"
                   :href="planUi.operatorIconUrl(n.data)"
                   x="8" y="10" width="28" height="28"
                   @error="planUi.onOperatorIconError($event, n.data)"/>
            <g v-if="planUi.nodeAlertCount(n.data) > 0"
               class="plan-node-alert-badge"
               :transform="'translate(' + (n.w - 20) + ', 2)'"
               :title="planUi.nodeAlertCount(n.data) + ' alerta(s)'">
              <path d="M0,14 L7,0 L14,14 Z" class="plan-node-alert-triangle"/>
              <text x="7" y="12" text-anchor="middle" class="plan-node-alert-count">
                {{ planUi.nodeAlertCount(n.data) > 9 ? '9+' : planUi.nodeAlertCount(n.data) }}
              </text>
            </g>
            <text class="plan-node-cost-badge" :x="n.w/2" y="16" text-anchor="middle">
              {{ planUi.formatPct(n.data.costPercent) }}
            </text>
            <text class="plan-node-op-text" x="44" y="36" text-anchor="start">
              {{ truncate(n.data.physicalOp, 22) }}
            </text>
            <text v-if="n.data.objectRef && n.data.objectRef.table"
                  class="plan-node-table-text" x="44"
                  :y="n.data.objectRef.index ? 52 : 54" text-anchor="start">
              {{ truncate(planUi.formatPlanObjectTable(n.data.objectRef), 24) }}
            </text>
            <text v-if="n.data.objectRef && n.data.objectRef.index"
                  class="plan-node-index-text" x="44" y="66" text-anchor="start">
              {{ truncate(planUi.formatPlanObjectIndex(n.data.objectRef), 24) }}
            </text>
            <text class="plan-node-rows-text" x="44"
                  :y="n.data.objectRef && n.data.objectRef.index ? 84 : (n.data.objectRef && n.data.objectRef.table ? 72 : 82)"
                  text-anchor="start">
              est {{ planUi.formatPlanRows(n.data.estimateRows) }}
              <tspan v-if="n.data.actualRows != null"> · act {{ planUi.formatPlanRows(n.data.actualRows) }}</tspan>
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
          formatPlanRows: (n) => this.formatPlanRows(n),
          formatPlanObjectTable: (obj) => S.formatPlanObjectTable(obj),
          formatPlanObjectIndex: (obj) => S.formatPlanObjectIndex(obj),
          nodeVisualClass: (node) => S.planNodeVisualClass(node),
          nodeAlertCount: (node) => {
            const st = this.selectedStatement;
            return S.getNodeAlertCount(node, st ? st.issues : []);
          },
          operatorIconUrl: (node) => this.operatorIconUrl(node),
          onOperatorIconError: (ev, node) => this.onOperatorIconError(ev, node),
          nodeGroupTitle: (node) => this.nodeGroupTitle(node),
          onNodeDblClick: (node) => this.openPlanNodeModal(node)
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
        diagramPanDragging: false,
        diagramCostMode: (function () {
          const m = localStorage.getItem('sqlhelp-plan-cost-mode');
          const valid = (S.DIAGRAM_COST_MODES || []).map((o) => o.id);
          return valid.includes(m) ? m : 'both';
        })(),
        diagramCostScope: (function () {
          const s = localStorage.getItem('sqlhelp-plan-cost-scope');
          return s === 'perNode' ? 'perNode' : 'cumulative';
        })(),
        diagramContextMenuOpen: false,
        diagramContextMenuX: 0,
        diagramContextMenuY: 0,
        fileName: '',
        toastMessage: '',
        planNodeDetail: null,
        planNodeModalInstance: null
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
        const text = st.statementTextDisplay != null ? st.statementTextDisplay : st.statementText;
        return S.highlightPlanSql(text);
      },
      statementSqlText() {
        const st = this.selectedStatement;
        if (!st) return '';
        return st.statementTextDisplay != null ? st.statementTextDisplay : String(st.statementText || '');
      },
      statementSqlLineCount() {
        const t = this.statementSqlText;
        if (!t) return 0;
        return t.split(/\r?\n/).length;
      },
      statementSqlCharCount() {
        return this.statementSqlText.length;
      },
      planStatementTextLimit() {
        return 4000;
      },
      planStatementTruncatedMarker() {
        return S.PLAN_STATEMENT_TRUNCATED_MARKER || '/*...<TRUNCATED>...*/';
      },
      diagramZoomPct() {
        return Math.round(this.diagramZoom * 100);
      },
      diagramStageStyle() {
        return {
          transform: `translate(${this.diagramPan.x}px, ${this.diagramPan.y}px) scale(${this.diagramZoom})`,
          transformOrigin: '0 0'
        };
      },
      diagramCostOptions() {
        return S.DIAGRAM_COST_MODES || [];
      },
      diagramCostScopeOptions() {
        return S.DIAGRAM_COST_SCOPES || [];
      },
      diagramCostModeLabel() {
        const opt = (S.DIAGRAM_COST_MODES || []).find((o) => o.id === this.diagramCostMode);
        const scope = (S.DIAGRAM_COST_SCOPES || []).find((o) => o.id === this.diagramCostScope);
        const modeLabel = opt ? opt.label : 'I/O + CPU';
        const scopeShort = this.diagramCostScope === 'perNode' ? 'por nó' : 'cumulativo';
        return modeLabel + ' · ' + scopeShort;
      },
      diagramCanvasKey() {
        return this.diagramCostMode + '-' + this.diagramCostScope;
      }
    },
    watch: {
      selectedStatement: {
        handler(st) {
          this.updateDiagramLayout(st);
          this.scheduleDiagramFit();
        },
        immediate: true
      },
      planTab(val) {
        if (val === 'diagram') this.scheduleDiagramFit();
      },
      diagramLayout(newVal, oldVal) {
        if (!newVal) return;
        if (!oldVal || newVal.width !== oldVal.width || newVal.height !== oldVal.height) {
          this.scheduleDiagramFit();
        }
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
      this._onDiagramPanMove = (e) => this.onDiagramPanMove(e);
      this._onDiagramPanEnd = () => this.onDiagramPanEnd();
      this._onDocumentClickCloseMenu = () => this.closeDiagramContextMenu();
      document.addEventListener('click', this._onDocumentClickCloseMenu);
      this.scheduleDiagramFit();
    },
    unmounted() {
      document.removeEventListener('keydown', this._onDiagramKeydown);
      document.removeEventListener('fullscreenchange', this._onFullscreenChange);
      document.removeEventListener('click', this._onDocumentClickCloseMenu);
      this.detachDiagramPanListeners();
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
      formatPlanRows(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        return Math.round(v).toLocaleString('pt-BR', {
          maximumFractionDigits: 0,
          useGrouping: false
        });
      },
      formatPct(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        return v.toFixed(1) + '%';
      },
      formatPlanExprHtml(content) {
        return S.formatPlanExprHtml(content);
      },
      rowClass(stmt) {
        if (stmt.rowMismatch === 'high') return 'plan-row-mismatch-high';
        if (stmt.rowMismatch === 'medium') return 'plan-row-mismatch-med';
        if ((stmt.issues || []).some((i) => i.severity === 'danger')) return 'plan-row-issue';
        return '';
      },
      applyDiagramCosts() {
        const st = this.selectedStatement;
        if (st && st.planRoot) {
          S.applyDiagramCostMode(
            st.planRoot,
            this.diagramCostMode,
            st.statementCost,
            this.diagramCostScope
          );
        }
      },
      updateDiagramLayout(st) {
        if (st && st.planRoot) {
          S.applyDiagramCostMode(
            st.planRoot,
            this.diagramCostMode,
            st.statementCost,
            this.diagramCostScope
          );
          this.diagramLayout = S.layoutPlanDiagram(st.planRoot);
        } else {
          this.diagramLayout = null;
        }
      },
      closeDiagramContextMenu() {
        this.diagramContextMenuOpen = false;
      },
      onDiagramContextMenu(ev) {
        const vp = this.getDiagramViewportEl();
        if (!vp || !ev.target.closest('.plan-diagram-viewport')) return;
        ev.preventDefault();
        this.diagramContextMenuX = ev.clientX;
        this.diagramContextMenuY = ev.clientY;
        this.diagramContextMenuOpen = true;
      },
      setDiagramCostMode(mode) {
        const valid = (S.DIAGRAM_COST_MODES || []).map((o) => o.id);
        if (!valid.includes(mode)) return;
        this.diagramCostMode = mode;
        localStorage.setItem('sqlhelp-plan-cost-mode', mode);
        this.applyDiagramCosts();
        this.closeDiagramContextMenu();
      },
      setDiagramCostScope(scope) {
        const valid = (S.DIAGRAM_COST_SCOPES || []).map((o) => o.id);
        if (!valid.includes(scope)) return;
        this.diagramCostScope = scope;
        localStorage.setItem('sqlhelp-plan-cost-scope', scope);
        this.applyDiagramCosts();
      },
      getDiagramViewportEl() {
        return this.$refs.diagramViewport;
      },
      detachDiagramPanListeners() {
        document.removeEventListener('mousemove', this._onDiagramPanMove);
        document.removeEventListener('mouseup', this._onDiagramPanEnd);
        this._diagramDrag = null;
        this.diagramPanDragging = false;
      },
      onDiagramPanStart(ev) {
        if (ev.button !== 0) return;
        const vp = this.getDiagramViewportEl();
        if (!vp || !ev.target.closest('.plan-diagram-viewport')) return;
        this._diagramDrag = {
          clientX: ev.clientX,
          clientY: ev.clientY,
          panX: this.diagramPan.x,
          panY: this.diagramPan.y,
          started: false
        };
        document.addEventListener('mousemove', this._onDiagramPanMove);
        document.addEventListener('mouseup', this._onDiagramPanEnd);
      },
      onDiagramPanMove(ev) {
        if (!this._diagramDrag) return;
        const dx = ev.clientX - this._diagramDrag.clientX;
        const dy = ev.clientY - this._diagramDrag.clientY;
        if (!this._diagramDrag.started) {
          if (Math.hypot(dx, dy) < PAN_DRAG_THRESHOLD) return;
          this._diagramDrag.started = true;
          this.diagramPanDragging = true;
        }
        ev.preventDefault();
        this.diagramPan = {
          x: this._diagramDrag.panX + dx,
          y: this._diagramDrag.panY + dy
        };
      },
      onDiagramDblClick(ev) {
        const vp = this.getDiagramViewportEl();
        if (!vp || !ev.target.closest('.plan-diagram-viewport')) return;
        const group = ev.target.closest('.plan-node-group');
        if (!group) return;
        ev.preventDefault();
        ev.stopPropagation();
        this.detachDiagramPanListeners();
        const nodeId = group.getAttribute('data-node-id');
        const layout = this.diagramLayout;
        if (!layout || !nodeId) return;
        const item = layout.nodes.find((n) => n.id === nodeId);
        if (item && item.data) this.openPlanNodeModal(item.data);
      },
      onDiagramPanEnd() {
        this.detachDiagramPanListeners();
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
      scheduleDiagramFit() {
        if (this.planTab !== 'diagram') return;
        this.$nextTick(() => {
          requestAnimationFrame(() => this.diagramFitToView(0));
        });
      },
      diagramFitToView(retry) {
        const attempt = retry || 0;
        const vp = this.getDiagramViewportEl();
        if (!vp || !this.diagramLayout) return;
        const rect = vp.getBoundingClientRect();
        if ((rect.width < 24 || rect.height < 24) && attempt < 8) {
          requestAnimationFrame(() => this.diagramFitToView(attempt + 1));
          return;
        }
        const pad = 20;
        const lw = this.diagramLayout.width;
        const lh = this.diagramLayout.height;
        if (!lw || !lh) return;
        const scaleX = (rect.width - pad * 2) / lw;
        const scaleY = (rect.height - pad * 2) / lh;
        const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(scaleX, scaleY)));
        this.diagramZoom = scale;
        const contentW = lw * scale;
        const contentH = lh * scale;
        this.diagramPan = {
          x: Math.max(pad, (rect.width - contentW) / 2),
          y: Math.max(pad, (rect.height - contentH) / 2)
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
            this.scheduleDiagramFit();
          });
        }
      },
      closeDiagramFullscreen() {
        this.diagramFullscreen = false;
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        this.scheduleDiagramFit();
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
      formatMissingIndexDdl(mi) {
        if (!mi) return '';
        const keyCols = (mi.columns.equality || [])
          .concat(mi.columns.inequality || [])
          .map((c) => '[' + c + ']');
        if (!keyCols.length) return '-- Sem colunas-chave no plano';
        const schema = mi.schema ? '[' + mi.schema + ']' : mi.schema;
        const table = mi.table ? '[' + mi.table + ']' : mi.table;
        let ddl =
          'CREATE NONCLUSTERED INDEX IX_' +
          (mi.table || 'Missing').replace(/[^\w]/g, '_') +
          '_Missing\nON ' +
          schema +
          '.' +
          table +
          ' (' +
          keyCols.join(', ') +
          ')';
        if (mi.columns.include && mi.columns.include.length) {
          ddl +=
            '\nINCLUDE (' +
            mi.columns.include.map((c) => '[' + c + ']').join(', ') +
            ')';
        }
        return ddl + ';';
      },
      operatorIconUrl(node) {
        if (!node) return '';
        const meta =
          node.operatorMeta ||
          (S.getPlanOperatorMeta
            ? S.getPlanOperatorMeta(node.physicalOp, node.logicalOp)
            : null);
        return meta ? meta.iconUrl : '';
      },
      onOperatorIconError(ev, node) {
        const img = ev && ev.target;
        if (!img || img.dataset.fallback) return;
        img.dataset.fallback = '1';
        const meta =
          node.operatorMeta ||
          (S.getPlanOperatorMeta
            ? S.getPlanOperatorMeta(node.physicalOp, node.logicalOp)
            : null);
        img.setAttribute(
          'href',
          S.planOperatorIconFallback ? S.planOperatorIconFallback(meta) : ''
        );
      },
      nodeGroupTitle(node) {
        let t = 'Duplo clique para ver detalhes';
        if (node && node.parallel) t += ' · Executado em paralelo';
        return t;
      },
      openPlanNodeModalById(nodeId) {
        const st = this.selectedStatement;
        if (!st || nodeId == null || nodeId === '') return;
        const node = S.findPlanNodeById ? S.findPlanNodeById(st.flatOps, nodeId) : null;
        if (node) this.openPlanNodeModal(node);
      },
      openPlanNodeModal(node) {
        if (!node) return;
        const st = this.selectedStatement;
        this.planNodeDetail = S.buildPlanNodeDetail(node, st ? st.issues : []);
        this.$nextTick(() => {
          const el = document.getElementById('planNodeDetailModal');
          if (!el) return;
          if (!this.planNodeModalInstance) {
            this.planNodeModalInstance = new bootstrap.Modal(el);
          }
          this.planNodeModalInstance.show();
        });
      },
      closePlanNodeModal() {
        if (this.planNodeModalInstance) this.planNodeModalInstance.hide();
        this.planNodeDetail = null;
      },
      showToast(msg) {
        S.showToast(this, msg);
      },
      async copyStatementSql() {
        const text = this.statementSqlText;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          this.showToast('Consulta copiada.');
        } catch (e) {
          this.showToast('Não foi possível copiar.');
        }
      }
    },
    mixins: [S.themeMixin]
  }).mount('#app');
})();
