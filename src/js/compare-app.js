/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  const { createApp } = Vue;
  createApp({
      data() {
        return {
          theme: localStorage.getItem('sqlhelp-theme') || 'dark',
          origemData: null,
          destinoData: null,
          origemFileName: '',
          destinoFileName: '',
          parseError: '',
          loadingSamples: false,
          copyingTsvQuery: false,
          selectedTableKey: '',
          tableFilter: '',
          tableFilterMode: 'all',
          selectedColumns: {},
          columnDefaults: {},
          columnMappings: {},
          temporalConfig: {},
          temporalTouched: false,
          generatedSql: '',
          scriptWarnings: [],
          toastMessage: ''
        };
      },
      computed: {
        ready() {
          return !!(this.origemData && this.destinoData);
        },
        origemStats() {
          return this.origemData
            ? { tables: this.origemData.tableCount, columns: this.origemData.colCount }
            : { tables: 0, columns: 0 };
        },
        destinoStats() {
          return this.destinoData
            ? { tables: this.destinoData.tableCount, columns: this.destinoData.colCount }
            : { tables: 0, columns: 0 };
        },
        allTableKeys() {
          if (!this.ready) return [];
          const keys = new Set([
            ...Object.keys(this.origemData.tables),
            ...Object.keys(this.destinoData.tables)
          ]);
          return [...keys].sort();
        },
        tableSummaries() {
          return this.allTableKeys.map(key => {
            const o = this.origemData.tables[key];
            const d = this.destinoData.tables[key];
            const diff = this.countTableDiffsDetail(key);
            const schema = (o && o.schema) || (d && d.schema) || 'dbo';
            const name = (o && o.name) || (d && d.name) || key.split('.').slice(1).join('.');
            return {
              key,
              schema,
              name,
              tableScope: diff.tableScope,
              diffCount: diff.total,
              origemDiffCount: diff.origem,
              destOnlyDiffCount: diff.destOnly,
              bothHasDiffs: diff.bothHasDiffs
            };
          });
        },
        filteredTables() {
          let list = this.tableSummaries;
          const q = (this.tableFilter || '').trim().toLowerCase();
          if (q) {
            list = list.filter(t =>
              t.key.toLowerCase().includes(q) ||
              t.name.toLowerCase().includes(q)
            );
          }
          switch (this.tableFilterMode) {
            case 'both_diff':
              list = list.filter(t => t.tableScope === 'both' && t.origemDiffCount > 0);
              break;
            case 'only_origem':
              list = list.filter(t => t.tableScope === 'only_origem');
              break;
            case 'only_destino':
              list = list.filter(t => t.tableScope === 'only_destino');
              break;
            case 'both_extra_dest':
              list = list.filter(t =>
                t.tableScope === 'both' && t.destOnlyDiffCount > 0 && t.origemDiffCount === 0
              );
              break;
            default:
              break;
          }
          return list;
        },
        comparisonRows() {
          if (!this.selectedTableKey || !this.ready) return [];
          const oTbl = this.origemData.tables[this.selectedTableKey];
          const dTbl = this.destinoData.tables[this.selectedTableKey];
          const order = [];
          const seen = new Set();

          if (oTbl) {
            oTbl.columnOrder.forEach(name => {
              if (!seen.has(name)) { order.push(name); seen.add(name); }
            });
          }
          if (dTbl) {
            dTbl.columnOrder.forEach(name => {
              if (!seen.has(name)) { order.push(name); seen.add(name); }
            });
          }

          const mappings = this.columnMappings[this.selectedTableKey] || {};

          return order.map(columnName => {
            const origem = oTbl ? oTbl.columns[columnName] : null;
            let destino = dTbl ? dTbl.columns[columnName] : null;
            let status = SqlHelp.compareColumnStatus(origem, destino);
            const mappedDestCol = origem ? mappings[columnName] : '';
            const mappedOrigemCol = destino && !origem
              ? this.getMappedOrigem(this.selectedTableKey, columnName)
              : '';
            let mapPartner = null;
            let isRename = false;

            if (mappedDestCol && origem) {
              isRename = true;
              status = 'rename';
              mapPartner = mappedDestCol;
              destino = dTbl ? dTbl.columns[mappedDestCol] : null;
            } else if (mappedOrigemCol) {
              isRename = true;
              status = 'rename';
              mapPartner = mappedOrigemCol;
            }

            const existsInDest = !!(destino && !isRename) || isRename;
            const needsDefault = !isRename && SqlHelp.needsDefaultForColumn(origem, destino, existsInDest);
            let scriptAction = 'â€”';
            if (isRename) {
              scriptAction = this.isRenameSelected(this.selectedTableKey, columnName, mapPartner, !!origem)
                ? 'sp_rename' : 'sp_rename (sugerido)';
            } else if (this.isSelectedKey(this.selectedTableKey, columnName)) {
              if (needsDefault) scriptAction = existsInDest ? 'UPDATE+ALTER' : 'ADD+UPDATE+ALTER';
              else scriptAction = existsInDest ? 'ALTER COLUMN' : 'ADD';
            } else if (status === 'missing') {
              scriptAction = needsDefault ? 'ADD+UPDATE+ALTER' : 'ADD (sugerido)';
            } else if (status === 'diff') {
              scriptAction = needsDefault ? 'UPDATE+ALTER' : 'ALTER (sugerido)';
            }

            const renameOrigemCol = isRename ? (origem ? columnName : mappedOrigemCol) : columnName;

            return {
              columnName,
              origem,
              destino,
              status,
              scriptAction,
              needsDefault,
              mapPartner,
              isRename,
              renameOrigemCol,
              canMapFromOrigem: !!origem && (status === 'missing' || status === 'rename'),
              canMapFromDestino: !origem && !!destino && (status === 'only_dest' || status === 'rename'),
              canSelect: !!origem || (isRename && !!mappedOrigemCol)
            };
          });
        },
        allRowsSelectedInTable() {
          const selectable = this.comparisonRows.filter(r => r.canSelect);
          return selectable.length > 0 && selectable.every(r => this.isSelected(r));
        },
        someRowsSelectedInTable() {
          return this.comparisonRows.some(r => r.canSelect && this.isSelected(r));
        },
        selectedDatetime2Cols() {
          return this.getSelectedDatetime2ColsForTable(this.selectedTableKey);
        },
        selectedDatetime2Count() {
          return this.selectedDatetime2Cols.length;
        },
        temporalStart() {
          return this.getTemporalCfg(this.selectedTableKey).start || '';
        },
        temporalEnd() {
          return this.getTemporalCfg(this.selectedTableKey).end || '';
        },
        temporalConfigValid() {
          return this.isTemporalConfigValid(this.selectedTableKey);
        }
      },
      methods: {
        readFile(file) {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
            reader.readAsText(file, 'UTF-8');
          });
        },
        async onFileOrigem(ev) {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          try {
            const text = await this.readFile(file);
            this.origemData = SqlHelp.parseTsv(text, 'Origem');
            this.origemFileName = file.name;
            this.parseError = '';
            this.afterDataLoaded();
          } catch (e) {
            this.parseError = e.message || 'Erro ao ler origem.';
            this.origemData = null;
            this.origemFileName = '';
          }
        },
        async onFileDestino(ev) {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          try {
            const text = await this.readFile(file);
            this.destinoData = SqlHelp.parseTsv(text, 'Destino');
            this.destinoFileName = file.name;
            this.parseError = '';
            this.afterDataLoaded();
          } catch (e) {
            this.parseError = e.message || 'Erro ao ler destino.';
            this.destinoData = null;
            this.destinoFileName = '';
          }
        },
        async copyTsvQuery() {
          this.copyingTsvQuery = true;
          try {
            var text = await SqlHelp.fetchTsvExportQuery();
            await navigator.clipboard.writeText(text);
            this.showToast('Query TSV copiada para a área de transferência.');
          } catch (e) {
            this.showToast('Não foi possível copiar. Selecione o texto manualmente.');
          } finally {
            this.copyingTsvQuery = false;
          }
        },
        async loadSamples() {
          this.loadingSamples = true;
          this.parseError = '';
          try {
            const [origemText, destinoText] = await Promise.all([
              fetch('tsv/origem.tsv').then(r => {
                if (!r.ok) throw new Error('NÃ£o foi possÃ­vel carregar tsv/origem.tsv');
                return r.text();
              }),
              fetch('tsv/destino.tsv').then(r => {
                if (!r.ok) throw new Error('NÃ£o foi possÃ­vel carregar tsv/destino.tsv');
                return r.text();
              })
            ]);
            this.origemData = SqlHelp.parseTsv(origemText, 'Origem');
            this.destinoData = SqlHelp.parseTsv(destinoText, 'Destino');
            this.origemFileName = 'tsv/origem.tsv';
            this.destinoFileName = 'tsv/destino.tsv';
            this.afterDataLoaded();
            this.showToast('Exemplos carregados.');
          } catch (e) {
            this.parseError = e.message || 'Erro ao carregar exemplos. Use um servidor local ou importe os arquivos manualmente.';
          } finally {
            this.loadingSamples = false;
          }
        },
        afterDataLoaded() {
          if (!this.ready) return;
          if (!this.selectedTableKey || !this.allTableKeys.includes(this.selectedTableKey)) {
            const first = this.filteredTables[0] || this.tableSummaries[0];
            this.selectedTableKey = first ? first.key : '';
          }
          this.generatedSql = '';
          this.scriptWarnings = [];
        },
        resetAll() {
          this.origemData = null;
          this.destinoData = null;
          this.origemFileName = '';
          this.destinoFileName = '';
          this.selectedTableKey = '';
          this.selectedColumns = {};
          this.columnDefaults = {};
          this.columnMappings = {};
          this.temporalConfig = {};
          this.temporalTouched = false;
          this.generatedSql = '';
          this.scriptWarnings = [];
          this.parseError = '';
        },
        countTableDiffsDetail(key) {
          const oTbl = this.origemData.tables[key];
          const dTbl = this.destinoData.tables[key];
          const empty = {
            tableScope: 'none',
            origem: 0,
            destOnly: 0,
            total: 0,
            bothHasDiffs: false
          };
          if (!oTbl && !dTbl) return empty;

          if (oTbl && !dTbl) {
            const n = oTbl.columnOrder.length;
            return {
              tableScope: 'only_origem',
              origem: n,
              destOnly: 0,
              total: n,
              bothHasDiffs: false
            };
          }
          if (!oTbl && dTbl) {
            const n = dTbl.columnOrder.length;
            return {
              tableScope: 'only_destino',
              origem: 0,
              destOnly: n,
              total: n,
              bothHasDiffs: false
            };
          }

          let origem = 0;
          let destOnly = 0;
          const mappings = this.columnMappings[key] || {};
          const mappedOrigem = new Set(Object.keys(mappings));
          const mappedDest = new Set(Object.values(mappings));
          oTbl.columnOrder.forEach(name => {
            if (mappedOrigem.has(name)) return;
            const status = SqlHelp.compareColumnStatus(
              oTbl.columns[name],
              dTbl.columns[name] || null
            );
            if (status === 'missing' || status === 'diff') origem++;
          });
          dTbl.columnOrder.forEach(name => {
            if (mappedDest.has(name)) return;
            if (!oTbl.columns[name]) destOnly++;
          });
          const total = origem + destOnly;
          return {
            tableScope: 'both',
            origem,
            destOnly,
            total,
            bothHasDiffs: total > 0
          };
        },
        tableDiffBadgeClass(t) {
          if (this.selectedTableKey === t.key) return 'bg-light text-dark';
          if (t.tableScope === 'only_origem') return 'bg-info text-dark';
          if (t.tableScope === 'only_destino') return 'bg-secondary';
          if (t.tableScope === 'both' && t.origemDiffCount > 0) return 'bg-warning text-dark';
          if (t.tableScope === 'both' && t.destOnlyDiffCount > 0) return 'bg-primary';
          return 'bg-secondary';
        },
        tableSidebarItemClass(t) {
          const cls = { active: this.selectedTableKey === t.key };
          if (t.tableScope === 'only_destino') cls['table-item-only-dest'] = true;
          else if (t.tableScope === 'only_origem') cls['table-item-only-origem'] = true;
          else if (t.tableScope === 'both' && t.origemDiffCount > 0) cls['table-item-both-priority'] = true;
          return cls;
        },
        columnNameClass(name) {
          const n = (name || '').toUpperCase();
          if (n === 'CD_CONCESSAO' || n === 'CD_AGENCIA') return 'col-name-concessao';
          return '';
        },
        colDefTextClass(col) {
          if (col && (col.type || '').toLowerCase() === 'datetime2') return 'col-type-datetime2';
          return '';
        },
        getOrigemCol(colName) {
          const t = this.origemData.tables[this.selectedTableKey];
          return t ? t.columns[colName] : null;
        },
        getDestinoCol(colName) {
          const t = this.destinoData.tables[this.selectedTableKey];
          return t ? t.columns[colName] : null;
        },
        selectTable(key) {
          this.selectedTableKey = key;
          this.temporalTouched = false;
          this.generatedSql = '';
        },
        getTemporalCfg(tableKey) {
          const tk = tableKey || this.selectedTableKey;
          return this.temporalConfig[tk] || { start: '', end: '' };
        },
        setTemporalField(field, value) {
          const tk = this.selectedTableKey;
          if (!tk) return;
          if (!this.temporalConfig[tk]) {
            this.temporalConfig[tk] = { start: '', end: '' };
          }
          this.temporalConfig[tk][field] = value;
          this.temporalTouched = true;
        },
        getSelectedDatetime2ColsForTable(tableKey) {
          const oTbl = this.origemData.tables[tableKey];
          if (!oTbl) return [];
          const prefix = tableKey + '|';
          const cols = [];
          Object.keys(this.selectedColumns).forEach(k => {
            if (!k.startsWith(prefix)) return;
            const colName = k.slice(prefix.length);
            const col = oTbl.columns[colName];
            if (col && SqlHelp.isDatetime2Col(col)) cols.push(colName);
          });
          return cols.sort();
        },
        isTemporalConfigValid(tableKey) {
          const cols = this.getSelectedDatetime2ColsForTable(tableKey);
          if (cols.length !== 2) return false;
          const cfg = this.getTemporalCfg(tableKey);
          return !!(cfg.start && cfg.end && cfg.start !== cfg.end &&
            cols.includes(cfg.start) && cols.includes(cfg.end));
        },
        getTemporalExcludeCols(tableKey) {
          const cols = this.getSelectedDatetime2ColsForTable(tableKey);
          if (cols.length !== 2) return new Set();
          return new Set(cols);
        },
        syncTemporalConfig(tableKey) {
          const cols = this.getSelectedDatetime2ColsForTable(tableKey);
          if (!this.temporalConfig[tableKey]) return;
          if (cols.length !== 2) {
            this.temporalConfig[tableKey] = { start: '', end: '' };
            return;
          }
          const cfg = this.temporalConfig[tableKey];
          if (cfg.start && !cols.includes(cfg.start)) cfg.start = '';
          if (cfg.end && !cols.includes(cfg.end)) cfg.end = '';
        },
        appendTemporalScript(tableLines, tableKey, warnings) {
          const cols = this.getSelectedDatetime2ColsForTable(tableKey);
          if (cols.length !== 2) return 0;
          if (!this.isTemporalConfigValid(tableKey)) {
            warnings.push(
              `[${tableKey}]: selecione Temporal Inicial e Temporal Final (2 colunas datetime2).`
            );
            return 0;
          }
          const oTbl = this.origemData.tables[tableKey];
          if (!oTbl) return 0;
          const cfg = this.getTemporalCfg(tableKey);
          const startDef = oTbl.columns[cfg.start];
          const endDef = oTbl.columns[cfg.end];
          this.pushScriptSection(
            tableLines,
            `System-Time: [${cfg.start}] (inÃ­cio) / [${cfg.end}] (fim)`
          );
          tableLines.push(...SqlHelp.buildTemporalSystemTimeLines(
            oTbl.schema,
            oTbl.name,
            cfg.start,
            cfg.end,
            startDef,
            endDef
          ));
          tableLines.push('GO');
          return 1;
        },
        selectionKey(tableKey, columnName) {
          return tableKey + '|' + columnName;
        },
        isSelectedKey(tableKey, columnName) {
          return !!this.selectedColumns[this.selectionKey(tableKey, columnName)];
        },
        isSelected(row) {
          if (row.isRename) {
            return this.isRenameSelected(
              this.selectedTableKey,
              row.columnName,
              row.mapPartner,
              !!row.origem
            );
          }
          return this.isSelectedKey(this.selectedTableKey, row.columnName);
        },
        defaultKey(tableKey, columnName) {
          return tableKey + '|' + columnName;
        },
        getDefaultValue(row) {
          return this.columnDefaults[this.defaultKey(this.selectedTableKey, row.columnName)] || '';
        },
        setDefaultValue(row, value) {
          const k = this.defaultKey(this.selectedTableKey, row.columnName);
          if (value) this.columnDefaults[k] = value;
          else delete this.columnDefaults[k];
        },
        getDefaultForColumn(tableKey, colName) {
          return this.columnDefaults[this.defaultKey(tableKey, colName)] || '';
        },
        getTableMappings(tableKey) {
          return this.columnMappings[tableKey] || {};
        },
        getMappedDestino(tableKey, origemCol) {
          return this.getTableMappings(tableKey)[origemCol] || '';
        },
        getMappedOrigem(tableKey, destinoCol) {
          const m = this.getTableMappings(tableKey);
          return Object.keys(m).find(k => m[k] === destinoCol) || '';
        },
        setMapping(tableKey, origemCol, destinoCol) {
          if (!this.columnMappings[tableKey]) {
            this.columnMappings[tableKey] = {};
          }
          const m = this.columnMappings[tableKey];
          Object.keys(m).forEach(k => {
            if (m[k] === destinoCol) delete m[k];
          });
          if (origemCol && destinoCol) {
            m[origemCol] = destinoCol;
            const selKey = this.selectionKey(tableKey, origemCol);
            const renameKey = this.renameSelectionKey(tableKey, origemCol);
            if (this.selectedColumns[selKey] || this.selectedColumns[renameKey]) {
              this.selectedColumns[renameKey] = true;
            }
            delete this.columnDefaults[this.defaultKey(tableKey, origemCol)];
          } else if (origemCol) {
            delete m[origemCol];
          }
        },
        setMappingFromDestino(tableKey, destinoCol, origemCol) {
          if (origemCol) this.setMapping(tableKey, origemCol, destinoCol);
          else {
            const prev = this.getMappedOrigem(tableKey, destinoCol);
            if (prev) this.setMapping(tableKey, prev, '');
          }
        },
        destCandidatesForOrigem(row) {
          const dTbl = this.destinoData.tables[this.selectedTableKey];
          const oTbl = this.origemData.tables[this.selectedTableKey];
          if (!dTbl || !oTbl) return [];
          const m = this.getTableMappings(this.selectedTableKey);
          const usedDest = new Set(Object.values(m));
          const current = m[row.columnName];
          return dTbl.columnOrder.filter(name => {
            if (oTbl.columns[name]) return false;
            if (usedDest.has(name) && name !== current) return false;
            return true;
          });
        },
        origemCandidatesForDestino(row) {
          const dTbl = this.destinoData.tables[this.selectedTableKey];
          const oTbl = this.origemData.tables[this.selectedTableKey];
          if (!dTbl || !oTbl) return [];
          const m = this.getTableMappings(this.selectedTableKey);
          const usedOrigem = new Set(Object.keys(m));
          const current = this.getMappedOrigem(this.selectedTableKey, row.columnName);
          return oTbl.columnOrder.filter(name => {
            if (dTbl.columns[name]) return false;
            if (usedOrigem.has(name) && name !== current) return false;
            return true;
          });
        },
        renameSelectionKey(tableKey, origemCol) {
          return tableKey + '|' + origemCol;
        },
        isRenameSelected(tableKey, columnName, mapPartner, hasOrigem) {
          const origemCol = hasOrigem ? columnName : mapPartner;
          return !!this.selectedColumns[this.renameSelectionKey(tableKey, origemCol)];
        },
        toggleSelect(row, checked) {
          const tableKey = this.selectedTableKey;
          const selKey = row.isRename && !row.origem
            ? this.renameSelectionKey(tableKey, row.renameOrigemCol)
            : this.selectionKey(tableKey, row.renameOrigemCol || row.columnName);
          if (checked) this.selectedColumns[selKey] = true;
          else delete this.selectedColumns[selKey];
          this.syncTemporalConfig(tableKey);
        },
        toggleAllInTable(checked) {
          const seenRename = new Set();
          this.comparisonRows.forEach(row => {
            if (!row.canSelect) return;
            let selKey;
            if (row.isRename) {
              if (seenRename.has(row.renameOrigemCol)) return;
              seenRename.add(row.renameOrigemCol);
              selKey = this.renameSelectionKey(this.selectedTableKey, row.renameOrigemCol);
            } else {
              selKey = this.selectionKey(this.selectedTableKey, row.columnName);
            }
            if (checked) this.selectedColumns[selKey] = true;
            else delete this.selectedColumns[selKey];
          });
        },
        selectMissingInTable() {
          this.comparisonRows.forEach(row => {
            if (row.status === 'missing' && !row.isRename) {
              this.selectedColumns[this.selectionKey(this.selectedTableKey, row.columnName)] = true;
            }
          });
        },
        clearSelectionInTable() {
          const prefix = this.selectedTableKey + '|';
          Object.keys(this.selectedColumns).forEach(k => {
            if (k.startsWith(prefix)) delete this.selectedColumns[k];
          });
        },
        rowRowClass(row) {
          if (row.status === 'rename') return 'row-rename';
          if (row.status === 'missing') return 'row-missing';
          if (row.status === 'diff') return 'row-diff';
          if (row.status === 'only_dest') return 'row-only-dest';
          return '';
        },
        statusLabel(status) {
          const map = {
            missing: 'Falta no destino',
            diff: 'Diferente',
            only_dest: 'SÃ³ no destino',
            rename: 'Renomear',
            same: 'Igual'
          };
          return map[status] || status;
        },
        statusBadgeClass(status) {
          const map = {
            missing: 'bg-warning text-dark',
            diff: 'bg-info text-dark',
            only_dest: 'bg-secondary',
            rename: 'bg-primary',
            same: 'bg-success'
          };
          return map[status] || 'bg-secondary';
        },
        pushScriptSection(lines, title) {
          const bar = '-- ' + '-'.repeat(72);
          lines.push('');
          lines.push(bar);
          lines.push(`-- ${title}`);
          lines.push(bar);
        },
        buildSpRenameLine(schema, table, destinoCol, origemCol) {
          return `EXEC sp_rename '${schema}.${table}.${destinoCol}', '${origemCol}', 'COLUMN';`;
        },
        getSelectedRenamesForTable(tableKey) {
          const m = this.getTableMappings(tableKey);
          const items = [];
          Object.keys(m).forEach(origemCol => {
            const destinoCol = m[origemCol];
            if (!destinoCol) return;
            if (!this.selectedColumns[this.renameSelectionKey(tableKey, origemCol)]) return;
            items.push({ origemCol, destinoCol });
          });
          return items.sort((a, b) => a.origemCol.localeCompare(b.origemCol));
        },
        formatColDef(col) {
          let s = SqlHelp.buildTypeSql(col);
          if (col.isIdentity) s += ' IDENTITY(1,1)';
          s += col.nullable ? ' NULL' : ' NOT NULL';
          return s;
        },
        buildAddLine(col, qTable, forceNull) {
          const typeSql = SqlHelp.buildTypeSql(col);
          const nullSql = forceNull ? 'NULL' : (col.nullable ? 'NULL' : 'NOT NULL');
          if (col.isIdentity) {
            return `ALTER TABLE ${qTable} ADD [${col.name}] ${typeSql} IDENTITY(1, 1) NOT NULL;`;
          }
          return `ALTER TABLE ${qTable} ADD [${col.name}] ${typeSql} ${nullSql};`;
        },
        buildAlterLine(col, qTable, forceNull) {
          const typeSql = SqlHelp.buildTypeSql(col);
          const nullSql = forceNull ? 'NULL' : (col.nullable ? 'NULL' : 'NOT NULL');
          return `ALTER TABLE ${qTable} ALTER COLUMN [${col.name}] ${typeSql} ${nullSql};`;
        },
        appendColumnScript(tableLines, ctx) {
          const { col, destino, existsInDest, qTable, tableKey, colName, warnings } = ctx;
          const defaultVal = ctx.defaultVal;
          const useNotNullSteps = SqlHelp.needsDefaultForColumn(col, destino, existsInDest);

          if (col.isIdentity) {
            if (existsInDest) {
              warnings.push(`[${tableKey}].[${colName}]: ALTER em coluna IDENTITY exige script manual.`);
              tableLines.push(`-- ALTER COLUMN [${colName}] ignorado (IDENTITY).`);
            } else {
              tableLines.push(`-- ADD IDENTITY: revise se a tabela jÃ¡ possui dados.`);
              tableLines.push(this.buildAddLine(col, qTable, false));
            }
            tableLines.push('GO');
            return 1;
          }

          if (useNotNullSteps) {
            const replSql = SqlHelp.formatNullReplacementSql(defaultVal, col.type);
            if (!replSql) {
              warnings.push(`[${tableKey}].[${colName}]: informe o valor default antes de NOT NULL.`);
              return 0;
            }
            const typeSql = SqlHelp.buildTypeSql(col);
            if (!existsInDest) {
              tableLines.push(this.buildAddLine(col, qTable, true));
              tableLines.push('GO');
            } else if (!SqlHelp.columnsTypeEqual(col, destino)) {
              tableLines.push(this.buildAlterLine(col, qTable, true));
              tableLines.push('GO');
            }
            tableLines.push(`UPDATE ${qTable} SET [${col.name}] = ${replSql} WHERE [${col.name}] IS NULL;`);
            tableLines.push('GO');
            tableLines.push(`ALTER TABLE ${qTable} ALTER COLUMN [${col.name}] ${typeSql} NOT NULL;`);
            tableLines.push('GO');
            return 1;
          }

          if (existsInDest) {
            tableLines.push(this.buildAlterLine(col, qTable, false));
          } else {
            tableLines.push(this.buildAddLine(col, qTable, false));
          }
          tableLines.push('GO');
          return 1;
        },
        getSelectedForTable(tableKey) {
          const prefix = tableKey + '|';
          const oTbl = this.origemData.tables[tableKey];
          const items = [];
          const temporalExclude = this.getTemporalExcludeCols(tableKey);
          if (!oTbl) return items;
          Object.keys(this.selectedColumns).forEach(k => {
            if (!k.startsWith(prefix)) return;
            const colName = k.slice(prefix.length);
            if (!oTbl.columns[colName]) return;
            if (this.getMappedDestino(tableKey, colName)) return;
            if (temporalExclude.has(colName)) return;
            const dTbl = this.destinoData.tables[tableKey];
            const col = oTbl.columns[colName];
            const destCol = dTbl ? dTbl.columns[colName] : null;
            const existsInDest = !!destCol;
            items.push({ colName, col, destCol, existsInDest });
          });
          return items.sort((a, b) => {
            const ia = oTbl.columnOrder.indexOf(a.colName);
            const ib = oTbl.columnOrder.indexOf(b.colName);
            return ia - ib;
          });
        },
        generateScript(allTables) {
          this.scriptWarnings = [];
          const lines = [];
          const warnings = [];
          const tableKeySet = new Set();
          Object.keys(this.selectedColumns).forEach(k => {
            const tk = k.split('|')[0];
            if (tk) tableKeySet.add(tk);
          });
          Object.keys(this.columnMappings).forEach(tk => {
            if (this.getSelectedRenamesForTable(tk).length) tableKeySet.add(tk);
          });
          if (this.origemData) {
            Object.keys(this.origemData.tables).forEach(tk => {
              if (this.getSelectedDatetime2ColsForTable(tk).length === 2) tableKeySet.add(tk);
            });
          }
          const tableKeys = allTables
            ? [...tableKeySet].sort()
            : (this.selectedTableKey ? [this.selectedTableKey] : []);

          if (!tableKeys.length) {
            this.generatedSql = '-- Selecione ao menos uma coluna.';
            return;
          }

          let totalStatements = 0;

          if (this.selectedTableKey && this.selectedDatetime2Count === 2) {
            this.temporalTouched = true;
          }

          tableKeys.forEach(tableKey => {
            const selected = this.getSelectedForTable(tableKey);
            const renames = this.getSelectedRenamesForTable(tableKey);
            const hasTemporal = this.getSelectedDatetime2ColsForTable(tableKey).length === 2;

            if (!selected.length && !renames.length && !hasTemporal) return;

            const oTbl = this.origemData.tables[tableKey];
            if (!oTbl) return;

            const qTable = `[${oTbl.schema}].[${oTbl.name}]`;
            const tableLines = [];

            tableLines.push(`-- ${tableKey}`);

            renames.forEach(({ origemCol, destinoCol }) => {
              this.pushScriptSection(
                tableLines,
                `Renomear coluna: [${destinoCol}] â†’ [${origemCol}]`
              );
              tableLines.push(this.buildSpRenameLine(oTbl.schema, oTbl.name, destinoCol, origemCol));
              tableLines.push('GO');
              totalStatements++;
            });

            totalStatements += this.appendTemporalScript(tableLines, tableKey, warnings);

            selected.forEach(({ colName, col, destCol, existsInDest }) => {
              const action = existsInDest ? 'ALTER COLUMN' : 'ADD COLUMN';
              this.pushScriptSection(tableLines, `${action}: [${colName}]`);
              totalStatements += this.appendColumnScript(tableLines, {
                col,
                destino: destCol,
                existsInDest,
                qTable,
                tableKey,
                colName,
                defaultVal: this.getDefaultForColumn(tableKey, colName),
                warnings
              });
            });

            if (tableLines.length > 1) {
              lines.push(...tableLines);
              lines.push('');
            }
          });

          if (!totalStatements) {
            this.generatedSql = allTables
              ? '-- Nenhuma coluna selecionada em nenhuma tabela.'
              : '-- Nenhuma coluna selecionada nesta tabela.';
            this.scriptWarnings = warnings;
            return;
          }

          lines.unshift('-- SqlHelp â€” sincronizar colunas do origem para o destino');
          lines.unshift('-- Revise o script antes de executar em produÃ§Ã£o.');
          lines.push('-- Fim do script');

          const qFirst = tableKeys[0];
          const oFirst = this.origemData.tables[qFirst];
          const qTableFirst = oFirst ? `[${oFirst.schema}].[${oFirst.name}]` : '[dbo].[Tabela]';

          this.generatedSql = SqlHelp.wrapScriptWithTransaction(lines, qTableFirst);
          this.scriptWarnings = warnings;
        },
        copyScript() {
          if (!this.generatedSql) return;
          navigator.clipboard.writeText(this.generatedSql).then(() => {
            this.showToast('Script copiado.');
          }).catch(() => {
            this.showToast('Copie o texto manualmente.');
          });
        },
        showToast(msg) {
          SqlHelp.showToast(this, msg);
        }
      },
      mixins: [SqlHelp.themeMixin]
    }).mount('#app');

})();