/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  var SCENARIO_LABELS = { min: 'Mínimo', media: 'Médio', max: 'Máximo', potencial: 'Potencial' };
  var ROW_COUNT_LABELS = { 1000: '1.000', 10000: '10.000', 1000000: '1.000.000' };

  const { createApp } = Vue;
  createApp({
    data() {
      return {
        theme: localStorage.getItem('sqlhelp-theme') || 'dark',
        parsed: null,
        analysis: null,
        fileName: '',
        parseError: '',
        loadingSample: false,
        copyingQuery: false,
        selectedTableKey: '',
        tableFilter: '',
        tableFilterMode: 'all',
        toastMessage: '',
        breakdownModal: null,
        breakdownModalInstance: null,
        growthDetailModal: null,
        growthDetailModalInstance: null,
        showGrowthDocs: false,
        storageTab: 'dataPage',
        _growthDetailPopovers: []
      };
    },
    watch: {
      selectedTableKey: function () {
        this.refreshAllGrowthDetailPopovers();
      },
      storageTab: function () {
        this.refreshAllGrowthDetailPopovers();
      }
    },
    computed: {
      growthDocSections() {
        return SqlHelp.GROWTH_DOCS ? SqlHelp.GROWTH_DOCS.sections : [];
      },
      ready() {
        return !!(this.parsed && this.analysis);
      },
      importStats() {
        if (!this.parsed) return { tables: 0, columns: 0, indexes: 0 };
        return {
          tables: this.parsed.tableCount,
          columns: this.parsed.colCount,
          indexes: this.parsed.indexCount
        };
      },
      tableSummaries() {
        if (!this.analysis) return [];
        return this.analysis.tables.map(function (ta) {
          var pkCap = ta.pk.maxRows != null && 1000000 > ta.pk.maxRows;
          var rl = ta.rowLayout;
          var al = ta.alerts || { hasAny: false, score: 0, highestSeverity: null, items: [], counts: { critical: 0, warning: 0 } };
          return {
            key: ta.key,
            schema: ta.schema,
            name: ta.name,
            bytesPerRow: rl.totalBytes,
            rowSizePotencial: rl.rowSizePotencial,
            exceedsRowLimit: rl.exceedsRowLimit,
            exceedsRowLimitPotencial: rl.exceedsRowLimitPotencial,
            exceedsPageBody: rl.exceedsPageBody,
            hasSizeAlert: al.hasAny,
            alertScore: al.score,
            alertHighestSeverity: al.highestSeverity,
            alertItems: al.items,
            alertCounts: al.counts,
            pkCapped: pkCap,
            columnCount: ta.columnCount,
            indexCount: ta.indexCount
          };
        });
      },
      alertTableCount() {
        return this.tableSummaries.filter(function (t) { return t.hasSizeAlert; }).length;
      },
      criticalAlertTableCount() {
        return this.tableSummaries.filter(function (t) {
          return t.alertHighestSeverity === 'critical';
        }).length;
      },
      filteredTables() {
        var list = this.tableSummaries.slice();
        if (this.tableFilterMode === 'alerts') {
          list = list.filter(function (t) { return t.hasSizeAlert; });
        } else if (this.tableFilterMode === 'critical') {
          list = list.filter(function (t) { return t.alertHighestSeverity === 'critical'; });
        }
        list.sort(function (a, b) {
          if (b.alertScore !== a.alertScore) return b.alertScore - a.alertScore;
          return a.key.localeCompare(b.key);
        });
        var q = (this.tableFilter || '').trim().toLowerCase();
        if (!q) return list;
        return list.filter(function (t) {
          return t.key.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
        });
      },
      selectedTable() {
        if (!this.selectedTableKey || !this.analysis) return null;
        return this.analysis.tables.find(function (t) { return t.key === this.selectedTableKey; }, this) || null;
      },
      selectedRowLayout() {
        return this.selectedTable ? this.selectedTable.rowLayout : null;
      },
      rowStructureBarFields() {
        var rs = this.selectedRowLayout && this.selectedRowLayout.rowDiagram
          ? this.selectedRowLayout.rowDiagram.rowStructureDetail : null;
        if (!rs || !rs.fields) return [];
        return rs.fields.filter(function (f) { return f.bytes > 0 && !f.isReference; });
      },
      selectedNcIndexes() {
        var ta = this.selectedTable;
        return ta ? (ta.ncIndexesStructural || []) : [];
      },
      projectionRows() {
        if (!this.selectedTable) return [];
        var rows = SqlHelp.SCENARIOS.map(function (sc) {
          return { id: sc, label: SCENARIO_LABELS[sc], isPotencial: false };
        });
        if (this.selectedTable.potencial) {
          rows.push({ id: 'potencial', label: SCENARIO_LABELS.potencial, isPotencial: true });
        }
        return rows;
      },
      dbTotalsRows() {
        if (!this.analysis) return [];
        var self = this;
        var rows = SqlHelp.SCENARIOS.map(function (sc) {
          return {
            scenario: sc,
            label: SCENARIO_LABELS[sc],
            projections: SqlHelp.ROW_COUNTS.map(function (target) {
              var p = self.analysis.dbTotals[sc].projections[target];
              return {
                target: target,
                label: ROW_COUNT_LABELS[target] || String(target),
                totalBytes: p.totalBytes,
                capped: p.anyCapped
              };
            })
          };
        });
        if (self.analysis.dbTotals.potencial) {
          rows.push({
            scenario: 'potencial',
            label: SCENARIO_LABELS.potencial,
            projections: SqlHelp.ROW_COUNTS.map(function (target) {
              var p = self.analysis.dbTotals.potencial.projections[target];
              return {
                target: target,
                label: ROW_COUNT_LABELS[target] || String(target),
                totalBytes: p.totalBytes,
                capped: p.anyCapped
              };
            })
          });
        }
        return rows;
      }
    },
    methods: {
      scenarioLabel(sc) {
        return SCENARIO_LABELS[sc] || sc;
      },
      formatBytes(n) {
        return SqlHelp.formatBytes(n);
      },
      storageModeLabel(mode) {
        return SqlHelp.storageModeLabel(mode);
      },
      storageClassLabel(entry) {
        if (entry.storageClass === 'lob') return 'LOB';
        if (entry.storageClass === 'variable') return 'Variável';
        return 'Fixa';
      },
      growthDoc(category, key) {
        return SqlHelp.getGrowthDoc(category, key);
      },
      growthTypeDocUrl(type) {
        return SqlHelp.getGrowthTypeDocUrl(type);
      },
      pkLimitLabel(pk) {
        if (pk.maxRows == null) return 'Sem limite prático por tipo';
        return 'Máx. ' + pk.maxRows.toLocaleString('pt-BR') + ' linhas (tipo ' + pk.type + ')';
      },
      projectionCell(tableAnalysis, source, target) {
        var src = source === 'potencial' ? tableAnalysis.potencial : tableAnalysis.scenarios[source];
        var p = src.projections[target];
        return {
          bytes: p.totalBytes,
          effective: p.effectiveRows,
          capped: p.cappedByPk
        };
      },
      alertScoreBadgeClass(score) {
        if (score >= 70) return 'bg-danger';
        if (score >= 30) return 'bg-warning text-dark';
        return 'bg-secondary';
      },
      tableListAlertClass(t) {
        if (!t.hasSizeAlert) return {};
        if (t.alertHighestSeverity === 'critical') {
          return {
            'growth-table-list-item--alert-critical': this.selectedTableKey !== t.key,
            'growth-table-list-item--alert-critical-active': this.selectedTableKey === t.key
          };
        }
        return {
          'growth-table-list-item--alert': this.selectedTableKey !== t.key,
          'growth-table-list-item--alert-active': this.selectedTableKey === t.key
        };
      },
      topAlertBadges(items, limit) {
        var max = limit || 2;
        var sorted = (items || []).slice().sort(function (a, b) {
          if (a.severity === b.severity) return 0;
          return a.severity === 'critical' ? -1 : 1;
        });
        return sorted.slice(0, max);
      },
      alertItemIcon(severity) {
        return severity === 'critical' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
      },
      formatTypeLabel(col) {
        var s = col.type;
        if (col.lengthDisplay) s += '(' + col.lengthDisplay + ')';
        return s;
      },
      rowSegWidth(bytes, total) {
        if (!total || total <= 0) return '10%';
        var pct = Math.max(8, Math.round((bytes / total) * 100));
        return pct + '%';
      },
      readFile(file) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { reject(new Error('Falha ao ler o arquivo.')); };
          reader.readAsText(file, 'UTF-8');
        });
      },
      processText(text, name) {
        this.parsed = SqlHelp.parseGrowthLog(text, name || 'Arquivo');
        this.analysis = SqlHelp.analyzeDatabase(this.parsed);
        this.parseError = '';
        this.fileName = name || '';
        if (!this.selectedTableKey || !this.parsed.tables[this.selectedTableKey]) {
          var first = this.filteredTables[0] || this.tableSummaries[0];
          this.selectedTableKey = first ? first.key : '';
        }
        var self = this;
        this.$nextTick(function () { self.refreshAllGrowthDetailPopovers(); });
      },
      async onFile(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          var text = await this.readFile(file);
          this.processText(text, file.name);
        } catch (e) {
          this.parseError = e.message || 'Erro ao ler arquivo.';
          this.parsed = null;
          this.analysis = null;
          this.fileName = '';
        }
      },
      async copyExportQuery() {
        this.copyingQuery = true;
        try {
          var text = await SqlHelp.fetchGrowthExportQuery();
          await navigator.clipboard.writeText(text);
          this.showToast('Query de exportação copiada.');
        } catch (e) {
          this.showToast('Não foi possível copiar. Selecione o texto manualmente.');
        } finally {
          this.copyingQuery = false;
        }
      },
      async loadSample() {
        this.loadingSample = true;
        this.parseError = '';
        try {
          var text = await fetch('samples/crescimento-exemplo.log').then(function (r) {
            if (!r.ok) throw new Error('Não foi possível carregar samples/crescimento-exemplo.log');
            return r.text();
          });
          this.processText(text, 'samples/crescimento-exemplo.log');
          this.showToast('Exemplo carregado.');
        } catch (e) {
          this.parseError = e.message || 'Erro ao carregar exemplo.';
        } finally {
          this.loadingSample = false;
        }
      },
      resetAll() {
        this.parsed = null;
        this.analysis = null;
        this.fileName = '';
        this.selectedTableKey = '';
        this.tableFilterMode = 'all';
        this.parseError = '';
      },
      selectTable(key) {
        this.selectedTableKey = key;
        var self = this;
        this.$nextTick(function () { self.refreshAllGrowthDetailPopovers(); });
      },
      setStorageTab(tab) {
        this.storageTab = tab;
      },
      disposeGrowthDetailPopovers() {
        if (this._growthDetailPopovers && this._growthDetailPopovers.length) {
          this._growthDetailPopovers.forEach(function (p) {
            try { p.dispose(); } catch (_) { /* already disposed */ }
          });
        }
        this._growthDetailPopovers = [];
      },
      refreshGrowthDetailPopovers(prefix, fields) {
        if (!prefix || !fields) return;
        var self = this;
        fields.forEach(function (f) {
          if (f.detailMode !== 'popover') return;
          var el = document.getElementById(prefix + f.id);
          if (!el) return;
          var pop = new bootstrap.Popover(el, {
            html: true,
            trigger: 'focus',
            container: 'body',
            customClass: 'growth-detail-popover',
            title: f.detailTitle,
            content: f.detailHtml,
            sanitize: false
          });
          self._growthDetailPopovers.push(pop);
        });
      },
      refreshAllGrowthDetailPopovers() {
        this.disposeGrowthDetailPopovers();
        var self = this;
        this.$nextTick(function () {
          if (!self.selectedRowLayout || !bootstrap) return;
          var pd = self.selectedRowLayout.pageDiagram;
          if (pd && pd.pageHeaderDetail) {
            self.refreshGrowthDetailPopovers('ph-popover-', pd.pageHeaderDetail.fields);
          }
          var rd = self.selectedRowLayout.rowDiagram;
          if (rd && rd.rowStructureDetail) {
            self.refreshGrowthDetailPopovers('rs-popover-', rd.rowStructureDetail.fields);
          }
        });
      },
      openGrowthFieldDetail(field) {
        if (!field || !field.detailMode) return;
        if (field.detailMode === 'modal') {
          this.openGrowthDetailModal(field);
        }
      },
      openGrowthDetailModal(field) {
        this.growthDetailModal = {
          title: field.detailTitle || field.label,
          html: field.detailHtml || ''
        };
        var self = this;
        this.$nextTick(function () {
          var el = document.getElementById('growthDetailModal');
          if (!el || !bootstrap) return;
          if (!self.growthDetailModalInstance) {
            self.growthDetailModalInstance = new bootstrap.Modal(el);
          }
          self.growthDetailModalInstance.show();
        });
      },
      closeGrowthDetail() {
        if (this.growthDetailModalInstance) this.growthDetailModalInstance.hide();
        this.growthDetailModal = null;
      },
      showModal(modalData) {
        this.breakdownModal = modalData;
        var self = this;
        this.$nextTick(function () {
          var el = document.getElementById('rowBreakdownModal');
          if (!el || !bootstrap) return;
          if (!self.breakdownModalInstance) {
            self.breakdownModalInstance = new bootstrap.Modal(el);
          }
          self.breakdownModalInstance.show();
        });
      },
      openRowBreakdown(scenario) {
        if (!this.selectedTable) return;
        var sc = this.selectedTable.scenarios[scenario];
        this.showModal({
          title: this.selectedTable.key + ' — ' + this.scenarioLabel(scenario),
          subtitle: 'Projeção com cenário de uso de dados variáveis',
          scenarioClass: 'growth-scenario-' + scenario,
          bytesPerRow: sc.bytesPerRow,
          dataRowBytes: sc.dataRowBytes,
          ncIndexBytesPerRow: sc.ncIndexBytesPerRow,
          pk: this.selectedTable.pk,
          dataLayout: sc.breakdown.dataRow,
          ncIndexes: sc.breakdown.ncIndexes,
          clusteredIndex: sc.breakdown.clusteredIndex
        });
      },
      openStructuralLayout() {
        if (!this.selectedTable) return;
        this.showModal({
          title: this.selectedTable.key + ' — Estrutura (máx. declarado)',
          subtitle: 'Layout físico da linha conforme regras SQL Server',
          scenarioClass: '',
          bytesPerRow: this.selectedTable.rowLayout.totalBytes,
          dataRowBytes: this.selectedTable.rowLayout.totalBytes,
          ncIndexBytesPerRow: 0,
          pk: this.selectedTable.pk,
          dataLayout: this.selectedTable.rowLayout,
          ncIndexes: [],
          clusteredIndex: this.selectedTable.clusteredIndex,
          structuralOnly: true
        });
      },
      openIndexLayout(ix) {
        if (!ix || !ix.layout) return;
        this.showModal({
          title: ix.name + ' — Índice NC',
          subtitle: 'Estrutura da linha de índice (máx. declarado)',
          scenarioClass: '',
          bytesPerRow: ix.layout.totalBytes,
          dataRowBytes: ix.layout.totalBytes,
          ncIndexBytesPerRow: 0,
          pk: this.selectedTable ? this.selectedTable.pk : {},
          dataLayout: ix.layout,
          ncIndexes: [],
          clusteredIndex: null,
          structuralOnly: true
        });
      },
      closeRowBreakdown() {
        if (this.breakdownModalInstance) this.breakdownModalInstance.hide();
        this.breakdownModal = null;
      },
      showToast(msg) {
        SqlHelp.showToast(this, msg);
      }
    },
    mixins: [SqlHelp.themeMixin]
  }).mount('#app');

})();
