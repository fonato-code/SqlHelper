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
  var RECORD_HEADER_PHYSICAL = 4;
  var NULL_COL_COUNT_BYTES = 2;
  var RECORD_HEADER_META_BYTES = RECORD_HEADER_BYTES - RECORD_HEADER_PHYSICAL - NULL_COL_COUNT_BYTES;
  var INROW_VAR_MAX_PAYLOAD = 8000;
  var SLOT_ARRAY_MAX_DISPLAY = 8;

  var PAGE_HEADER_FIELDS = [
    { id: 'pageId', label: 'ID da página', techName: 'm_pageId', bytes: 8, offset: 0,
      description: 'Identifica arquivo (.mdf) e número da página no arquivo.', cssClass: 'ph-id' },
    { id: 'headerVersion', label: 'Versão do header', techName: 'm_headerVersion', bytes: 1, offset: 8,
      description: 'Versão da estrutura do cabeçalho.', cssClass: 'ph-meta' },
    { id: 'type', label: 'Tipo da página', techName: 'm_type', bytes: 1, offset: 9,
      description: 'Ex.: 1 = dados, 2 = índice, 3 = TEXT_MIX, 10 = IAM…', cssClass: 'ph-meta' },
    { id: 'typeFlagBits', label: 'Flags de tipo', techName: 'm_typeFlagBits', bytes: 1, offset: 10,
      description: 'Bits auxiliares do tipo de página.', cssClass: 'ph-meta' },
    { id: 'level', label: 'Nível', techName: 'm_level', bytes: 1, offset: 11,
      description: 'Nível na árvore de índice (B-tree).', cssClass: 'ph-meta' },
    { id: 'flagBits', label: 'Flags', techName: 'm_flagBits', bytes: 1, offset: 12,
      description: 'Estado da página (ex. ghost records).', cssClass: 'ph-meta' },
    { id: 'indxId', label: 'ID do índice', techName: 'm_indxId', bytes: 2, offset: 13,
      description: 'Índice ao qual a página pertence (0 = heap).', cssClass: 'ph-meta' },
    { id: 'prevPage', label: 'Página anterior', techName: 'm_prevPage', bytes: 8, offset: 15,
      description: 'Encadeamento duplo na estrutura do índice.', cssClass: 'ph-link' },
    { id: 'nextPage', label: 'Próxima página', techName: 'm_nextPage', bytes: 8, offset: 23,
      description: 'Próximo nó na mesma cadeia de páginas.', cssClass: 'ph-link' },
    { id: 'pminRec', label: 'pminlen', techName: 'pminlen', bytes: 2, offset: 31,
      description: 'Tamanho da parte fixa dos registros na página.', cssClass: 'ph-space' },
    { id: 'freeData', label: 'Início espaço livre', techName: 'm_freeData', bytes: 2, offset: 33,
      description: 'Onde começa o bloco livre no corpo.', cssClass: 'ph-space' },
    { id: 'freeCnt', label: 'Bytes livres', techName: 'm_freeCnt', bytes: 2, offset: 35,
      description: 'Quantidade de bytes livres contíguos.', cssClass: 'ph-space' },
    { id: 'reserved', label: 'Reserva transação', techName: 'm_reservedCnt', bytes: 2, offset: 37,
      description: 'Bytes livres reservados por transações ativas.', cssClass: 'ph-space' },
    { id: 'slotCnt', label: 'Qtd. slots', techName: 'm_slotCnt', bytes: 2, offset: 39,
      description: 'Número de entradas no Row Offset Array.', cssClass: 'ph-slot' },
    { id: 'lsn', label: 'LSN da página', techName: 'm_lsn', bytes: 10, offset: 41,
      description: 'Log Sequence Number — recuperação e replicação.', cssClass: 'ph-log' },
    { id: 'xactReserved', label: 'Reserva transação', techName: 'm_xactReserved', bytes: 8, offset: 51,
      description: 'Espaço reservado para versões de linha.', cssClass: 'ph-log' },
    { id: 'xdesId', label: 'XDES ID', techName: 'm_xdesId', bytes: 2, offset: 59,
      description: 'Vínculo com estrutura de transação distribuída.', cssClass: 'ph-other' },
    { id: 'ghostRecCnt', label: 'Ghost records', techName: 'm_ghostRecCnt', bytes: 2, offset: 61,
      description: 'Contagem de registros marcados como ghost.', cssClass: 'ph-other' },
    { id: 'tornBits', label: 'Torn bits', techName: 'm_tornBits', bytes: 4, offset: 63,
      description: 'Detecção de gravação parcial (torn page).', cssClass: 'ph-other' },
    { id: 'allocUnit', label: 'Unidade alocação', techName: 'm_allocUnitId / padding', bytes: 29, offset: 67,
      description: 'Referência à unidade de alocação e bytes de alinhamento até 96.', cssClass: 'ph-other' }
  ];

  var RECORD_HEADER_FIELDS = [
    { id: 'statusA', label: 'Status bits A', bytes: 4, description: 'Tipo de registro, flags de versão.' },
    { id: 'statusB', label: 'Status bits B', bytes: 2, description: 'Colunas fixas/variáveis, ghost forwarded.' },
    { id: 'fixedEnd', label: 'Fim dados fixos', bytes: 2, description: 'Offset onde terminam os dados de tamanho fixo.' },
    { id: 'colCount', label: 'Nº colunas', bytes: 2, description: 'Quantidade de colunas na linha.' },
    { id: 'nullOffset', label: 'Offset null bitmap', bytes: 2, description: 'Onde começa o bitmap de nulidade.' }
  ];

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

  /** Fórmula legada (tópico tamanho máximo de linha): soma CEILING por coluna + overhead fixo. */
  function getLegacyColumnBytes(col) {
    var t = (col.type || '').toLowerCase();
    var maxLen = col.length;
    var prec = col.prec != null ? col.prec : 18;
    var scale = col.scale != null ? col.scale : 0;
    switch (t) {
      case 'bit': return 0.125;
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
      case 'float': return prec >= 25 ? 8 : 4;
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
      case 'timestamp': return 10;
      case 'binary':
        return maxLen != null && maxLen > 0 ? maxLen : 1;
      case 'varbinary':
        if (maxLen === -1) return INROW_VAR_MAX_PAYLOAD + 2;
        return (maxLen != null && maxLen > 0 ? maxLen : 1) + 2;
      case 'char':
        return maxLen != null && maxLen > 0 ? maxLen : 1;
      case 'varchar':
        if (maxLen === -1) return INROW_VAR_MAX_PAYLOAD + 2;
        return (maxLen != null && maxLen > 0 ? maxLen : 1) + 2;
      case 'nchar':
        return (maxLen != null && maxLen > 0 ? maxLen : 1) * 2;
      case 'nvarchar':
        if (maxLen === -1) return MAX_NVARCHAR_CHARS * 2 + 2;
        return (maxLen != null && maxLen > 0 ? maxLen : 1) * 2 + 2;
      case 'uniqueidentifier': return 16;
      default: return 8;
    }
  }

  function computeRowSizePotencial(columns) {
    var n = columns.length;
    if (!n) return 0;
    var sum = 0;
    columns.forEach(function (col) {
      sum += Math.ceil(getLegacyColumnBytes(col));
    });
    return sum + 4 + 2 + 2 + 2 + Math.ceil(n / 8);
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
      var emptyLayout = {
        scenario: scenario,
        columnCount: 0,
        header: { total: RECORD_HEADER_BYTES, statusBitsA: 4, statusBitsB: 2, fixedDataEnd: 2, columnCountField: 2, nullBitmapOffset: 2 },
        nullBitmap: { bytes: 0, formula: 'ceil(0/8)' },
        fixedData: { columns: [], bitColumns: [], bitPackedBytes: 0, total: 0 },
        variableSection: { columnCountField: 0, offsetArrayBytes: 0, entries: [], dataBytes: 0, total: 0 },
        displayColumns: [],
        summaryRows: [],
        columns: [],
        lobColumns: [],
        overflowColumns: [],
        totalBytes: 0,
        exceedsRowLimit: false,
        rowsPerPageEstimate: 0,
        pageDataBytes: PAGE_DATA_BYTES,
        rowLimitInRow: ROW_LIMIT_INROW,
        pkColumnsSum: 0,
        rowSizePotencial: 0,
        exceedsRowLimitPotencial: false,
        exceedsPageBody: false
      };
      emptyLayout.rowDiagram = buildRowDiagram(emptyLayout);
      emptyLayout.pageDiagram = buildPageDiagram(emptyLayout);
      return emptyLayout;
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

    varEntries.forEach(function (e) {
      e.location = e.storageMode === 'inrow' ? 'Seção variável (in-row)' : e.location;
    });

    var displayColumns = fixedEntries.filter(function (e) { return !e.isBit; }).concat(varEntries);
    var summaryRows = [];
    if (bitPackedBytes > 0) {
      summaryRows.push({
        name: '(' + bitColumnNames.length + '× bit)',
        type: 'bit',
        typeClass: 'growth-type-numeric',
        lengthDisplay: String(bitColumnNames.length),
        storageClass: 'fixed',
        storageMode: 'bit_packed',
        location: 'Dados fixos (8 bits = 1 byte)',
        bytesInRow: bitPackedBytes,
        isPk: false,
        isBit: true,
        isSummaryRow: true,
        bitNames: bitColumnNames.join(', ')
      });
    }

    var lobColumns = varEntries.filter(function (e) { return e.storageMode === 'lob_root'; });
    var overflowColumns = varEntries.filter(function (e) { return e.storageMode === 'overflow'; });
    var rowSizePotencial = computeRowSizePotencial(columns);

    var layoutResult = {
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
      displayColumns: displayColumns,
      summaryRows: summaryRows,
      columns: displayColumns.concat(summaryRows),
      totalBytes: total,
      rowSizePotencial: rowSizePotencial,
      exceedsRowLimitPotencial: rowSizePotencial > ROW_LIMIT_INROW,
      exceedsPageBody: rowSizePotencial > PAGE_DATA_BYTES,
      exceedsRowLimit: total > ROW_LIMIT_INROW,
      rowsPerPageEstimate: total > 0 ? Math.floor(PAGE_DATA_BYTES / total) : 0,
      pageDataBytes: PAGE_DATA_BYTES,
      rowLimitInRow: ROW_LIMIT_INROW,
      pkColumnsSum: displayColumns.filter(function (c) { return c.isPk; }).reduce(function (s, c) {
        return s + (c.bytesInRow || 0);
      }, 0)
    };

    layoutResult.rowDiagram = buildRowDiagram(layoutResult);
    layoutResult.pageDiagram = buildPageDiagram(layoutResult);
    return layoutResult;
  }

  function offsetToHex(n) {
    var h = Math.max(0, n).toString(16).toUpperCase();
    while (h.length < 4) h = '0' + h;
    return '0x' + h;
  }

  function buildSlotArrayDetail(slotCount, rowBytes) {
    var count = Math.max(slotCount || 0, 1);
    var showCount = Math.min(count, SLOT_ARRAY_MAX_DISPLAY);
    var rowStart = PAGE_HEADER;
    var slots = [];
    var i;

    for (i = 0; i < showCount; i++) {
      var offsetValue = rowBytes > 0 ? rowStart + i * rowBytes : rowStart;
      slots.push({
        slotIndex: i + 1,
        slotBytePosition: PAGE_SIZE - 2 * (i + 1),
        slotByteEnd: PAGE_SIZE - 2 * i - 1,
        offsetValue: offsetValue,
        offsetHex: offsetToHex(offsetValue),
        rowLabel: 'Row ' + (i + 1),
        rowByteStart: offsetValue,
        rowByteEnd: rowBytes > 0 ? offsetValue + rowBytes - 1 : offsetValue
      });
    }

    return {
      firstRowOffset: rowStart,
      bytesPerSlot: 2,
      totalBytes: 2 * count,
      slotCount: count,
      slotsShown: showCount,
      hasMore: count > SLOT_ARRAY_MAX_DISPLAY,
      moreCount: count - SLOT_ARRAY_MAX_DISPLAY,
      slots: slots,
      growsFromBottom: true,
      explanation: 'Cada slot guarda um offset (ushort) do início da linha, medido a partir do byte 0 da página. ' +
        'Os slots ficam no final da página e novos slots são inseridos subindo (de baixo para cima).'
    };
  }

  function buildRowStructureDetail(layout) {
    var fields = [];
    var offset = 0;
    var vs = layout.variableSection;
    var nVar = vs.entries ? vs.entries.length : 0;
    var nullBitmapOnly = layout.nullBitmap.bytes;

    function pushField(obj) {
      fields.push(obj);
      offset += obj.bytes;
    }

    pushField({
      id: 'recordHeader',
      label: 'Record header',
      techName: 'TagA / TagB / offset',
      bytes: RECORD_HEADER_PHYSICAL,
      offset: offset,
      description: 'Primeiros 4 bytes físicos do registro.',
      cssClass: 'row-hdr'
    });

    if (layout.fixedData.total > 0) {
      var fixedDesc = 'Colunas de tamanho fixo';
      if (layout.fixedData.bitPackedBytes > 0) {
        fixedDesc += ' + ' + layout.fixedData.bitColumns.length + ' bit(s) empacotado(s)';
      }
      pushField({
        id: 'fixedData',
        label: 'Dados fixos + bits',
        techName: 'fixed-length data',
        bytes: layout.fixedData.total,
        offset: offset,
        description: fixedDesc + '.',
        cssClass: 'row-fixed'
      });
    }

    if (nullBitmapOnly > 0 || layout.columnCount > 0) {
      pushField({
        id: 'nullColCount',
        label: 'Contagem colunas',
        techName: 'column count',
        bytes: NULL_COL_COUNT_BYTES,
        offset: offset,
        description: '2 B antes do null bitmap.',
        cssClass: 'row-null'
      });
      pushField({
        id: 'nullBitmap',
        label: 'Null bitmap',
        techName: 'null bitmap',
        bytes: nullBitmapOnly,
        offset: offset,
        description: layout.nullBitmap.formula + ' — 1 bit por coluna.',
        cssClass: 'row-null'
      });
    }

    if (RECORD_HEADER_META_BYTES > 0) {
      pushField({
        id: 'recordHeaderMeta',
        label: 'Header lógico (ext.)',
        techName: 'SqlHelp model',
        bytes: RECORD_HEADER_META_BYTES,
        offset: offset,
        description: 'Completa os 12 B do modelo de cálculo SqlHelp.',
        cssClass: 'row-hdr-meta'
      });
    }

    if (vs.total > 0) {
      pushField({
        id: 'varColCount',
        label: 'Contador variáveis',
        techName: 'variable column count',
        bytes: vs.columnCountField || 2,
        offset: offset,
        description: 'Número de colunas variáveis.',
        cssClass: 'row-var'
      });

      if (vs.offsetArrayBytes > 0) {
        pushField({
          id: 'varOffsets',
          label: 'Array de offsets',
          techName: 'column offset array',
          bytes: vs.offsetArrayBytes,
          offset: offset,
          description: '2 B × ' + nVar + ' coluna(s) variável(is).',
          cssClass: 'row-var'
        });
      }

      if (vs.dataBytes > 0) {
        pushField({
          id: 'varData',
          label: 'Dados variáveis',
          techName: 'variable-length data',
          bytes: vs.dataBytes,
          offset: offset,
          description: 'In-row, LOB (16 B) ou overflow (24 B).',
          cssClass: 'row-var-data'
        });
      }
    }

    fields.push({
      id: 'recordType',
      label: 'Tipos de registro (TagA)',
      techName: 'reference',
      bytes: 0,
      offset: -1,
      description: 'Referência — ver tabela de tipos PRIMARY, forwarded, ghost…',
      cssClass: 'row-ref',
      isReference: true
    });

    fields.push({
      id: 'versionTag',
      label: 'Tag versionamento (opc.)',
      techName: 'versioning tag',
      bytes: 0,
      offset: -1,
      description: '14 B opcionais — RCSI/snapshot; não contado na projeção.',
      cssClass: 'row-ref',
      isReference: true
    });

    var enriched = typeof GrowthRecordDetails !== 'undefined'
      ? GrowthRecordDetails.enrichRowStructureFields(fields)
      : fields;

    return {
      fields: enriched,
      total: layout.totalBytes,
      note: 'Ordem física de registro PRIMARY não comprimido (SQL Server 2025). Header lógico SqlHelp = 12 B.',
      attributionUrl: typeof GrowthRecordDetails !== 'undefined'
        ? GrowthRecordDetails.SQLSKILLS_RECORD_URL : null,
      learnUrl: typeof GrowthRecordDetails !== 'undefined'
        ? GrowthRecordDetails.MS_RECORD_URL : null
    };
  }

  function buildRowDiagram(layout) {
    var rowStructureDetail = buildRowStructureDetail(layout);
    return {
      totalBytes: layout.totalBytes,
      rowStructureDetail: rowStructureDetail,
      segments: [
        { id: 'header', label: 'Record header', bytes: layout.header.total, cssClass: 'row-meta' },
        { id: 'null', label: 'Null bitmap', bytes: layout.nullBitmap.bytes, cssClass: 'row-meta' },
        { id: 'fixed', label: 'Dados fixos + bits', bytes: layout.fixedData.total, cssClass: 'row-fixed' },
        { id: 'variable', label: 'Seção variável', bytes: layout.variableSection.total, cssClass: 'row-variable' }
      ]
    };
  }

  function buildPageDiagram(layout) {
    var rowBytes = layout.totalBytes;
    var rowsPerPage = layout.rowsPerPageEstimate;
    var maxVisualRows = 6;
    var segments = [];
    var slotCount;
    var rowsAreaBytes;

    segments.push({
      id: 'pageHeader',
      label: 'Page Header',
      sublabel: 'Clique abaixo para ver os 96 bytes',
      bytes: PAGE_HEADER,
      cssClass: 'page-header',
      expandable: true
    });

    if (rowBytes <= 0) {
      segments.push({
        id: 'freeAll',
        label: 'Espaço livre (corpo inteiro)',
        sublabel: 'Nenhuma linha cabível',
        bytes: PAGE_DATA_BYTES,
        cssClass: 'page-free'
      });
    } else if (rowsPerPage > maxVisualRows) {
      slotCount = rowsPerPage;
      rowsAreaBytes = rowBytes * rowsPerPage;
      segments.push({
        id: 'rowsBlock',
        label: 'Linhas de dados',
        sublabel: rowsPerPage.toLocaleString('pt-BR') + ' × ' + rowBytes + ' B/linha',
        bytes: rowsAreaBytes,
        cssClass: 'page-row'
      });
    } else {
      slotCount = Math.max(rowsPerPage, 1);
      rowsAreaBytes = rowBytes * slotCount;
      var r;
      for (r = 0; r < slotCount; r++) {
        segments.push({
          id: 'row' + r,
          label: 'Row ' + (r + 1),
          sublabel: rowBytes + ' B',
          bytes: rowBytes,
          cssClass: 'page-row'
        });
      }
    }

    var slotBytes = 2 * slotCount;
    var freeSpace = Math.max(0, PAGE_DATA_BYTES - rowsAreaBytes - slotBytes);
    if (freeSpace > 0) {
      segments.push({
        id: 'free',
        label: 'Espaço livre',
        sublabel: 'Cresce do meio para baixo',
        bytes: freeSpace,
        cssClass: 'page-free'
      });
    }

    segments.push({
      id: 'slots',
      label: 'Row Offset Array',
      sublabel: '2 B × ' + slotCount + ' (da base para cima)',
      bytes: slotBytes,
      cssClass: 'page-slots',
      expandable: true
    });

    var bodySum = segments.slice(1).reduce(function (s, seg) { return s + seg.bytes; }, 0);
    var slotDetail = buildSlotArrayDetail(slotCount, rowBytes);

    return {
      pageSize: PAGE_SIZE,
      pageHeaderBytes: PAGE_HEADER,
      bodyBytes: PAGE_DATA_BYTES,
      rowBytes: rowBytes,
      rowsPerPage: rowsPerPage,
      slotCount: slotCount,
      segments: segments,
      bodySum: bodySum,
      formula: PAGE_HEADER + ' + ' + bodySum + ' = ' + (PAGE_HEADER + bodySum) + ' B (página 8 KB)',
      pageHeaderDetail: {
        fields: (typeof GrowthPageHeaderDetails !== 'undefined'
          ? GrowthPageHeaderDetails.enrichPageHeaderFields(PAGE_HEADER_FIELDS)
          : PAGE_HEADER_FIELDS.slice()),
        total: PAGE_HEADER,
        note: 'Sempre ocupa os bytes 0–95 de cada página de dados (tipo 1).',
        attributionUrl: typeof GrowthPageHeaderDetails !== 'undefined'
          ? GrowthPageHeaderDetails.SQLSKILLS_PAGE_URL : null
      },
      slotArrayDetail: slotDetail
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

    var ncPotencialBytes = 0;
    table.indexList.forEach(function (idx) {
      if (idx.indexType === 'CLUSTERED') return;
      var ixColsP = indexColumnsForSize(idx);
      ncPotencialBytes += computeRowSizePotencial(ixColsP);
    });
    var dataPotencialBytes = rowLayout.rowSizePotencial;
    var bytesPerRowPotencial = dataPotencialBytes + ncPotencialBytes;
    var potencialProjections = {};
    ROW_COUNTS.forEach(function (target) {
      var maxRowsP = pk.maxRows;
      var effectiveP = maxRowsP != null ? Math.min(target, maxRowsP) : target;
      var cappedP = maxRowsP != null && target > maxRowsP;
      potencialProjections[target] = {
        target: target,
        effectiveRows: effectiveP,
        cappedByPk: cappedP,
        dataBytes: effectiveP * dataPotencialBytes,
        indexBytes: effectiveP * ncPotencialBytes,
        totalBytes: effectiveP * bytesPerRowPotencial
      };
    });
    var potencial = {
      dataRowBytes: dataPotencialBytes,
      ncIndexBytesPerRow: ncPotencialBytes,
      bytesPerRow: bytesPerRowPotencial,
      projections: potencialProjections
    };

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
      scenarios: scenarios,
      potencial: potencial
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
    dbTotals.potencial = { projections: {} };
    ROW_COUNTS.forEach(function (target) {
      dbTotals.potencial.projections[target] = {
        target: target,
        totalBytes: 0,
        dataBytes: 0,
        indexBytes: 0,
        anyCapped: false
      };
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
      ROW_COUNTS.forEach(function (target) {
        var pp = ta.potencial.projections[target];
        var dp = dbTotals.potencial.projections[target];
        dp.totalBytes += pp.totalBytes;
        dp.dataBytes += pp.dataBytes;
        dp.indexBytes += pp.indexBytes;
        if (pp.cappedByPk) dp.anyCapped = true;
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

  var MS = 'https://learn.microsoft.com/en-us/sql/';
  var MSV = '?view=sql-server-ver17';

  var GROWTH_DOCS = {
    sections: [
      {
        id: 'architecture',
        title: 'Motor de armazenamento',
        links: [
          { id: 'pages', label: 'Páginas e extents (8 KB)', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV,
            hint: 'Page header, tipos de página, row offset array, LOB e overflow.' },
          { id: 'indexes', label: 'Design de índices', url: MS + 'relational-databases/sql-server-index-design-guide' + MSV,
            hint: 'Clustered vs nonclustered e organização das linhas.' },
          { id: 'capacity', label: 'Limites de capacidade', url: MS + 'sql-server/maximum-capacity-specifications-for-sql-server' + MSV,
            hint: 'Limite de 8060 bytes por linha in-row, tamanho de página, etc.' }
        ]
      },
      {
        id: 'rowPage',
        title: 'Linha e página de dados',
        links: [
          { id: 'rowOverflow', label: 'Row-overflow (24 B)', url: MS + 'relational-databases/pages-and-extents-architecture-guide#row-overflow-data-pages' + MSV,
            hint: 'Colunas que saem da linha para páginas ROW_OVERFLOW_DATA.' },
          { id: 'lobPages', label: 'Páginas LOB (16 B na linha)', url: MS + 'relational-databases/pages-and-extents-architecture-guide#lob-pages' + MSV,
            hint: 'Ponteiro LOB na linha; dados grandes em páginas dedicadas.' },
          { id: 'recordStructure', label: 'Estrutura de registros (record)', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV,
            hint: 'Record header, null bitmap, seção fixa e variável (visão geral).' },
          { id: 'largeValues', label: 'Tipos MAX / large values', url: MS + 't-sql/data-types/char-and-varchar-transact-sql#large-value-data-types' + MSV,
            hint: 'varchar(max), varbinary(max) e armazenamento fora da linha.' }
        ]
      },
      {
        id: 'types',
        title: 'Tipos de dados (T-SQL)',
        links: [
          { id: 'typesOverview', label: 'Visão geral dos tipos', url: MS + 't-sql/data-types/data-types-transact-sql' + MSV,
            hint: 'Referência de todos os tipos suportados.' },
          { id: 'strings', label: 'char / varchar', url: MS + 't-sql/data-types/char-and-varchar-transact-sql' + MSV },
          { id: 'nstrings', label: 'nchar / nvarchar', url: MS + 't-sql/data-types/nchar-and-nvarchar-transact-sql' + MSV },
          { id: 'numerics', label: 'int, decimal, float…', url: MS + 't-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql' + MSV },
          { id: 'binary', label: 'binary / varbinary', url: MS + 't-sql/data-types/binary-and-varbinary-transact-sql' + MSV },
          { id: 'datetime', label: 'date e time', url: MS + 't-sql/data-types/date-transact-sql' + MSV },
          { id: 'bit', label: 'bit', url: MS + 't-sql/data-types/bit-transact-sql' + MSV }
        ]
      }
    ],
    concepts: {
      pageHeader: { label: 'Page header (96 B)', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV },
      rowOffsetArray: { label: 'Row offset array', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV },
      recordHeader: { label: 'Record header', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV },
      nullBitmap: { label: 'Null bitmap', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV },
      variableSection: { label: 'Seção variável', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV },
      inRowLimit: { label: 'Limite in-row (8060 B)', url: MS + 'sql-server/maximum-capacity-specifications-for-sql-server' + MSV },
      pageSize: { label: 'Página de 8 KB', url: MS + 'relational-databases/pages-and-extents-architecture-guide' + MSV }
    },
    storageModes: {
      inrow: { label: 'Armazenamento in-row', url: MS + 't-sql/data-types/char-and-varchar-transact-sql' + MSV },
      lob_root: { label: 'Ponteiro LOB (16 B)', url: MS + 'relational-databases/pages-and-extents-architecture-guide#lob-pages' + MSV },
      overflow: { label: 'Row overflow (24 B)', url: MS + 'relational-databases/pages-and-extents-architecture-guide#row-overflow-data-pages' + MSV },
      bit_packed: { label: 'Colunas bit empacotadas', url: MS + 't-sql/data-types/bit-transact-sql' + MSV },
      fixed: { label: 'Coluna de tamanho fixo', url: MS + 't-sql/data-types/data-types-transact-sql' + MSV }
    }
  };

  var GROWTH_TYPE_DOC_URLS = {
    varchar: MS + 't-sql/data-types/char-and-varchar-transact-sql' + MSV,
    nvarchar: MS + 't-sql/data-types/nchar-and-nvarchar-transact-sql' + MSV,
    char: MS + 't-sql/data-types/char-and-varchar-transact-sql' + MSV,
    nchar: MS + 't-sql/data-types/nchar-and-nvarchar-transact-sql' + MSV,
    text: MS + 't-sql/data-types/char-and-varchar-transact-sql' + MSV,
    ntext: MS + 't-sql/data-types/nchar-and-nvarchar-transact-sql' + MSV,
    int: MS + 't-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql' + MSV,
    bigint: MS + 't-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql' + MSV,
    smallint: MS + 't-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql' + MSV,
    tinyint: MS + 't-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql' + MSV,
    bit: MS + 't-sql/data-types/bit-transact-sql' + MSV,
    decimal: MS + 't-sql/data-types/decimal-and-numeric-transact-sql' + MSV,
    numeric: MS + 't-sql/data-types/decimal-and-numeric-transact-sql' + MSV,
    float: MS + 't-sql/data-types/float-and-real-transact-sql' + MSV,
    real: MS + 't-sql/data-types/float-and-real-transact-sql' + MSV,
    money: MS + 't-sql/data-types/money-and-smallmoney-transact-sql' + MSV,
    smallmoney: MS + 't-sql/data-types/money-and-smallmoney-transact-sql' + MSV,
    date: MS + 't-sql/data-types/date-transact-sql' + MSV,
    time: MS + 't-sql/data-types/time-transact-sql' + MSV,
    datetime: MS + 't-sql/data-types/datetime-transact-sql' + MSV,
    datetime2: MS + 't-sql/data-types/datetime2-transact-sql' + MSV,
    smalldatetime: MS + 't-sql/data-types/smalldatetime-transact-sql' + MSV,
    datetimeoffset: MS + 't-sql/data-types/datetimeoffset-transact-sql' + MSV,
    binary: MS + 't-sql/data-types/binary-and-varbinary-transact-sql' + MSV,
    varbinary: MS + 't-sql/data-types/binary-and-varbinary-transact-sql' + MSV,
    image: MS + 't-sql/data-types/binary-and-varbinary-transact-sql' + MSV,
    timestamp: MS + 't-sql/data-types/rowversion-transact-sql' + MSV,
    rowversion: MS + 't-sql/data-types/rowversion-transact-sql' + MSV,
    uniqueidentifier: MS + 't-sql/data-types/uniqueidentifier-transact-sql' + MSV,
    xml: MS + 't-sql/data-types/xml-transact-sql' + MSV
  };

  function getGrowthDoc(category, key) {
    if (category === 'concept') return GROWTH_DOCS.concepts[key] || null;
    if (category === 'storageMode') return GROWTH_DOCS.storageModes[key] || null;
    if (category === 'section') {
      var sec = GROWTH_DOCS.sections.find(function (s) { return s.id === key; });
      return sec ? { label: sec.title, url: sec.links[0] && sec.links[0].url } : null;
    }
    return null;
  }

  function getGrowthTypeDocUrl(type) {
    var t = (type || '').toLowerCase();
    return GROWTH_TYPE_DOC_URLS[t] || GROWTH_DOCS.sections[2].links[0].url;
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
    PAGE_HEADER: PAGE_HEADER,
    PAGE_DATA_BYTES: PAGE_DATA_BYTES,
    ROW_LIMIT_INROW: ROW_LIMIT_INROW,
    PAGE_HEADER_FIELDS: PAGE_HEADER_FIELDS,
    buildSlotArrayDetail: buildSlotArrayDetail,
    computeRowSizePotencial: computeRowSizePotencial,
    analyzeTable: analyzeTable,
    analyzeDatabase: analyzeDatabase,
    formatBytes: formatBytes,
    GROWTH_EXPORT_QUERY: GROWTH_EXPORT_QUERY,
    fetchGrowthExportQuery: fetchGrowthExportQuery,
    GROWTH_DOCS: GROWTH_DOCS,
    getGrowthDoc: getGrowthDoc,
    getGrowthTypeDocUrl: getGrowthTypeDocUrl
  });
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
