(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  function parseOptionalInt(val) {
    if (SqlHelp.parseOptionalInt) return SqlHelp.parseOptionalInt(val);
    if (val === undefined || val === null || val === '') return null;
    var n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }

  var GROWTH_HEADERS = [
    'RecordType', 'TableSchema', 'TableName', 'ColumnName', 'Type', 'Length', 'Prec', 'Scale',
    'Nullable', 'IsIdentity', 'IndexName', 'IndexType', 'KeyOrdinal', 'IsIncluded',
    'IsPrimaryKey', 'IsUnique'
  ];

  var SCENARIOS = ['min', 'media', 'max'];
  var ROW_COUNTS = [1000, 10000, 1000000];
  var MAX_VARCHAR_CHARS = 8000;
  var MAX_NVARCHAR_CHARS = 4000;

  var PAGE_SIZE = 8192;
  var PAGE_HEADER = 96;
  var PAGE_DATA_BYTES = PAGE_SIZE - PAGE_HEADER;
  var ROW_LIMIT_INROW = 8060;
  var LOB_ROOT_BYTES = 16;
  var OVERFLOW_PTR_BYTES = 24;
  var VAR_LEN_PREFIX = 2;
  var RECORD_HEADER_BYTES = 12;
  var INROW_VAR_MAX_PAYLOAD = 8000;

  var TYPE_CATEGORIES = {
    string: ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext'],
    numeric: ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney', 'bit'],
    datetime: ['date', 'time', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'],
    binary: ['binary', 'varbinary', 'image', 'timestamp'],
    guid: ['uniqueidentifier'],
    other: ['xml']
  };

  function yesNo(val) {
    return String(val || '').toUpperCase() === 'YES';
  }

  function parseLength(val) {
    if (val === undefined || val === null || val === '') return null;
    var s = String(val).trim().toUpperCase();
    if (s === 'MAX') return -1;
    var n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }

  function rowToCol(row) {
    var type = (row.Type || 'varchar').toLowerCase();
    return {
      name: (row.ColumnName || '').trim(),
      type: type,
      length: parseLength(row.Length),
      prec: parseOptionalInt(row.Prec),
      scale: parseOptionalInt(row.Scale) ?? 0,
      nullable: yesNo(row.Nullable),
      isIdentity: yesNo(row.IsIdentity)
    };
  }

  function effectivePayloadUnits(col, scenario) {
    var t = (col.type || '').toLowerCase();
    var len = col.length;
    if (len === -1) {
      if (scenario === null) return INROW_VAR_MAX_PAYLOAD;
      if (t === 'nvarchar') len = MAX_NVARCHAR_CHARS;
      else len = MAX_VARCHAR_CHARS;
    }
    if (len == null || len <= 0) len = 1;
    if (scenario === null) {
      if (t === 'nvarchar' || t === 'nchar') return len * 2;
      return len;
    }
    var chars;
    switch (scenario) {
      case 'min':
        chars = 1;
        break;
      case 'media':
        chars = Math.min(5, len);
        break;
      case 'max':
      default:
        chars = len;
        break;
    }
    if (t === 'nvarchar') return chars * 2;
    if (t === 'nchar') return chars * 2;
    return chars;
  }

  function isLobColumn(col) {
    var t = (col.type || '').toLowerCase();
    if (t === 'xml' || t === 'text' || t === 'ntext' || t === 'image') return true;
    return (t === 'varchar' || t === 'nvarchar' || t === 'varbinary') && col.length === -1;
  }

  function isVariableColumn(col) {
    var t = (col.type || '').toLowerCase();
    return (t === 'varchar' || t === 'nvarchar' || t === 'varbinary') && col.length !== -1;
  }

  function getFixedColumnBytes(col) {
    var t = (col.type || '').toLowerCase();
    var maxLen = col.length;
    var prec = col.prec != null ? col.prec : 18;
    var scale = col.scale != null ? col.scale : 0;
    if (t === 'bit') return 0;
    switch (t) {
      case 'tinyint': return 1;
      case 'smallint': return 2;
      case 'int': return 4;
      case 'bigint': return 8;
      case 'decimal':
      case 'numeric':
        if (prec >= 29) return 17;
        if (prec >= 20) return 13;
        if (prec >= 10) return 9;
        return 5;
      case 'money': return 8;
      case 'smallmoney': return 4;
      case 'real': return 4;
      case 'float':
        return prec >= 25 ? 8 : 4;
      case 'date': return 3;
      case 'time':
        if (scale >= 14) return 5;
        if (scale >= 12) return 4;
        return 3;
      case 'datetime2':
        if (scale < 3) return 6;
        if (scale < 4) return 7;
        return 8;
      case 'datetimeoffset':
        if (scale >= 32) return 10;
        if (scale >= 30) return 9;
        return 8;
      case 'datetime': return 8;
      case 'smalldatetime': return 4;
      case 'timestamp': return 8;
      case 'binary':
        return maxLen != null && maxLen > 0 ? maxLen : 1;
      case 'char':
        return maxLen != null && maxLen > 0 ? maxLen : 1;
      case 'nchar':
        return (maxLen != null && maxLen > 0 ? maxLen : 1) * 2;
      case 'uniqueidentifier': return 16;
      default:
        return 8;
    }
  }

  function storageModeLabel(mode) {
    if (mode === 'inrow') return 'in-row';
    if (mode === 'lob_root') return 'LOB (16 B)';
    if (mode === 'overflow') return 'overflow (24 B)';
    if (mode === 'bit_packed') return 'bit empacotado';
    if (mode === 'fixed') return 'fixo';
    return mode;
  }

  function storageClassLabel(col, isLob) {
    if (isLob) return 'LOB';
    if (isVariableColumn(col)) return 'Variável';
    return 'Fixa';
  }

  function applyVarEntryBytes(entry) {
    if (entry.storageMode === 'inrow') {
      entry.bytesInRow = VAR_LEN_PREFIX + entry.payload;
    } else if (entry.storageMode === 'lob_root') {
      entry.bytesInRow = LOB_ROOT_BYTES;
    } else if (entry.storageMode === 'overflow') {
      entry.bytesInRow = OVERFLOW_PTR_BYTES;
    } else {
      entry.bytesInRow = 0;
    }
  }

  function computeRowTotal(nCols, fixedBytes, bitPackedBytes, varEntries) {
    var nullBitmap = Math.ceil(nCols / 8);
    var nVar = varEntries.length;
    var varDataSum = varEntries.reduce(function (s, e) { return s + e.bytesInRow; }, 0);
    return RECORD_HEADER_BYTES + nullBitmap + fixedBytes + bitPackedBytes + 2 + (2 * nVar) + varDataSum;
  }

  function computeSqlServerRowLayout(columns, options) {
    options = options || {};
    var pkSet = options.pkSet || new Set();
    var scenario = options.scenario !== undefined ? options.scenario : null;
    var nCols = columns.length;

    if (!nCols) {
      return {
        scenario: scenario,
        columnCount: 0,
        header: { total: RECORD_HEADER_BYTES, statusBitsA: 4, statusBitsB: 2, fixedDataEnd: 2, columnCountField: 2, nullBitmapOffset: 2 },
        nullBitmap: { bytes: 0 },
        fixedData: { columns: [], bitColumns: [], bitPackedBytes: 0, total: 0 },
        variableSection: { columnCountField: 0, offsetArrayBytes: 0, entries: [], total: 0 },
        columns: [],
        totalBytes: 0,
        exceedsRowLimit: false,
        rowsPerPageEstimate: 0,
        pageDataBytes: PAGE_DATA_BYTES,
        rowLimitInRow: ROW_LIMIT_INROW
      };
    }

    var fixedEntries = [];
    var bitColumnNames = [];
    var varEntries = [];

    columns.forEach(function (col) {
      var isPk = pkSet.has(col.name);
      var typeClass = getTypeColorClass(col.type);
      var lengthDisplay = formatColLengthDisplay(col);

      if ((col.type || '').toLowerCase() === 'bit') {
        bitColumnNames.push(col.name);
        fixedEntries.push({
          name: col.name,
          type: col.type,
          typeClass: typeClass,
          lengthDisplay: lengthDisplay,
          storageClass: 'fixed',
          storageMode: 'bit_packed',
          location: 'Dados fixos (empacotado)',
          bytesInRow: 0,
          isPk: isPk,
          isBit: true
        });
      } else if (isVariableColumn(col) || isLobColumn(col)) {
        var isLob = isLobColumn(col);
        var payload = effectivePayloadUnits(col, scenario);
        varEntries.push({
          name: col.name,
          type: col.type,
          typeClass: typeClass,
          lengthDisplay: lengthDisplay,
          storageClass: isLob ? 'lob' : 'variable',
          storageMode: 'inrow',
          location: 'Seção variável',
          payload: payload,
          isLob: isLob,
          isPk: isPk
        });
      } else {
        var fb = getFixedColumnBytes(col);
        fixedEntries.push({
          name: col.name,
          type: col.type,
          typeClass: typeClass,
          lengthDisplay: lengthDisplay,
          storageClass: 'fixed',
          storageMode: 'fixed',
          location: 'Dados fixos',
          bytesInRow: fb,
          isPk: isPk,
          isBit: false
        });
      }
    });

    var bitPackedBytes = bitColumnNames.length > 0 ? Math.ceil(bitColumnNames.length / 8) : 0;
    var fixedBytesSum = fixedEntries.filter(function (e) { return !e.isBit; }).reduce(function (s, e) {
      return s + e.bytesInRow;
    }, 0);

    varEntries.forEach(applyVarEntryBytes);

    var total = computeRowTotal(nCols, fixedBytesSum, bitPackedBytes, varEntries);
    var safety = 0;

    while (total > ROW_LIMIT_INROW && safety < varEntries.length + 5) {
      safety++;
      var inrow = varEntries.filter(function (e) { return e.storageMode === 'inrow'; });
      if (!inrow.length) break;
      inrow.sort(function (a, b) { return b.payload - a.payload; });
      var target = inrow[0];
      if (target.isLob || target.payload > INROW_VAR_MAX_PAYLOAD) {
        target.storageMode = 'lob_root';
        target.location = 'Ponteiro LOB (16 B)';
      } else {
        target.storageMode = 'overflow';
        target.location = 'Ponteiro overflow (24 B)';
      }
      applyVarEntryBytes(target);
      total = computeRowTotal(nCols, fixedBytesSum, bitPackedBytes, varEntries);
    }

    var nullBitmapBytes = Math.ceil(nCols / 8);
    var offsetArrayBytes = 2 * varEntries.length;
    var varDataBytes = varEntries.reduce(function (s, e) { return s + e.bytesInRow; }, 0);

    var allColumns = fixedEntries.slice();
    if (bitPackedBytes > 0) {
      allColumns.push({
        name: '(' + bitColumnNames.length + '× bit)',
        type: 'bit',
        typeClass: 'growth-type-numeric',
        lengthDisplay: String(bitColumnNames.length),
        storageClass: 'fixed',
        storageMode: 'bit_packed',
        location: 'Dados fixos (8 bits = 1 B)',
        bytesInRow: bitPackedBytes,
        isPk: false,
        isBit: true,
        bitNames: bitColumnNames.join(', ')
      });
    }
    varEntries.forEach(function (e) {
      e.location = e.storageMode === 'inrow' ? 'Seção variável (in-row)' : e.location;
      allColumns.push(e);
    });

    var lobColumns = varEntries.filter(function (e) { return e.storageMode === 'lob_root'; });
    var overflowColumns = varEntries.filter(function (e) { return e.storageMode === 'overflow'; });

    return {
      scenario: scenario,
      columnCount: nCols,
      header: {
        total: RECORD_HEADER_BYTES,
        statusBitsA: 4,
        statusBitsB: 2,
        fixedDataEnd: 2,
        columnCountField: 2,
        nullBitmapOffset: 2
      },
      nullBitmap: { bytes: nullBitmapBytes, formula: 'ceil(' + nCols + '/8)' },
      fixedData: {
        columns: fixedEntries.filter(function (e) { return !e.isBit; }),
        bitColumns: bitColumnNames,
        bitPackedBytes: bitPackedBytes,
        total: fixedBytesSum + bitPackedBytes
      },
      variableSection: {
        columnCountField: 2,
        offsetArrayBytes: offsetArrayBytes,
        entries: varEntries,
        dataBytes: varDataBytes,
        total: 2 + offsetArrayBytes + varDataBytes
      },
      lobColumns: lobColumns,
      overflowColumns: overflowColumns,
      columns: allColumns,
      totalBytes: total,
      exceedsRowLimit: total > ROW_LIMIT_INROW,
      rowsPerPageEstimate: total > 0 ? Math.floor(PAGE_DATA_BYTES / total) : 0,
      pageDataBytes: PAGE_DATA_BYTES,
      rowLimitInRow: ROW_LIMIT_INROW,
      pkColumnsSum: allColumns.filter(function (c) { return c.isPk; }).reduce(function (s, c) {
        return s + (c.bytesInRow || 0);
      }, 0)
    };
  }

  function getTypeColorClass(type) {
    var t = (type || '').toLowerCase();
    var cat;
    for (cat in TYPE_CATEGORIES) {
      if (TYPE_CATEGORIES[cat].indexOf(t) !== -1) return 'growth-type-' + cat;
    }
    return 'growth-type-other';
  }

  function formatColLengthDisplay(col) {
    if (col.length === -1) return 'MAX';
    if (col.length != null) return String(col.length);
    return '';
  }

  function pkMaxRows(pkType) {
    var t = (pkType || '').toLowerCase();
    switch (t) {
      case 'tinyint': return 256;
      case 'smallint': return 32768;
      case 'int': return 2147483647;
      case 'bigint':
      default:
        return null;
    }
  }

  function findPrimaryKey(table) {
    var pkIndex = null;
    table.indexList.forEach(function (idx) {
      if (idx.isPrimaryKey) pkIndex = idx;
    });
    if (!pkIndex) {
      return { column: null, columns: [], type: null, maxRows: null, indexName: null, indexType: null };
    }
    var keyCols = pkIndex.keyColumns.slice().sort(function (a, b) {
      return (a.keyOrdinal || 0) - (b.keyOrdinal || 0);
    });
    var first = keyCols[0];
    if (!first) {
      return { column: null, columns: [], type: null, maxRows: null, indexName: null, indexType: null };
    }
    var colMeta = table.columnsByName[first.name];
    var pkType = colMeta ? colMeta.type : first.type;
    return {
      column: first.name,
      columns: keyCols.map(function (c) { return c.name; }),
      type: pkType,
      maxRows: pkMaxRows(pkType),
      indexName: pkIndex.name,
      indexType: pkIndex.indexType
    };
  }

  function parseGrowthLog(text, label) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) throw new Error(label + ': arquivo vazio.');

    var headerParts = lines[0].split('\t').map(function (s) { return s.trim(); });
    var missing = GROWTH_HEADERS.filter(function (h) { return headerParts.indexOf(h) === -1; });
    if (missing.length) {
      throw new Error(label + ': cabeçalho inválido. Faltando: ' + missing.join(', '));
    }

    var tables = {};
    var colCount = 0;
    var idxColCount = 0;

    for (var i = 1; i < lines.length; i++) {
      var parts = lines[i].split('\t');
      if (parts.length < 10) continue;
      var row = {};
      GROWTH_HEADERS.forEach(function (h, idx) {
        row[h] = (parts[idx] || '').trim();
      });

      var schema = row.TableSchema || 'dbo';
      var tableName = row.TableName;
      if (!tableName) continue;

      var key = schema + '.' + tableName;
      if (!tables[key]) {
        tables[key] = {
          key: key,
          schema: schema,
          name: tableName,
          columnOrder: [],
          columns: {},
          columnsByName: {},
          indexes: {},
          indexOrder: []
        };
      }
      var tbl = tables[key];
      var recordType = (row.RecordType || 'COL').toUpperCase();

      if (recordType === 'COL') {
        var colName = row.ColumnName;
        if (!colName) continue;
        if (!tbl.columns[colName]) tbl.columnOrder.push(colName);
        var col = rowToCol(row);
        tbl.columns[colName] = col;
        tbl.columnsByName[colName] = col;
        colCount++;
      } else if (recordType === 'IDX') {
        var indexName = row.IndexName;
        var idxColName = row.ColumnName;
        if (!indexName || !idxColName) continue;
        if (!tbl.indexes[indexName]) {
          tbl.indexes[indexName] = {
            name: indexName,
            indexType: (row.IndexType || 'NONCLUSTERED').toUpperCase(),
            isPrimaryKey: yesNo(row.IsPrimaryKey),
            isUnique: yesNo(row.IsUnique),
            keyColumns: [],
            includeColumns: []
          };
          tbl.indexOrder.push(indexName);
        }
        var idx = tbl.indexes[indexName];
        var idxCol = {
          name: idxColName,
          type: (row.Type || '').toLowerCase(),
          length: parseLength(row.Length),
          prec: parseOptionalInt(row.Prec),
          scale: parseOptionalInt(row.Scale) ?? 0,
          nullable: yesNo(row.Nullable),
          keyOrdinal: parseOptionalInt(row.KeyOrdinal) || 0,
          isIncluded: yesNo(row.IsIncluded)
        };
        var meta = tbl.columnsByName[idxColName];
        if (meta) {
          idxCol.type = meta.type;
          idxCol.length = meta.length;
          idxCol.prec = meta.prec;
          idxCol.scale = meta.scale;
        }
        if (idxCol.isIncluded) idx.includeColumns.push(idxCol);
        else idx.keyColumns.push(idxCol);
        idxColCount++;
      }
    }

    if (!Object.keys(tables).length) {
      throw new Error(label + ': nenhuma tabela encontrada.');
    }

    Object.keys(tables).forEach(function (k) {
      var t = tables[k];
      t.indexList = t.indexOrder.map(function (n) { return t.indexes[n]; });
      t.hasClustered = t.indexList.some(function (ix) {
        return ix.indexType === 'CLUSTERED';
      });
    });

    return {
      tables: tables,
      colCount: colCount,
      idxColCount: idxColCount,
      tableCount: Object.keys(tables).length,
      indexCount: Object.values(tables).reduce(function (n, t) {
        return n + t.indexList.length;
      }, 0)
    };
  }

  function indexColumnsForSize(index) {
    var cols = index.keyColumns.concat(index.includeColumns);
    return cols.map(function (ic) {
      var meta = {
        name: ic.name,
        type: ic.type,
        length: ic.length,
        prec: ic.prec,
        scale: ic.scale,
        nullable: ic.nullable,
        isIdentity: false
      };
      return meta;
    });
  }

  function buildClusteredInfo(table, pk) {
    var clusteredIndex = null;
    table.indexList.forEach(function (idx) {
      if (idx.indexType === 'CLUSTERED') {
        clusteredIndex = {
          name: idx.name,
          isPrimaryKey: idx.isPrimaryKey,
          keyColumns: idx.keyColumns.map(function (c) { return c.name; }).join(', ')
        };
      }
    });
    if (!clusteredIndex && pk.indexName) {
      clusteredIndex = {
        name: pk.indexName,
        isPrimaryKey: true,
        keyColumns: (pk.columns || []).join(', ')
      };
    }
    return clusteredIndex;
  }

  function analyzeTable(table) {
    var colList = table.columnOrder.map(function (n) { return table.columns[n]; });
    var pk = findPrimaryKey(table);
    var pkSet = new Set(pk.columns || []);
    var rowLayout = computeSqlServerRowLayout(colList, { pkSet: pkSet, scenario: null });
    var clusteredIndex = buildClusteredInfo(table, pk);
    var scenarios = {};

    var ncStructural = [];
    table.indexList.forEach(function (idx) {
      if (idx.indexType === 'CLUSTERED') return;
      var ixCols = indexColumnsForSize(idx);
      var ixLayout = computeSqlServerRowLayout(ixCols, { pkSet: pkSet, scenario: null });
      ncStructural.push({
        name: idx.name,
        indexType: idx.indexType,
        isPrimaryKey: idx.isPrimaryKey,
        bytesPerRow: ixLayout.totalBytes,
        keyColumns: idx.keyColumns.map(function (c) { return c.name; }).join(', '),
        includeColumns: idx.includeColumns.map(function (c) { return c.name; }).join(', ') || '—',
        layout: ixLayout
      });
    });

    SCENARIOS.forEach(function (sc) {
      var dataLayout = computeSqlServerRowLayout(colList, { pkSet: pkSet, scenario: sc });
      var ncIndexLayouts = [];
      var ncBytesPerRow = 0;

      table.indexList.forEach(function (idx) {
        if (idx.indexType === 'CLUSTERED') return;
        var ixCols = indexColumnsForSize(idx);
        var ixLayout = computeSqlServerRowLayout(ixCols, { pkSet: pkSet, scenario: sc });
        ncIndexLayouts.push({
          name: idx.name,
          indexType: idx.indexType,
          isPrimaryKey: idx.isPrimaryKey,
          bytesPerRow: ixLayout.totalBytes,
          keyColumns: idx.keyColumns.map(function (c) { return c.name; }).join(', '),
          includeColumns: idx.includeColumns.map(function (c) { return c.name; }).join(', ') || '—',
          layout: ixLayout
        });
        ncBytesPerRow += ixLayout.totalBytes;
      });

      var dataRowBytes = dataLayout.totalBytes;
      var bytesPerRow = dataRowBytes + ncBytesPerRow;
      var projections = {};

      ROW_COUNTS.forEach(function (target) {
        var maxRows = pk.maxRows;
        var effective = maxRows != null ? Math.min(target, maxRows) : target;
        var capped = maxRows != null && target > maxRows;
        projections[target] = {
          target: target,
          effectiveRows: effective,
          cappedByPk: capped,
          dataBytes: effective * dataRowBytes,
          indexBytes: effective * ncBytesPerRow,
          totalBytes: effective * bytesPerRow
        };
      });

      scenarios[sc] = {
        dataRowBytes: dataRowBytes,
        ncIndexBytesPerRow: ncBytesPerRow,
        bytesPerRow: bytesPerRow,
        projections: projections,
        breakdown: {
          dataRow: dataLayout,
          ncIndexes: ncIndexLayouts,
          clusteredIndex: clusteredIndex
        }
      };
    });

    return {
      key: table.key,
      schema: table.schema,
      name: table.name,
      columnCount: table.columnOrder.length,
      indexCount: table.indexList.length,
      pk: pk,
      rowLayout: rowLayout,
      ncIndexesStructural: ncStructural,
      clusteredIndex: clusteredIndex,
      scenarios: scenarios
    };
  }

  function analyzeDatabase(parsed) {
    var tableAnalyses = [];
    Object.keys(parsed.tables).sort().forEach(function (k) {
      tableAnalyses.push(analyzeTable(parsed.tables[k]));
    });

    var dbTotals = {};
    SCENARIOS.forEach(function (sc) {
      dbTotals[sc] = { projections: {} };
      ROW_COUNTS.forEach(function (target) {
        dbTotals[sc].projections[target] = {
          target: target,
          totalBytes: 0,
          dataBytes: 0,
          indexBytes: 0,
          anyCapped: false
        };
      });
    });

    tableAnalyses.forEach(function (ta) {
      SCENARIOS.forEach(function (sc) {
        var s = ta.scenarios[sc];
        ROW_COUNTS.forEach(function (target) {
          var p = s.projections[target];
          var d = dbTotals[sc].projections[target];
          d.totalBytes += p.totalBytes;
          d.dataBytes += p.dataBytes;
          d.indexBytes += p.indexBytes;
          if (p.cappedByPk) d.anyCapped = true;
        });
      });
    });

    return { tables: tableAnalyses, dbTotals: dbTotals };
  }

  function formatBytes(n) {
    if (n == null || isNaN(n)) return '—';
    var v = Number(n);
    if (v < 1024) return v.toFixed(v % 1 ? 1 : 0) + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(2) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(2) + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  var GROWTH_EXPORT_QUERY = [
    '/* SqlHelp — exportar esquema (colunas + índices) para projeção de crescimento.',
    '   SSMS: Results to File ou copiar grid → salvar como .log (tab-delimitado). */',
    'SELECT',
    "    'COL' AS RecordType,",
    '    s.name AS TableSchema,',
    '    t.name AS TableName,',
    '    c.name AS ColumnName,',
    '    ty.name AS [Type],',
    '    CASE',
    "        WHEN c.max_length = -1 THEN 'MAX'",
    "        WHEN ty.name IN ('nvarchar', 'nchar')",
    '            THEN CAST(c.max_length / 2 AS VARCHAR(20))',
    '        ELSE CAST(c.max_length AS VARCHAR(20))',
    '    END AS [Length],',
    '    CAST(c.precision AS VARCHAR(20)) AS [Prec],',
    '    CAST(c.scale AS VARCHAR(20)) AS [Scale],',
    "    CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS Nullable,",
    "    CASE WHEN c.is_identity = 1 THEN 'YES' ELSE 'NO' END AS IsIdentity,",
    "    '' AS IndexName,",
    "    '' AS IndexType,",
    "    '' AS KeyOrdinal,",
    "    '' AS IsIncluded,",
    "    '' AS IsPrimaryKey,",
    "    '' AS IsUnique",
    'FROM sys.tables t',
    'JOIN sys.schemas s ON s.schema_id = t.schema_id',
    'JOIN sys.columns c ON c.object_id = t.object_id',
    'JOIN sys.types ty ON ty.user_type_id = c.user_type_id',
    'WHERE t.is_ms_shipped = 0',
    '',
    'UNION ALL',
    '',
    'SELECT',
    "    'IDX' AS RecordType,",
    '    s.name AS TableSchema,',
    '    t.name AS TableName,',
    '    c.name AS ColumnName,',
    '    ty.name AS [Type],',
    '    CASE',
    "        WHEN c.max_length = -1 THEN 'MAX'",
    "        WHEN ty.name IN ('nvarchar', 'nchar')",
    '            THEN CAST(c.max_length / 2 AS VARCHAR(20))',
    '        ELSE CAST(c.max_length AS VARCHAR(20))',
    '    END AS [Length],',
    '    CAST(c.precision AS VARCHAR(20)) AS [Prec],',
    '    CAST(c.scale AS VARCHAR(20)) AS [Scale],',
    "    CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS Nullable,",
    "    'NO' AS IsIdentity,",
    '    i.name AS IndexName,',
    "    CASE WHEN i.type = 1 THEN 'CLUSTERED' ELSE 'NONCLUSTERED' END AS IndexType,",
    '    CAST(ic.key_ordinal AS VARCHAR(20)) AS KeyOrdinal,',
    "    CASE WHEN ic.is_included_column = 1 THEN 'YES' ELSE 'NO' END AS IsIncluded,",
    "    CASE WHEN i.is_primary_key = 1 THEN 'YES' ELSE 'NO' END AS IsPrimaryKey,",
    "    CASE WHEN i.is_unique = 1 THEN 'YES' ELSE 'NO' END AS IsUnique",
    'FROM sys.tables t',
    'JOIN sys.schemas s ON s.schema_id = t.schema_id',
    'JOIN sys.indexes i ON i.object_id = t.object_id',
    'JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id',
    'JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id',
    'JOIN sys.types ty ON ty.user_type_id = c.user_type_id',
    'WHERE t.is_ms_shipped = 0',
    '  AND i.type IN (1, 2)',
    '  AND i.is_hypothetical = 0',
    '',
    'ORDER BY',
    '    TableSchema,',
    '    TableName,',
    '    RecordType,',
    '    IndexName,',
    '    KeyOrdinal,',
    '    ColumnName;'
  ].join('\n');

  async function fetchGrowthExportQuery() {
    try {
      var r = await fetch('QuerieCrescimento.sql');
      if (r.ok) return (await r.text()).trim();
    } catch (_) { /* file:// ou offline */ }
    return GROWTH_EXPORT_QUERY;
  }

  Object.assign(SqlHelp, {
    GROWTH_HEADERS: GROWTH_HEADERS,
    SCENARIOS: SCENARIOS,
    ROW_COUNTS: ROW_COUNTS,
    parseGrowthLog: parseGrowthLog,
    getTypeColorClass: getTypeColorClass,
    storageModeLabel: storageModeLabel,
    storageClassLabel: storageClassLabel,
    computeSqlServerRowLayout: computeSqlServerRowLayout,
    pkMaxRows: pkMaxRows,
    PAGE_SIZE: PAGE_SIZE,
    PAGE_DATA_BYTES: PAGE_DATA_BYTES,
    ROW_LIMIT_INROW: ROW_LIMIT_INROW,
    analyzeTable: analyzeTable,
    analyzeDatabase: analyzeDatabase,
    formatBytes: formatBytes,
    GROWTH_EXPORT_QUERY: GROWTH_EXPORT_QUERY,
    fetchGrowthExportQuery: fetchGrowthExportQuery
  });
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
