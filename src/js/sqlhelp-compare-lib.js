(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};
  var LENGTH_TYPES = SqlHelp.LENGTH_TYPES;
  var parseOptionalInt = SqlHelp.parseOptionalInt;

  var TSV_HEADERS = [
    'TableSchema', 'TableName', 'ColumnName', 'Type', 'Length', 'Prec', 'Scale', 'Nullable', 'IsIdentity'
  ];

  function tsvRowToCol(row) {
    const type = (row.Type || 'varchar').toLowerCase();
    const length = parseOptionalInt(row.Length);
    let lengthDisplay = '';
    if (LENGTH_TYPES.includes(type) && length != null) {
      lengthDisplay = String(length);
    }
    return {
      name: (row.ColumnName || '').trim(),
      type,
      length,
      lengthDisplay,
      prec: parseOptionalInt(row.Prec),
      scale: parseOptionalInt(row.Scale) ?? 0,
      nullable: String(row.Nullable || '').toUpperCase() === 'YES',
      isIdentity: String(row.IsIdentity || '').toUpperCase() === 'YES',
      identitySeed: 1,
      identityIncrement: 1
    };
  }

  function columnsTypeEqual(a, b) {
    if (!a || !b) return false;
    return a.type === b.type &&
      (a.lengthDisplay || '') === (b.lengthDisplay || '') &&
      a.length === b.length &&
      a.prec === b.prec &&
      a.scale === b.scale &&
      a.isIdentity === b.isIdentity;
  }

  function columnsDefinitionEqual(a, b) {
    if (!a || !b) return false;
    return columnsTypeEqual(a, b) && a.nullable === b.nullable;
  }

  function needsDefaultForColumn(origem, destino, existsInDest) {
    if (!origem || origem.nullable || origem.isIdentity) return false;
    if (!existsInDest) return true;
    return !!(destino && destino.nullable);
  }

  function isDatetime2Col(col) {
    return !!(col && (col.type || '').toLowerCase() === 'datetime2');
  }

  function datetime2Precision(col) {
    const s = col && col.scale;
    if (s != null && s > 0) return s;
    return 7;
  }

  function buildTemporalSystemTimeLines(schema, table, startCol, endCol, startColDef, endColDef) {
    const precS = datetime2Precision(startColDef);
    const precE = datetime2Precision(endColDef);
    const sch = (schema || 'dbo').toUpperCase();
    const tbl = (table || '').toUpperCase();
    const tblSafe = tbl.replace(/[^a-zA-Z0-9_]/g, '_');
    const dfStart = `DF_${tblSafe}_${startCol}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const dfEnd = `DF_${tblSafe}_${endCol}`.replace(/[^a-zA-Z0-9_]/g, '_');
    return [
      `ALTER TABLE ${sch}.${tbl}`,
      'ADD',
      `    ${startCol} DATETIME2(${precS})`,
      '        GENERATED ALWAYS AS ROW START',
      '        HIDDEN',
      '        NOT NULL',
      `        CONSTRAINT ${dfStart}`,
      '        DEFAULT SYSUTCDATETIME(),',
      '',
      `    ${endCol} DATETIME2(${precE})`,
      '        GENERATED ALWAYS AS ROW END',
      '        HIDDEN',
      '        NOT NULL',
      `        CONSTRAINT ${dfEnd}`,
      "        DEFAULT CONVERT(DATETIME2(7), '9999-12-31 23:59:59.9999999'),",
      '',
      `    PERIOD FOR SYSTEM_TIME (${startCol}, ${endCol});`
    ];
  }

  function parseTsv(text, label) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) throw new Error(label + ': arquivo vazio.');

    const headerParts = lines[0].split('\t').map(s => s.trim());
    const missing = TSV_HEADERS.filter(h => !headerParts.includes(h));
    if (missing.length) {
      throw new Error(label + ': cabeçalho inválido. Faltando: ' + missing.join(', '));
    }

    const tables = {};
    let colCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 9) continue;
      const row = {};
      TSV_HEADERS.forEach((h, idx) => { row[h] = (parts[idx] || '').trim(); });

      const schema = row.TableSchema || 'dbo';
      const tableName = row.TableName;
      const colName = row.ColumnName;
      if (!tableName || !colName) continue;

      const key = schema + '.' + tableName;
      if (!tables[key]) {
        tables[key] = {
          key,
          schema,
          name: tableName,
          columnOrder: [],
          columns: {}
        };
      }
      const tbl = tables[key];
      if (!tbl.columns[colName]) {
        tbl.columnOrder.push(colName);
      }
      tbl.columns[colName] = tsvRowToCol(row);
      colCount++;
    }

    if (!Object.keys(tables).length) {
      throw new Error(label + ': nenhuma tabela/coluna encontrada.');
    }

    return { tables, colCount, tableCount: Object.keys(tables).length };
  }

  function compareColumnStatus(origem, destino) {
    if (origem && !destino) return 'missing';
    if (!origem && destino) return 'only_dest';
    if (origem && destino && !columnsDefinitionEqual(origem, destino)) return 'diff';
    return 'same';
  }

  function wrapScriptWithTransaction(rawLines, qTable) {
    const headerComments = [];
    const statements = [];
    for (const line of rawLines) {
      const t = line.trim();
      if (t === 'GO') continue;
      if (!t) continue;
      if (t.startsWith('--')) {
        headerComments.push(line);
        continue;
      }
      if (/^SET NOCOUNT ON/i.test(t)) continue;
      statements.push(line.replace(/\s+$/, ''));
    }
    const out = [...headerComments];
    out.push('');
    out.push('SET NOCOUNT ON;');
    out.push('SET XACT_ABORT ON;');
    out.push('GO');
    out.push('');
    out.push('BEGIN TRANSACTION;');
    out.push('GO');
    out.push('');
    out.push('BEGIN TRY');
    out.push('');
    statements.forEach(stmt => out.push(stmt));
    out.push('');
    out.push('COMMIT TRANSACTION;');
    out.push(`PRINT N'SqlHelp: script executado com sucesso em ${qTable}.';`);
    out.push('END TRY');
    out.push('BEGIN CATCH');
    out.push('  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
    out.push('  DECLARE @m NVARCHAR(4000) = ERROR_MESSAGE();');
    out.push('  RAISERROR(@m, 16, 1);');
    out.push('END CATCH');
    out.push('GO');
    return out.join('\n');
  }

  Object.assign(SqlHelp, {
    TSV_HEADERS,
    tsvRowToCol,
    columnsTypeEqual,
    columnsDefinitionEqual,
    needsDefaultForColumn,
    isDatetime2Col,
    datetime2Precision,
    buildTemporalSystemTimeLines,
    parseTsv,
    compareColumnStatus,
    wrapScriptWithTransaction
  });
})(typeof window !== 'undefined' ? window : this);
