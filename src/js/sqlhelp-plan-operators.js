(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  const DOC_URL_PT =
    'https://learn.microsoft.com/pt-br/sql/relational-databases/showplan-logical-and-physical-operators-reference?view=sql-server-ver17';
  const DOC_URL_EN =
    'https://learn.microsoft.com/en-us/sql/relational-databases/showplan-logical-and-physical-operators-reference?view=sql-server-ver17';

  const CATCH_ALL_PHYSICAL = 'icon-iterator-catch-all.png';
  const CATCH_ALL_LOGICAL = 'icon-language-construct-catch-all.png';

  const PHYSICAL_ALIASES = {
    'Table Insert': 'Clustered Index Insert',
    'Table Delete': 'Clustered Index Delete',
    'Table Update': 'Clustered Index Update',
    'Table Clustered Index Scan': 'Clustered Index Scan',
    'Table Clustered Index Seek': 'Clustered Index Seek'
  };

  let catalogByName = null;
  let catalogByIcon = null;

  function getCatalog() {
    return SqlHelp.PLAN_OPERATORS_CATALOG || null;
  }

  function ensureIndex() {
    if (catalogByName) return;
    const cat = getCatalog();
    catalogByName = new Map();
    catalogByIcon = new Map();
    if (!cat || !cat.operators) return;
    for (const op of cat.operators) {
      if (!catalogByName.has(op.name) || (op.iconFile && !catalogByName.get(op.name).iconFile)) {
        catalogByName.set(op.name, op);
      }
      if (op.iconFile) catalogByIcon.set(op.iconFile.toLowerCase(), op);
    }
  }

  function slugify(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function physicalToIconFile(physicalOp) {
    if (!physicalOp) return null;
    const file = 'icon-' + slugify(physicalOp) + '.png';
    ensureIndex();
    return catalogByIcon.has(file.toLowerCase()) ? file : null;
  }

  function operatorDocUrl(name) {
    if (!name) return DOC_URL_PT;
    return DOC_URL_PT + '#' + slugify(name);
  }

  function iconUrl(iconFile, operatorKind) {
    const cat = getCatalog();
    const base =
      (cat && cat.iconBaseUrl) ||
      'https://learn.microsoft.com/en-us/sql/relational-databases/media/showplan-logical-and-physical-operators-reference/';
    const file =
      iconFile ||
      (operatorKind === 'language' ? CATCH_ALL_LOGICAL : CATCH_ALL_PHYSICAL);
    return base + file;
  }

  function firstSentences(text, maxLen) {
    if (!text) return '';
    const clean = String(text).trim();
    const parts = clean.split(/(?<=[.!?])\s+/);
    let out = '';
    for (const p of parts) {
      const next = out ? out + ' ' + p : p;
      if (next.length > maxLen && out) break;
      out = next;
      if (out.length >= maxLen) break;
      if (parts.length <= 2) break;
    }
    if (!out) return clean.slice(0, maxLen);
    return out.length > maxLen ? out.slice(0, maxLen - 1) + '…' : out;
  }

  function descriptionPt(name, descriptionEn) {
    const pt = SqlHelp.PLAN_OPERATOR_DESCRIPTIONS_PT || {};
    if (pt[name]) return pt[name];
    if (descriptionEn) {
      return (
        firstSentences(descriptionEn, 500) +
        ' Consulte a documentação Microsoft para detalhes.'
      );
    }
    return 'Operador do plano de execução do SQL Server. Consulte a documentação Microsoft para detalhes.';
  }

  function entryToMeta(entry, displayName) {
    const name = displayName || entry.name;
    const operatorKind = entry.operatorKind || 'unknown';
    return {
      name,
      iconUrl: iconUrl(entry.iconFile, operatorKind),
      iconFile: entry.iconFile,
      description: descriptionPt(name, entry.descriptionEn),
      descriptionEn: entry.descriptionEn || '',
      operatorKind,
      docUrl: operatorDocUrl(name)
    };
  }

  function lookupByName(name) {
    if (!name) return null;
    ensureIndex();
    const entry = catalogByName.get(name);
    return entry ? entryToMeta(entry, name) : null;
  }

  function getPlanOperatorMeta(physicalOp, logicalOp) {
    ensureIndex();

    const phys = (physicalOp || '').trim();
    const log = (logicalOp || '').trim();

    if (phys) {
      let meta = lookupByName(phys);
      if (meta) return meta;

      const alias = PHYSICAL_ALIASES[phys];
      if (alias) {
        meta = lookupByName(alias);
        if (meta) return entryToMeta(catalogByName.get(alias), phys);
      }

      const guessed = physicalToIconFile(phys);
      if (guessed) {
        const entry = catalogByIcon.get(guessed.toLowerCase());
        if (entry) return entryToMeta(entry, phys);
      }
    }

    if (log) {
      const meta = lookupByName(log);
      if (meta) return meta;
    }

    const fallbackName = phys || log || 'Operador';
    const fallbackKind = phys ? 'physical' : log ? 'logical' : 'unknown';
    return {
      name: fallbackName,
      iconUrl: iconUrl(null, fallbackKind),
      iconFile: null,
      description: descriptionPt(fallbackName, ''),
      descriptionEn: '',
      operatorKind: fallbackKind,
      docUrl: operatorDocUrl(fallbackName)
    };
  }

  SqlHelp.PLAN_OPERATORS_DOC_URL = DOC_URL_PT;
  SqlHelp.PLAN_OPERATORS_DOC_URL_EN = DOC_URL_EN;
  SqlHelp.PLAN_QUERY_PROCESSING_DOC_URL =
    'https://learn.microsoft.com/pt-br/sql/relational-databases/query-processing-architecture-guide';
  SqlHelp.getPlanOperatorMeta = getPlanOperatorMeta;
  SqlHelp.planOperatorIconFallback = function (meta) {
    if (!meta) return '';
    const kind = meta.operatorKind;
    const file = kind === 'language' ? CATCH_ALL_LOGICAL : CATCH_ALL_PHYSICAL;
    const cat = getCatalog();
    const base =
      (cat && cat.iconBaseUrl) ||
      'https://learn.microsoft.com/en-us/sql/relational-databases/media/showplan-logical-and-physical-operators-reference/';
    return base + file;
  };
})(typeof window !== 'undefined' ? window : this);
