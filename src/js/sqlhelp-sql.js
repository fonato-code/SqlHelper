(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  SqlHelp.LENGTH_TYPES = ['varchar', 'nvarchar', 'char', 'nchar', 'varbinary', 'binary'];
  SqlHelp.PRECSCALE_TYPES = ['decimal', 'numeric'];
  SqlHelp.SCALE_TYPES = ['datetime2', 'datetimeoffset', 'time'];

  SqlHelp.parseOptionalInt = function parseOptionalInt(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  };

  SqlHelp.buildTypeSql = function buildTypeSql(col) {
    const LENGTH_TYPES = SqlHelp.LENGTH_TYPES;
    const PRECSCALE_TYPES = SqlHelp.PRECSCALE_TYPES;
    const SCALE_TYPES = SqlHelp.SCALE_TYPES;
    const t = (col.type || 'varchar').toLowerCase();
    if (LENGTH_TYPES.includes(t)) {
      const len = (col.lengthDisplay || '').toString().trim().toUpperCase();
      const n = len === 'MAX' ? 'MAX' : (parseInt(len, 10) || col.length || 50);
      return `${t}(${n})`;
    }
    if (PRECSCALE_TYPES.includes(t)) {
      const p = col.prec != null ? col.prec : 18;
      const s = col.scale != null ? col.scale : 0;
      return `${t}(${p}, ${s})`;
    }
    if (SCALE_TYPES.includes(t) && col.scale != null && col.scale > 0) {
      return `${t}(${col.scale})`;
    }
    return t;
  };

  SqlHelp.formatNullReplacementSql = function formatNullReplacementSql(value, type) {
    const v = (value || '').trim();
    if (!v) return null;
    if (/^N'.+'$/i.test(v) || /^'.+'$/.test(v)) return v;
    if (/^\(\(.+\)\)$/.test(v)) return v;
    if (/^0x[0-9a-f]+$/i.test(v)) return v;
    if (/^[a-zA-Z_@][\w.]*\s*\(/i.test(v)) return v;
    const t = (type || '').toLowerCase();
    const numericTypes = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'];
    if (t === 'bit') {
      if (/^(0|1|true|false)$/i.test(v)) return /^(1|true)$/i.test(v) ? '1' : '0';
    }
    if (numericTypes.includes(t) && /^-?\d+(\.\d+)?$/.test(v)) return v;
    if (v.toUpperCase() === 'NULL') return 'NULL';
    return `N'${v.replace(/'/g, "''")}'`;
  };
})(typeof window !== 'undefined' ? window : this);
