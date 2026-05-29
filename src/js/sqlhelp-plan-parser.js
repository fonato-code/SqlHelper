(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  const SHOWPLAN_NS = 'http://schemas.microsoft.com/sqlserver/2004/07/showplan';
  const SCAN_OPS = /Scan$/i;
  const SEEK_OPS = /Seek$/i;

  function localElements(parent, localName) {
    if (!parent) return [];
    return Array.from(parent.getElementsByTagName('*')).filter(
      (el) => el.localName === localName && el.namespaceURI === SHOWPLAN_NS
    );
  }

  function firstLocal(parent, localName) {
    return localElements(parent, localName)[0] || null;
  }

  function attrNum(el, name) {
    if (!el || !el.hasAttribute(name)) return null;
    const v = parseFloat(el.getAttribute(name));
    return Number.isFinite(v) ? v : null;
  }

  function attrStr(el, name) {
    return el && el.hasAttribute(name) ? el.getAttribute(name) : '';
  }

  function decodeStatementText(text) {
    return String(text || '')
      .replace(/&#xD;&#xA;/g, '\n')
      .replace(/&#xA;/g, '\n')
      .replace(/&#xD;/g, '\n')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function sumRuntimeCounters(relOp, field) {
    const rt = firstLocal(relOp, 'RunTimeInformation');
    if (!rt) return null;
    let total = 0;
    let has = false;
    for (const c of localElements(rt, 'RunTimeCountersPerThread')) {
      const v = attrNum(c, field);
      if (v != null) {
        total += v;
        has = true;
      }
    }
    return has ? total : null;
  }

  const WARNING_FLAG_LABELS = {
    NoJoinPredicate: 'Join sem predicado (CROSS JOIN implícito).',
    SpillToTempDb: 'Operação gerou spill para tempdb.',
    SpillToTempDbWithStats: 'Spill para tempdb com estatísticas desatualizadas.',
    UnmatchedIndexes: 'Índices não correspondentes no plano.',
    ColumnsWithNoStatistics: 'Colunas sem estatísticas.',
    Warnings: 'Aviso no operador.'
  };

  function stripBrackets(s) {
    return String(s || '').replace(/^\[|\]$/g, '');
  }

  function columnRefLabel(ref) {
    if (!ref) return '';
    const col = stripBrackets(attrStr(ref, 'Column'));
    const table = stripBrackets(attrStr(ref, 'Table'));
    const schema = stripBrackets(attrStr(ref, 'Schema'));
    const db = stripBrackets(attrStr(ref, 'Database'));
    const alias = stripBrackets(attrStr(ref, 'Alias'));
    if (!table && col) return col;
    let t = '';
    if (db) t += '[' + db + '].';
    if (schema) t += '[' + schema + '].';
    if (table) t += '[' + table + ']';
    if (alias) t += ' as [' + alias + ']';
    if (col) t += (t ? '.' : '') + '[' + col + ']';
    return t || col;
  }

  function scalarStringUnder(relOpEl, localName) {
    const container = localElements(relOpEl, localName)[0];
    if (!container) return '';
    for (const el of container.getElementsByTagName('*')) {
      if (el.namespaceURI !== SHOWPLAN_NS) continue;
      if (el.localName === 'ScalarOperator' && el.hasAttribute('ScalarString')) {
        return el.getAttribute('ScalarString');
      }
    }
    return '';
  }

  function scalarStringsUnder(relOpEl, localName) {
    const container = localElements(relOpEl, localName)[0];
    if (!container) return [];
    const out = [];
    for (const el of container.getElementsByTagName('*')) {
      if (el.namespaceURI !== SHOWPLAN_NS) continue;
      if (el.localName === 'ScalarOperator' && el.hasAttribute('ScalarString')) {
        const s = el.getAttribute('ScalarString');
        if (s && !out.includes(s)) out.push(s);
      }
    }
    return out;
  }

  function extractOutputList(relOpEl) {
    const ol = firstLocal(relOpEl, 'OutputList');
    if (!ol) return [];
    return localElements(ol, 'ColumnReference').map(columnRefLabel).filter(Boolean);
  }

  function extractOrdered(relOpEl) {
    const scan = firstLocal(relOpEl, 'IndexScan') || firstLocal(relOpEl, 'IndexSeek');
    if (!scan || !scan.hasAttribute('Ordered')) return null;
    return attrStr(scan, 'Ordered') === 'true';
  }

  function extractSeekPredicates(relOpEl) {
    const parts = scalarStringsUnder(relOpEl, 'SeekPredicates');
    return parts.join('\n');
  }

  function extractOrderBy(relOpEl) {
    const ob = firstLocal(relOpEl, 'OrderBy');
    if (!ob) return '';
    const lines = [];
    for (const col of localElements(ob, 'OrderByColumn')) {
      const asc = attrStr(col, 'Ascending') === 'true';
      const ref = firstLocal(col, 'ColumnReference');
      const label = columnRefLabel(ref) || '?';
      lines.push(label + ' ' + (asc ? 'Ascending' : 'Descending'));
    }
    return lines.join('\n');
  }

  function extractGroupBy(relOpEl) {
    const gb = firstLocal(relOpEl, 'GroupBy');
    if (!gb) return '';
    return localElements(gb, 'ColumnReference').map(columnRefLabel).filter(Boolean).join(', ');
  }

  function extractPartitionColumns(relOpEl) {
    const pc = firstLocal(relOpEl, 'PartitionColumns');
    if (!pc) return '';
    return localElements(pc, 'ColumnReference').map(columnRefLabel).filter(Boolean).join(', ');
  }

  function extractPartitioningType(relOpEl) {
    const p = firstLocal(relOpEl, 'Parallelism');
    if (!p) return '';
    return attrStr(p, 'PartitioningType');
  }

  function extractMemoryFractions(relOpEl) {
    const mf = localElements(relOpEl, 'MemoryFractions')[0];
    if (!mf) return '';
    const inp = attrNum(mf, 'Input');
    const out = attrNum(mf, 'Output');
    const parts = [];
    if (inp != null) parts.push('In: ' + (inp * 100).toFixed(2) + '%');
    if (out != null) parts.push('Out: ' + (out * 100).toFixed(2) + '%');
    return parts.join(' · ');
  }

  function extractObjectRef(relOp) {
    const obj =
      firstLocal(relOp, 'Object') ||
      firstLocal(relOp, 'IndexedView') ||
      (function findObject() {
        for (const el of relOp.getElementsByTagName('*')) {
          if (el.localName === 'Object' && el.namespaceURI === SHOWPLAN_NS) return el;
        }
        return null;
      })();
    if (!obj) return null;
    return {
      database: stripBrackets(attrStr(obj, 'Database')),
      schema: stripBrackets(attrStr(obj, 'Schema')),
      table: stripBrackets(attrStr(obj, 'Table')),
      index: stripBrackets(attrStr(obj, 'Index')),
      alias: stripBrackets(attrStr(obj, 'Alias')),
      indexKind: stripBrackets(attrStr(obj, 'IndexKind'))
    };
  }

  function formatPlanCost(cost) {
    const v = Number(cost);
    if (!Number.isFinite(v)) return null;
    if (v >= 1) return v.toFixed(7).replace('.', ',');
    if (v >= 0.001) return v.toFixed(7).replace('.', ',');
    return v.toExponential(2).replace('.', ',');
  }

  function formatPlanNumber(n, decimals) {
    const v = Number(n);
    if (!Number.isFinite(v)) return null;
    return v.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals != null ? decimals : 2
    });
  }

  function formatPlanBytes(bytes) {
    const v = Number(bytes);
    if (!Number.isFinite(v) || v < 0) return null;
    if (v >= 1024) return Math.round(v / 1024) + ' KB';
    return Math.round(v) + ' B';
  }

  function estimateDataSizeBytes(rows, avgRowSize) {
    const r = Number(rows);
    const s = Number(avgRowSize);
    if (!Number.isFinite(r) || !Number.isFinite(s)) return null;
    return r * s;
  }

  function extractWarningsFromPlan(queryPlan) {
    const items = [];
    const wRoot = firstLocal(queryPlan, 'Warnings');
    if (wRoot) {
      for (const el of wRoot.children) {
        if (el.namespaceURI !== SHOWPLAN_NS) continue;
        const type = el.localName;
        const attrs = {};
        for (const a of el.attributes) attrs[a.name] = a.value;
        items.push({ type, ...attrs });
      }
    }
    return items;
  }

  function extractMissingIndexes(queryPlan) {
    const groups = [];
    const miRoot = firstLocal(queryPlan, 'MissingIndexes');
    if (!miRoot) return groups;
    for (const grp of localElements(miRoot, 'MissingIndexGroup')) {
      const impact = attrNum(grp, 'Impact');
      for (const mi of localElements(grp, 'MissingIndex')) {
        const cols = { equality: [], inequality: [], include: [] };
        for (const cg of localElements(mi, 'ColumnGroup')) {
          const usage = (attrStr(cg, 'Usage') || '').toLowerCase();
          const key =
            usage === 'equality'
              ? 'equality'
              : usage === 'inequality'
                ? 'inequality'
                : 'include';
          for (const col of localElements(cg, 'Column')) {
            cols[key].push(attrStr(col, 'Name').replace(/^\[|\]$/g, ''));
          }
        }
        groups.push({
          impact,
          database: attrStr(mi, 'Database').replace(/^\[|\]$/g, ''),
          schema: attrStr(mi, 'Schema').replace(/^\[|\]$/g, ''),
          table: attrStr(mi, 'Table').replace(/^\[|\]$/g, ''),
          columns: cols
        });
      }
    }
    return groups;
  }

  function childRelOps(relOp) {
    const children = [];
    for (const child of relOp.children) {
      if (child.namespaceURI !== SHOWPLAN_NS) continue;
      for (const rel of localElements(child, 'RelOp')) {
        if (rel.parentElement === child) children.push(rel);
      }
    }
    return children;
  }

  function parseRelOp(relOpEl, statementCost) {
    const subtreeCost = attrNum(relOpEl, 'EstimatedTotalSubtreeCost') || 0;
    const physicalOp = attrStr(relOpEl, 'PhysicalOp');
    const logicalOp = attrStr(relOpEl, 'LogicalOp');
    const estRows = attrNum(relOpEl, 'EstimateRows');
    const actualRows = sumRuntimeCounters(relOpEl, 'ActualRows');
    const actualRowsRead = sumRuntimeCounters(relOpEl, 'ActualRowsRead');
    const estRowsRead = attrNum(relOpEl, 'EstimatedRowsRead');
    const tableCardinality = attrNum(relOpEl, 'TableCardinality');
    const parallel = attrStr(relOpEl, 'Parallel') === 'true';
    const obj = extractObjectRef(relOpEl);

    const relWarnings = [];
    for (const child of relOpEl.children) {
      if (child.localName === 'Warnings' && child.namespaceURI === SHOWPLAN_NS) {
        for (const a of child.attributes) {
          if (a.value === 'true') relWarnings.push(a.name);
        }
      }
    }

    const estimateCpu = attrNum(relOpEl, 'EstimateCPU') || 0;
    const estimateIo = attrNum(relOpEl, 'EstimateIO') || 0;
    const avgRowSize = attrNum(relOpEl, 'AvgRowSize');

    const node = {
      nodeId: attrStr(relOpEl, 'NodeId'),
      physicalOp,
      logicalOp,
      estimateRows: estRows,
      actualRows,
      actualRowsRead,
      estimateRowsRead: estRowsRead,
      subtreeCost,
      estimateCpu,
      estimateIo,
      estimateOperatorCost: estimateCpu + estimateIo,
      avgRowSize,
      estimateRebinds: attrNum(relOpEl, 'EstimateRebinds'),
      estimateRewinds: attrNum(relOpEl, 'EstimateRewinds'),
      estimatedExecutionMode: attrStr(relOpEl, 'EstimatedExecutionMode'),
      costPercent:
        statementCost > 0 ? Math.round((subtreeCost / statementCost) * 1000) / 10 : 0,
      parallel,
      tableCardinality,
      objectRef: obj,
      label: buildNodeLabel(physicalOp, logicalOp, obj),
      actualLogicalReads: sumRuntimeCounters(relOpEl, 'ActualLogicalReads'),
      actualPhysicalReads: sumRuntimeCounters(relOpEl, 'ActualPhysicalReads'),
      actualElapsedMs: sumRuntimeCounters(relOpEl, 'ActualElapsedms'),
      actualCpuMs: sumRuntimeCounters(relOpEl, 'ActualCPUms'),
      actualExecutions: sumRuntimeCounters(relOpEl, 'ActualExecutions'),
      actualRebinds: sumRuntimeCounters(relOpEl, 'ActualRebinds'),
      actualRewinds: sumRuntimeCounters(relOpEl, 'ActualRewinds'),
      ordered: extractOrdered(relOpEl),
      outputList: extractOutputList(relOpEl),
      predicate: scalarStringUnder(relOpEl, 'Predicate'),
      seekPredicates: extractSeekPredicates(relOpEl),
      orderBy: extractOrderBy(relOpEl),
      groupBy: extractGroupBy(relOpEl),
      partitionColumns: extractPartitionColumns(relOpEl),
      partitioningType: extractPartitioningType(relOpEl),
      memoryFractions: extractMemoryFractions(relOpEl),
      warnings: relWarnings,
      rowMismatch: rowMismatchLevel(estRows, actualRows),
      isScan: SCAN_OPS.test(physicalOp) || SCAN_OPS.test(logicalOp),
      isSeek: SEEK_OPS.test(physicalOp) || SEEK_OPS.test(logicalOp),
      children: []
    };

    node.children = childRelOps(relOpEl).map((c) => parseRelOp(c, statementCost));
    if (SqlHelp.getPlanOperatorMeta) {
      node.operatorMeta = SqlHelp.getPlanOperatorMeta(physicalOp, logicalOp);
    }
    return node;
  }

  function formatPlanObjectTable(obj) {
    if (!obj || !obj.table) return '';
    if (obj.schema) return '[' + obj.schema + '].[' + obj.table + ']';
    return obj.table;
  }

  function formatPlanObjectIndex(obj) {
    if (!obj || !obj.index) return '';
    return '[' + obj.index + ']';
  }

  function buildNodeLabel(physicalOp, logicalOp, obj) {
    const parts = [physicalOp || logicalOp];
    if (obj && obj.table) {
      let t = formatPlanObjectTable(obj);
      if (obj.alias && obj.alias !== obj.table) t += ' AS ' + obj.alias;
      parts.push(t);
    }
    const idx = formatPlanObjectIndex(obj);
    if (idx) parts.push(idx);
    return parts.join('\n');
  }

  function rowMismatchLevel(est, actual) {
    if (actual == null || est == null) return null;
    const e = Number(est);
    const a = Number(actual);
    if (!Number.isFinite(e) || !Number.isFinite(a)) return null;
    if (e === 0 && a === 0) return null;
    const ratio = e > 0 ? a / e : a > 0 ? 1000 : 1;
    if (ratio >= 10 || ratio <= 0.1) return 'high';
    if (ratio >= 3 || ratio <= 0.33) return 'medium';
    return null;
  }

  function flattenPlan(node, list, depth) {
    const d = depth == null ? 0 : depth;
    node.depth = d;
    list.push(node);
    for (const c of node.children) flattenPlan(c, list, d + 1);
  }

  function collectTableIo(nodes) {
    const map = new Map();
    for (const n of nodes) {
      if (!n.objectRef || !n.objectRef.table) continue;
      if (n.actualLogicalReads == null && n.actualRows == null) continue;
      const key = [n.objectRef.database, n.objectRef.schema, n.objectRef.table, n.objectRef.index]
        .filter(Boolean)
        .join('.');
      const reads = n.actualLogicalReads || 0;
      const prev = map.get(key) || {
        database: n.objectRef.database,
        schema: n.objectRef.schema,
        table: n.objectRef.table,
        index: n.objectRef.index || '—',
        logicalReads: 0,
        physicalReads: 0,
        actualRows: 0,
        ops: new Set(),
        primaryNodeId: null,
        _maxReads: -1
      };
      prev.logicalReads += reads;
      prev.physicalReads += n.actualPhysicalReads || 0;
      prev.actualRows += n.actualRows || 0;
      prev.ops.add(n.physicalOp);
      if (reads >= prev._maxReads) {
        prev._maxReads = reads;
        prev.primaryNodeId = n.nodeId;
      }
      map.set(key, prev);
    }
    return Array.from(map.values())
      .map((r) => {
        const { _maxReads, ops, ...rest } = r;
        return { ...rest, ops: Array.from(ops).join(', ') };
      })
      .sort((a, b) => b.logicalReads - a.logicalReads);
  }

  function parseStatement(stmtEl, batchIndex) {
    const tag = stmtEl.localName;
    const statementText = decodeStatementText(attrStr(stmtEl, 'StatementText'));
    const statementCost = attrNum(stmtEl, 'StatementSubTreeCost') || 0;
    const statementEstRows = attrNum(stmtEl, 'StatementEstRows');
    const queryPlan = firstLocal(stmtEl, 'QueryPlan');

    let planRoot = null;
    let actualRows = null;
    let compileTime = null;
    let cpuTime = null;
    let elapsedTime = null;
    let degreeOfParallelism = null;
    let warnings = [];
    let missingIndexes = [];
    let cardinalityModel = attrNum(stmtEl, 'CardinalityEstimationModelVersion');

    if (queryPlan) {
      compileTime = attrNum(queryPlan, 'CompileTime');
      degreeOfParallelism = attrNum(queryPlan, 'DegreeOfParallelism');
      warnings = extractWarningsFromPlan(queryPlan);
      missingIndexes = extractMissingIndexes(queryPlan);
      const qts = firstLocal(queryPlan, 'QueryTimeStats');
      if (qts) {
        cpuTime = attrNum(qts, 'CpuTime');
        elapsedTime = attrNum(qts, 'ElapsedTime');
      }
      const rootRel = firstLocal(queryPlan, 'RelOp');
      if (rootRel) {
        planRoot = parseRelOp(rootRel, statementCost || 1);
        actualRows = planRoot.actualRows;
      }
    }

    const flat = [];
    if (planRoot) flattenPlan(planRoot, flat);

    const totalLogicalReads = flat.reduce((s, n) => s + (n.actualLogicalReads || 0), 0);
    const topOps = flat
      .slice()
      .sort((a, b) => b.subtreeCost - a.subtreeCost)
      .slice(0, 25);

    const issues = detectIssues({
      statementEstRows,
      actualRows,
      warnings,
      missingIndexes,
      flat,
      statementCost
    });

    return {
      batchIndex,
      statementId: attrStr(stmtEl, 'StatementId'),
      statementType: attrStr(stmtEl, 'StatementType'),
      optmLevel: attrStr(stmtEl, 'StatementOptmLevel'),
      statementText,
      statementPreview: statementText.replace(/\s+/g, ' ').trim().slice(0, 120),
      statementCost,
      statementEstRows,
      actualRows,
      compileTime,
      cpuTime,
      elapsedTime,
      degreeOfParallelism,
      cardinalityModel,
      queryHash: attrStr(stmtEl, 'QueryHash'),
      planHash: attrStr(stmtEl, 'QueryPlanHash'),
      warnings,
      missingIndexes,
      planRoot,
      flatOps: flat,
      topOps,
      tableIo: collectTableIo(flat),
      totalLogicalReads,
      rowMismatch: rowMismatchLevel(statementEstRows, actualRows),
      issues
    };
  }

  function detectIssues(ctx) {
    const issues = [];
    for (const w of ctx.warnings) {
      if (w.type === 'PlanAffectingConvert') {
        issues.push({
          severity: 'warning',
          code: 'implicit_convert',
          message: `Conversão implícita (${w.ConvertIssue || 'plan'}): ${w.Expression || ''}`
        });
      }
    }
    for (const mi of ctx.missingIndexes) {
      issues.push({
        severity: 'info',
        code: 'missing_index',
        message: `Índice sugerido em ${mi.table} (impacto ${mi.impact != null ? mi.impact.toFixed(2) : '?'}%)`,
        detail: mi
      });
    }
    const stmtRowMismatch = rowMismatchLevel(ctx.statementEstRows, ctx.actualRows);
    if (stmtRowMismatch === 'high' || stmtRowMismatch === 'medium') {
      issues.push({
        severity: stmtRowMismatch === 'high' ? 'danger' : 'warning',
        code: 'row_estimate',
        message: `Estimativa de linhas divergente: estimado ${ctx.statementEstRows}, atual ${ctx.actualRows}`
      });
    }
    for (const n of ctx.flat) {
      if (n.rowMismatch === 'high') {
        issues.push({
          severity: 'danger',
          code: 'op_row_estimate',
          message: `Operador ${n.physicalOp}: estimado ${n.estimateRows}, atual ${n.actualRows}`,
          nodeId: n.nodeId
        });
      }
      if (n.warnings.includes('NoJoinPredicate')) {
        issues.push({
          severity: 'warning',
          code: 'cartesian',
          message: `Join sem predicado (CROSS JOIN implícito) — ${n.physicalOp}`,
          nodeId: n.nodeId
        });
      }
      if (n.isScan && n.tableCardinality > 1000 && (n.costPercent || 0) >= 5) {
        issues.push({
          severity: 'warning',
          code: 'large_scan',
          message: `Scan custoso em ${n.objectRef?.table || 'tabela'} (~${n.tableCardinality} linhas, ${n.costPercent}% do plano)`,
          nodeId: n.nodeId
        });
      }
    }
    return issues;
  }

  function collectStatements(doc) {
    const statements = [];
    const batches = localElements(doc.documentElement, 'Batch');
    batches.forEach((batch, batchIndex) => {
      const stmtsContainer = firstLocal(batch, 'Statements');
      if (!stmtsContainer) return;
      for (const child of stmtsContainer.children) {
        if (child.namespaceURI !== SHOWPLAN_NS) continue;
        if (child.localName === 'StmtSimple' || child.localName === 'StmtCond') {
          if (child.localName === 'StmtCond') {
            for (const inner of child.children) {
              if (inner.localName === 'StmtSimple' && inner.namespaceURI === SHOWPLAN_NS) {
                statements.push(parseStatement(inner, batchIndex));
              }
            }
          } else {
            statements.push(parseStatement(child, batchIndex));
          }
        }
      }
    });
    return statements;
  }

  function parseShowPlanXml(xmlText) {
    const text = String(xmlText || '').trim();
    if (!text) throw new Error('XML vazio. Cole ou importe um plano de execução (.sqlplan / XML).');

    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) {
      throw new Error('XML inválido: ' + (parseErr.textContent || 'erro de parse').slice(0, 200));
    }

    const root = doc.documentElement;
    if (!root || root.localName !== 'ShowPlanXML') {
      throw new Error('Arquivo não reconhecido. Esperado ShowPlanXML de plano de execução do SQL Server.');
    }

    const statements = collectStatements(doc);
    if (!statements.length) {
      throw new Error('Nenhum statement encontrado no plano.');
    }

    const totalCost = statements.reduce((s, st) => s + (st.statementCost || 0), 0);
    statements.forEach((st) => {
      st.costPercent = totalCost > 0 ? Math.round((st.statementCost / totalCost) * 1000) / 10 : 0;
    });

    const allIssues = statements.flatMap((st) =>
      st.issues.map((i) => ({ ...i, statementId: st.statementId }))
    );
    const allMissing = statements.flatMap((st) => st.missingIndexes);

    return {
      version: attrStr(root, 'Version'),
      build: attrStr(root, 'Build'),
      statementCount: statements.length,
      totalCost,
      totalCompileMs: statements.reduce((s, st) => s + (st.compileTime || 0), 0),
      totalCpuMs: statements.reduce((s, st) => s + (st.cpuTime || 0), 0),
      totalElapsedMs: statements.reduce((s, st) => s + (st.elapsedTime || 0), 0),
      totalLogicalReads: statements.reduce((s, st) => s + (st.totalLogicalReads || 0), 0),
      issueCount: allIssues.length,
      dangerCount: allIssues.filter((i) => i.severity === 'danger').length,
      warningCount: allIssues.filter((i) => i.severity === 'warning').length,
      missingIndexCount: allMissing.length,
      statements,
      allIssues,
      allMissingIndexes: allMissing
    };
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function splitPlanLogicalLines(expr) {
    let s = String(expr || '').trim();
    if (!s) return '';
    s = s.replace(/([)\]'"0-9])(\s*)(AND|OR)(\s+)/gi, '$1\n$3 ');
    s = s.replace(/\s+(AND|OR)\s+/gi, '\n$1 ');
    if (!/\b(AND|OR)\b/i.test(s) && s.includes(',')) {
      s = s.split(/,\s*/).join(',\n');
    }
    return s
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  function simplifyPathRefs(text) {
    const refs = [];
    let idx = 0;
    function placeholder(display, full) {
      const token = '@@PLANREF' + idx + '@@';
      refs.push({ token, display, title: full });
      idx += 1;
      return token;
    }

    let out = text;

    out = out.replace(
      /\[([^\]]+)\]\.\[([^\]]+)\]\.\[([^\]]+)\]\.\[([^\]]+)\]\s+as\s+(\[[^\]]+\])\.\[([^\]]+)\]/gi,
      (full, _db, _sch, _tbl, _col, alias, acol) => placeholder(alias + '.[' + acol + ']', full)
    );

    out = out.replace(
      /\[([^\]]+)\]\.\[([^\]]+)\]\.\[([^\]]+)\]\s+as\s+(\[[^\]]+)\]\.\[([^\]]+)\]/gi,
      (full, _a, _b, _col, alias, acol) => placeholder(alias + '.[' + acol + ']', full)
    );

    out = out.replace(
      /\[([^\]]+)\]\.\[([^\]]+)\]\.\[([^\]]+)\]\s+as\s+(\[[^\]]+)\]/gi,
      (full, _db, _sch, _tbl, alias) => placeholder(alias, full)
    );

    out = out.replace(
      /\[([^\]]+)\]\.\[([^\]]+)\]\s+as\s+(\[[^\]]+)\]/gi,
      (full, _sch, _tbl, alias) => placeholder(alias, full)
    );

    return { text: out, refs };
  }

  function highlightExprCode(text) {
    const g = typeof window !== 'undefined' ? window : global;
    if (typeof g.hljs !== 'undefined' && typeof g.hljs.highlight === 'function') {
      try {
        return g.hljs.highlight(text, { language: 'sql', ignoreIllegals: true }).value;
      } catch (e) {
        /* fallback */
      }
    }
    if (SqlHelp.highlightSql && SqlHelp.highlightSql !== highlightPlanSql) {
      return SqlHelp.highlightSql(text);
    }
    const escaped = escapeHtml(text);
    const keywords =
      /\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|CROSS|ON|AND|OR|NOT|IN|EXISTS|GROUP|BY|ORDER|HAVING|INSERT|INTO|UPDATE|SET|DELETE|VALUES|AS|CASE|WHEN|THEN|ELSE|END|WITH|UNION|ALL|DISTINCT|TOP|DECLARE|CREATE|TABLE|INDEX|PIVOT|FOR|OPENJSON|APPLY|STRING_AGG|CAST|CONVERT|IS|NULL|LIKE|BETWEEN|dateadd|CONVERT_IMPLICIT)\b/gi;
    return escaped.replace(keywords, '<span class="sql-kw">$1</span>');
  }

  function refSpanHtml(ref) {
    return (
      '<span class="plan-expr-ref" title="' +
      escapeAttr(ref.title) +
      '">' +
      escapeHtml(ref.display) +
      '</span>'
    );
  }

  function formatPlanExprHtml(expr) {
    const raw = String(expr || '').trim();
    if (!raw) return '';
    const lined = splitPlanLogicalLines(raw);
    const { text, refs } = simplifyPathRefs(lined);
    const refByToken = {};
    for (const r of refs) refByToken[r.token] = r;

    const parts = text.split(/(@@PLANREF\d+@@)/g);
    let html = '';
    for (const part of parts) {
      if (!part) continue;
      const ref = refByToken[part];
      if (ref) {
        html += refSpanHtml(ref);
      } else {
        html += highlightExprCode(part);
      }
    }
    return '<code class="hljs language-sql">' + html + '</code>';
  }

  function highlightPlanSql(sql) {
    const g = typeof window !== 'undefined' ? window : global;
    if (SqlHelp.highlightSql && typeof SqlHelp.highlightSql === 'function') {
      return SqlHelp.highlightSql(sql);
    }
    if (typeof g.hljs !== 'undefined' && typeof g.hljs.highlight === 'function') {
      try {
        return g.hljs.highlight(String(sql || ''), { language: 'sql', ignoreIllegals: true }).value;
      } catch (e) {
        /* fallback */
      }
    }
    const escaped = escapeHtml(sql);
    const keywords =
      /\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|CROSS|ON|AND|OR|NOT|IN|EXISTS|GROUP|BY|ORDER|HAVING|INSERT|INTO|UPDATE|SET|DELETE|VALUES|AS|CASE|WHEN|THEN|ELSE|END|WITH|UNION|ALL|DISTINCT|TOP|DECLARE|CREATE|TABLE|INDEX|PIVOT|FOR|OPENJSON|APPLY|OUTER|STRING_AGG|CAST|CONVERT)\b/gi;
    return escaped.replace(keywords, '<span class="sql-kw">$1</span>');
  }

  function subtreeCpu(node) {
    let cpu = node.estimateCpu || 0;
    for (const ch of node.children || []) {
      cpu += subtreeCpu(ch);
    }
    return cpu;
  }

  function subtreeIo(node) {
    let io = node.estimateIo || 0;
    for (const ch of node.children || []) {
      io += subtreeIo(ch);
    }
    return io;
  }

  function applyCostPercentWalk(node, getNodeCost, total) {
    const cost = getNodeCost(node);
    node.costPercent = total > 0 ? Math.round((cost / total) * 1000) / 10 : 0;
    for (const ch of node.children || []) {
      applyCostPercentWalk(ch, getNodeCost, total);
    }
  }

  function isIoMode(mode) {
    return mode === 'io' || mode === 'io-sentry';
  }

  function isCpuMode(mode) {
    return mode === 'cpu' || mode === 'cpu-sentry';
  }

  function localCostByMode(node, mode) {
    if (isIoMode(mode)) return node.estimateIo || 0;
    if (isCpuMode(mode)) return node.estimateCpu || 0;
    return (node.estimateIo || 0) + (node.estimateCpu || 0);
  }

  function cumulativeCostByMode(node, mode) {
    if (isIoMode(mode)) return subtreeIo(node);
    if (isCpuMode(mode)) return subtreeCpu(node);
    return node.subtreeCost || 0;
  }

  function denominatorByModeAndScope(planRoot, mode, statementCost, scope) {
    const stmtTotal = statementCost || planRoot.subtreeCost || 0;
    if (scope === 'perNode') return stmtTotal;
    if (isIoMode(mode)) return subtreeIo(planRoot);
    if (isCpuMode(mode)) return subtreeCpu(planRoot);
    return planRoot.subtreeCost || 0;
  }

  function applyDiagramCostMode(planRoot, mode, statementCost, scope) {
    if (!planRoot) return;
    const m = mode || 'both';
    const s = scope === 'perNode' ? 'perNode' : 'cumulative';
    const total = denominatorByModeAndScope(planRoot, m, statementCost, s);
    const getCost = s === 'perNode' ? (n) => localCostByMode(n, m) : (n) => cumulativeCostByMode(n, m);
    applyCostPercentWalk(planRoot, getCost, total);
  }

  const DIAGRAM_COST_SCOPES = [
    {
      id: 'cumulative',
      label: 'Cumulativo (subárvore)',
      tooltip:
        'Percentual do custo acumulado na subárvore do operador (inclui filhos). Pais costumam mostrar % alto; equivalente a Show Cumulative Costs no Plan Explorer.'
    },
    {
      id: 'perNode',
      label: 'Por nó (operador)',
      tooltip:
        'Percentual só do custo local do operador (EstimateIO/CPU) ÷ StatementSubTreeCost. Equivalente a Show Per Node Costs no Plan Explorer.'
    }
  ];

  const DIAGRAM_COST_MODES = [
    {
      id: 'both',
      label: 'I/O + CPU',
      tooltip:
        'Custo total da subárvore (EstimatedTotalSubtreeCost) ÷ custo total do statement. Equivale ao padrão do SSMS e Plan Explorer.'
    },
    {
      id: 'io',
      label: 'I/O',
      tooltip:
        'Custo de I/O cumulativo da subárvore do operador ÷ soma total de I/O do plano. Destaca ramos com mais leitura física/lógica.'
    },
    {
      id: 'cpu',
      label: 'CPU',
      tooltip:
        'Custo de CPU cumulativo da subárvore do operador ÷ soma total de CPU do plano. Destaca operadores mais pesados em processamento.'
    },
    {
      id: 'io-sentry',
      label: 'I/O (Sentry)',
      tooltip:
        'EstimateIO local do operador ÷ StatementSubTreeCost do statement. Mesma regra do Plan Explorer em Costs By → I/O.'
    },
    {
      id: 'cpu-sentry',
      label: 'CPU (Sentry)',
      tooltip:
        'EstimateCPU local do operador ÷ StatementSubTreeCost do statement. Mesma regra do Plan Explorer em Costs By → CPU.'
    }
  ];

  function nodeIdMatches(issueNodeId, nodeId) {
    if (issueNodeId == null || issueNodeId === '') return false;
    return String(issueNodeId) === String(nodeId);
  }

  function getNodeIssues(statementIssues, nodeId) {
    return (statementIssues || []).filter((i) => nodeIdMatches(i.nodeId, nodeId));
  }

  function getNodeAlertCount(node, statementIssues) {
    if (!node) return 0;
    let n = (node.warnings || []).length;
    n += getNodeIssues(statementIssues, node.nodeId).length;
    if (node.rowMismatch === 'high' || node.rowMismatch === 'medium') n += 1;
    return n;
  }

  function getNodeAlertMessages(node, statementIssues) {
    if (!node) return [];
    const msgs = [];
    for (const w of node.warnings || []) {
      msgs.push(WARNING_FLAG_LABELS[w] || w);
    }
    for (const i of getNodeIssues(statementIssues, node.nodeId)) {
      msgs.push(i.message);
    }
    if (node.rowMismatch === 'high' || node.rowMismatch === 'medium') {
      msgs.push(
        'Estimativa de linhas divergente: estimado ' +
          node.estimateRows +
          ', atual ' +
          node.actualRows
      );
    }
    return msgs;
  }

  function pushDetailProp(list, label, value) {
    if (value != null && value !== '' && value !== '—') list.push({ label, value });
  }

  function pushMetricCell(list, label, value, tone) {
    if (value == null || value === '' || value === '—') return;
    list.push({ label, value: String(value), tone: tone || null });
  }

  function shortHeaderDescription(text, maxLen) {
    if (!text) return '';
    const clean = String(text).trim();
    const first = clean.split(/(?<=[.!?])\s+/)[0] || clean;
    const base = first.length <= maxLen ? first : clean;
    if (base.length <= maxLen) return base;
    return base.slice(0, maxLen - 1) + '…';
  }

  function buildPlanMetricGroups(node) {
    const groups = [];

    const opCells = [];
    pushMetricCell(opCells, 'Nó', node.nodeId, null);
    pushMetricCell(opCells, 'Físico', node.physicalOp, 'primary');
    if (node.logicalOp && node.logicalOp !== node.physicalOp) {
      pushMetricCell(opCells, 'Lógico', node.logicalOp, null);
    }
    pushMetricCell(opCells, 'Modo', node.estimatedExecutionMode, null);
    pushMetricCell(opCells, 'Partição', node.partitioningType, null);
    if (node.parallel) pushMetricCell(opCells, 'Paralelo', 'Sim', 'accent');
    if (node.ordered != null) {
      pushMetricCell(opCells, 'Ordenado', node.ordered ? 'Sim' : 'Não', null);
    }
    if (opCells.length) groups.push({ id: 'op', title: 'Operador', cells: opCells });

    const obj = node.objectRef;
    if (obj && (obj.database || obj.table)) {
      const objCells = [];
      if (obj.database) pushMetricCell(objCells, 'Banco', '[' + obj.database + ']', null);
      let tableLine = formatPlanObjectTable(obj);
      if (obj.alias && obj.alias !== obj.table) tableLine += ' as [' + obj.alias + ']';
      pushMetricCell(objCells, 'Tabela', tableLine, 'primary');
      if (objCells.length) objCells[objCells.length - 1].wide = true;
      const idx = formatPlanObjectIndex(obj);
      if (idx) {
        const idxLabel =
          obj.indexKind && /cluster/i.test(obj.indexKind) ? 'Índice clustered' : 'Índice';
        pushMetricCell(objCells, idxLabel, idx, null);
        objCells[objCells.length - 1].wide = true;
      }
      if (objCells.length) groups.push({ id: 'object', title: 'Objeto', cells: objCells });
    }

    const rowCells = [];
    const estRows = formatPlanNumber(node.estimateRows, 0);
    const actRows = formatPlanNumber(node.actualRows, 0);
    const rowTone =
      node.rowMismatch === 'high' ? 'danger' : node.rowMismatch === 'medium' ? 'warn' : null;
    pushMetricCell(rowCells, 'Linhas est.', estRows, 'muted');
    if (actRows != null) pushMetricCell(rowCells, 'Linhas reais', actRows, rowTone || 'ok');
    pushMetricCell(rowCells, 'Lidas (est.)', formatPlanNumber(node.estimateRowsRead, 0), 'muted');
    pushMetricCell(rowCells, 'Lidas (real)', formatPlanNumber(node.actualRowsRead, 0), null);
    pushMetricCell(rowCells, 'Execuções', formatPlanNumber(node.actualExecutions, 0), null);
    if (rowCells.length) {
      groups.push({ id: 'rows', title: 'Linhas', cells: rowCells, highlight: rowTone });
    }

    const costCells = [];
    const pct = Number(node.costPercent);
    const costTone = pct >= 30 ? 'danger' : pct >= 10 ? 'warn' : null;
    pushMetricCell(costCells, 'I/O est.', formatPlanCost(node.estimateIo), 'muted');
    pushMetricCell(costCells, 'CPU est.', formatPlanCost(node.estimateCpu), 'muted');
    const opCost = formatPlanCost(node.estimateOperatorCost);
    if (opCost != null) {
      const pctStr = Number.isFinite(pct) ? ' · ' + pct.toFixed(1).replace('.', ',') + '%' : '';
      pushMetricCell(costCells, 'Custo operador', opCost + pctStr, costTone);
    }
    pushMetricCell(costCells, 'Custo subárvore', formatPlanCost(node.subtreeCost), costTone);
    if (costCells.length) groups.push({ id: 'cost', title: 'Custo', cells: costCells, highlight: costTone });

    const sizeCells = [];
    pushMetricCell(
      sizeCells,
      'Tam. linha est.',
      node.avgRowSize != null ? node.avgRowSize + ' B' : null,
      'muted'
    );
    pushMetricCell(
      sizeCells,
      'Dados reais',
      formatPlanBytes(estimateDataSizeBytes(node.actualRows, node.avgRowSize)),
      null
    );
    pushMetricCell(
      sizeCells,
      'Dados est.',
      formatPlanBytes(estimateDataSizeBytes(node.estimateRows, node.avgRowSize)),
      'muted'
    );
    if (sizeCells.length) groups.push({ id: 'size', title: 'Tamanho', cells: sizeCells });

    const rebindCells = [];
    pushMetricCell(rebindCells, 'Rebinds (real)', formatPlanNumber(node.actualRebinds, 0), null);
    pushMetricCell(rebindCells, 'Rewinds (real)', formatPlanNumber(node.actualRewinds, 0), null);
    pushMetricCell(rebindCells, 'Rebinds (est.)', formatPlanNumber(node.estimateRebinds, 1), 'muted');
    pushMetricCell(rebindCells, 'Rewinds (est.)', formatPlanNumber(node.estimateRewinds, 1), 'muted');
    const showRebinds =
      (node.actualRebinds != null && node.actualRebinds > 0) ||
      (node.actualRewinds != null && node.actualRewinds > 0) ||
      (node.estimateRebinds != null && node.estimateRebinds !== 1) ||
      (node.estimateRewinds != null && node.estimateRewinds !== 1);
    if (showRebinds && rebindCells.length) {
      groups.push({ id: 'rebinds', title: 'Rebinds / Rewinds', cells: rebindCells });
    }

    return groups;
  }

  function buildPlanNodeDetail(node, statementIssues) {
    if (!node) return null;
    const meta =
      node.operatorMeta ||
      (SqlHelp.getPlanOperatorMeta
        ? SqlHelp.getPlanOperatorMeta(node.physicalOp, node.logicalOp)
        : null);
    const title = node.physicalOp || node.logicalOp || (meta && meta.name) || 'Operador';
    const descriptionFull = meta ? meta.description : '';
    const descriptionEn = meta ? meta.descriptionEn : '';
    const headerDescription = shortHeaderDescription(descriptionFull, 140);
    const showDescriptionInBody = descriptionFull.length > 140;
    const warnings = getNodeAlertMessages(node, statementIssues);
    const metricGroups = buildPlanMetricGroups(node);

    const sections = [];

    if (node.predicate) {
      sections.push({ title: 'Predicate', content: node.predicate, variant: 'code' });
    }
    if (node.seekPredicates) {
      sections.push({ title: 'Seek Predicates', content: node.seekPredicates, variant: 'code' });
    }
    if (node.orderBy) {
      sections.push({ title: 'Order By', content: node.orderBy, variant: 'code' });
    }
    if (node.groupBy) {
      sections.push({ title: 'Group By', content: node.groupBy, variant: 'code' });
    }
    if (node.partitionColumns) {
      sections.push({ title: 'Partition Columns', content: node.partitionColumns, variant: 'code' });
    }
    if (node.memoryFractions) {
      sections.push({ title: 'Memory Fractions', content: node.memoryFractions, variant: 'code' });
    }
    if (node.outputList && node.outputList.length) {
      sections.push({
        title: 'Output List',
        content: node.outputList.join(', '),
        variant: 'code'
      });
    }

    return {
      title,
      headerDescription,
      descriptionFull: showDescriptionInBody ? descriptionFull : '',
      descriptionEn:
        descriptionEn && descriptionEn.trim() && descriptionEn !== descriptionFull
          ? descriptionEn
          : '',
      docUrl: meta ? meta.docUrl : SqlHelp.PLAN_OPERATORS_DOC_URL || '',
      iconUrl: meta ? meta.iconUrl : '',
      operatorKind: meta ? meta.operatorKind : '',
      operatorMeta: meta,
      warnings,
      metricGroups,
      sections
    };
  }

  function findPlanNodeById(flatOps, nodeId) {
    if (nodeId == null || nodeId === '') return null;
    return (flatOps || []).find((n) => String(n.nodeId) === String(nodeId)) || null;
  }

  SqlHelp.findPlanNodeById = findPlanNodeById;
  SqlHelp.parseShowPlanXml = parseShowPlanXml;
  SqlHelp.highlightPlanSql = highlightPlanSql;
  SqlHelp.formatPlanExprHtml = formatPlanExprHtml;
  SqlHelp.formatPlanObjectTable = formatPlanObjectTable;
  SqlHelp.formatPlanObjectIndex = formatPlanObjectIndex;
  SqlHelp.getNodeAlertCount = getNodeAlertCount;
  SqlHelp.getNodeAlertMessages = getNodeAlertMessages;
  SqlHelp.buildPlanNodeDetail = buildPlanNodeDetail;
  SqlHelp.applyDiagramCostMode = applyDiagramCostMode;
  SqlHelp.DIAGRAM_COST_MODES = DIAGRAM_COST_MODES;
  SqlHelp.DIAGRAM_COST_SCOPES = DIAGRAM_COST_SCOPES;
  SqlHelp.PLAN_SAMPLE_PATH = 'samples/Plano de execução.xml';
})(typeof window !== 'undefined' ? window : this);
