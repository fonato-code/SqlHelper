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
      database: attrStr(obj, 'Database').replace(/^\[|\]$/g, ''),
      schema: attrStr(obj, 'Schema').replace(/^\[|\]$/g, ''),
      table: attrStr(obj, 'Table').replace(/^\[|\]$/g, ''),
      index: attrStr(obj, 'Index').replace(/^\[|\]$/g, ''),
      alias: attrStr(obj, 'Alias').replace(/^\[|\]$/g, '')
    };
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

    const node = {
      nodeId: attrStr(relOpEl, 'NodeId'),
      physicalOp,
      logicalOp,
      estimateRows: estRows,
      actualRows,
      actualRowsRead,
      estimateRowsRead: estRowsRead,
      subtreeCost,
      estimateCpu: attrNum(relOpEl, 'EstimateCPU') || 0,
      estimateIo: attrNum(relOpEl, 'EstimateIO') || 0,
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
      warnings: relWarnings,
      rowMismatch: rowMismatchLevel(estRows, actualRows),
      isScan: SCAN_OPS.test(physicalOp) || SCAN_OPS.test(logicalOp),
      isSeek: SEEK_OPS.test(physicalOp) || SEEK_OPS.test(logicalOp),
      children: []
    };

    node.children = childRelOps(relOpEl).map((c) => parseRelOp(c, statementCost));
    return node;
  }

  function buildNodeLabel(physicalOp, logicalOp, obj) {
    const parts = [physicalOp || logicalOp];
    if (obj && obj.table) {
      let t = obj.table;
      if (obj.alias && obj.alias !== obj.table) t += ' AS ' + obj.alias;
      parts.push(t);
    }
    if (obj && obj.index) parts.push('(' + obj.index + ')');
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

  function flattenPlan(node, list) {
    list.push(node);
    for (const c of node.children) flattenPlan(c, list);
  }

  function collectTableIo(nodes) {
    const map = new Map();
    for (const n of nodes) {
      if (!n.objectRef || !n.objectRef.table) continue;
      if (n.actualLogicalReads == null && n.actualRows == null) continue;
      const key = [n.objectRef.database, n.objectRef.schema, n.objectRef.table, n.objectRef.index]
        .filter(Boolean)
        .join('.');
      const prev = map.get(key) || {
        database: n.objectRef.database,
        schema: n.objectRef.schema,
        table: n.objectRef.table,
        index: n.objectRef.index || '—',
        logicalReads: 0,
        physicalReads: 0,
        actualRows: 0,
        ops: new Set()
      };
      prev.logicalReads += n.actualLogicalReads || 0;
      prev.physicalReads += n.actualPhysicalReads || 0;
      prev.actualRows += n.actualRows || 0;
      prev.ops.add(n.physicalOp);
      map.set(key, prev);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, ops: Array.from(r.ops).join(', ') }))
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
          message: `Operador ${n.physicalOp} (nó ${n.nodeId}): estimado ${n.estimateRows}, atual ${n.actualRows}`,
          nodeId: n.nodeId
        });
      }
      if (n.warnings.includes('NoJoinPredicate')) {
        issues.push({
          severity: 'warning',
          code: 'cartesian',
          message: `Join sem predicado (CROSS JOIN implícito) no nó ${n.nodeId} — ${n.physicalOp}`
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

  function highlightSql(sql) {
    const escaped = String(sql || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

  function applyDiagramCostMode(planRoot, mode, statementCost) {
    if (!planRoot) return;
    const m = mode || 'both';
    const stmtTotal = statementCost || planRoot.subtreeCost || 0;
    if (m === 'io') {
      const total = subtreeIo(planRoot);
      applyCostPercentWalk(planRoot, subtreeIo, total);
    } else if (m === 'cpu') {
      const total = subtreeCpu(planRoot);
      applyCostPercentWalk(planRoot, subtreeCpu, total);
    } else if (m === 'io-sentry') {
      applyCostPercentWalk(planRoot, (n) => n.estimateIo || 0, stmtTotal);
    } else if (m === 'cpu-sentry') {
      applyCostPercentWalk(planRoot, (n) => n.estimateCpu || 0, stmtTotal);
    } else {
      const total = planRoot.subtreeCost || 0;
      applyCostPercentWalk(planRoot, (n) => n.subtreeCost || 0, total);
    }
  }

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

  SqlHelp.parseShowPlanXml = parseShowPlanXml;
  SqlHelp.highlightPlanSql = highlightSql;
  SqlHelp.applyDiagramCostMode = applyDiagramCostMode;
  SqlHelp.DIAGRAM_COST_MODES = DIAGRAM_COST_MODES;
  SqlHelp.PLAN_SAMPLE_PATH = 'samples/Plano de execução.xml';
})(typeof window !== 'undefined' ? window : this);
