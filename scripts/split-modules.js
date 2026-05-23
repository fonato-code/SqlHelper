const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function extractScript(htmlPath) {
  const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
  const m = html.match(
    /<script src="src\/js\/bootstrap-v5\.3\.8\.js"><\/script>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/
  );
  if (!m) throw new Error('Script not found in ' + htmlPath);
  return m[1].replace(/^\s{4}/gm, '');
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content, 'utf8');
  console.log('wrote', file);
}

// --- sqlhelp-sql.js (shared types) ---
write(
  'src/js/sqlhelp-sql.js',
  `(function (global) {
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
      return \`\${t}(\${n})\`;
    }
    if (PRECSCALE_TYPES.includes(t)) {
      const p = col.prec != null ? col.prec : 18;
      const s = col.scale != null ? col.scale : 0;
      return \`\${t}(\${p}, \${s})\`;
    }
    if (SCALE_TYPES.includes(t) && col.scale != null && col.scale > 0) {
      return \`\${t}(\${col.scale})\`;
    }
    return t;
  };

  SqlHelp.formatNullReplacementSql = function formatNullReplacementSql(value, type) {
    const v = (value || '').trim();
    if (!v) return null;
    if (/^N'.+'$/i.test(v) || /^'.+'$/.test(v)) return v;
    if (/^\\(\\(.+\\)\\)$/.test(v)) return v;
    if (/^0x[0-9a-f]+$/i.test(v)) return v;
    if (/^[a-zA-Z_@][\\w.]*\\s*\\(/i.test(v)) return v;
    const t = (type || '').toLowerCase();
    const numericTypes = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'];
    if (t === 'bit') {
      if (/^(0|1|true|false)$/i.test(v)) return /^(1|true)$/i.test(v) ? '1' : '0';
    }
    if (numericTypes.includes(t) && /^-?\\d+(\\.\\d+)?$/.test(v)) return v;
    if (v.toUpperCase() === 'NULL') return 'NULL';
    return \`N'\${v.replace(/'/g, "''")}'\`;
  };
})(typeof window !== 'undefined' ? window : this);
`
);

// --- sqlhelp-ui.js ---
write(
  'src/js/sqlhelp-ui.js',
  `(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  SqlHelp.themeMixin = {
    methods: {
      applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
      },
      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(this.theme);
        localStorage.setItem('sqlhelp-theme', this.theme);
      }
    },
    mounted() {
      this.applyTheme(this.theme);
    }
  };

  SqlHelp.readClipboardText = async function readClipboardText() {
    return navigator.clipboard.readText();
  };

  SqlHelp.clipboardErrorMessage = function clipboardErrorMessage(e, fallback) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      return 'Não foi possível ler a área de transferência. Permita o acesso ou cole o texto no campo acima.';
    }
    return e.message || fallback || 'Erro ao ler a área de transferência.';
  };

  SqlHelp.showToast = function showToast(vm, msg) {
    vm.toastMessage = msg;
    const el = vm.$refs.toastEl;
    if (el && global.bootstrap) {
      global.bootstrap.Toast.getOrCreateInstance(el).show();
    }
  };
})(typeof window !== 'undefined' ? window : this);
`
);

// --- theme init ---
write(
  'src/js/sqlhelp-theme.js',
  `(function () {
  var t = localStorage.getItem('sqlhelp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();
`
);

// --- stats parser from index ---
const indexScript = extractScript('index.html');
const spHelpIdx = indexScript.indexOf('const SAMPLE_SP_HELP');
const statsPart = indexScript.slice(0, spHelpIdx).replace(/^const \{ createApp \} = Vue;\s*\n/, '');

write(
  'src/js/sqlhelp-stats-parser.js',
  `(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};
  ${statsPart.trim()}
  SqlHelp.SAMPLE_STATISTICS = SAMPLE_STATISTICS;
  SqlHelp.normalizeStatsText = normalizeStatsText;
  SqlHelp.parseStatisticsOutput = parseStatisticsOutput;
})(typeof window !== 'undefined' ? window : this);
`
);

// --- sphelp parser ---
const appIdx = indexScript.indexOf('createApp({');
let sphelpPart = indexScript.slice(spHelpIdx, appIdx).trim();
// Remove duplicate type constants (now in sqlhelp-sql.js)
sphelpPart = sphelpPart.replace(
  /\n\s*const LENGTH_TYPES = \[[^\]]+\];\s*\n\s*const PRECSCALE_TYPES = \[[^\]]+\];\s*\n\s*const SCALE_TYPES = \[[^\]]+\];\s*\n/,
  '\n'
);
sphelpPart = sphelpPart.replace(/\n\s*function parseOptionalInt[\s\S]*?\n\s*}\s*\n\s*function buildTypeSql[\s\S]*?\n\s*}\s*\n\s*function formatNullReplacementSql[\s\S]*?\n\s*}\s*\n/, '\n');

write(
  'src/js/sqlhelp-sphelp-parser.js',
  `(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};
  var buildTypeSql = SqlHelp.buildTypeSql;
  ${sphelpPart}
  Object.assign(SqlHelp, {
    SAMPLE_SP_HELP,
    splitFixedColumns,
    parseBoolNullable,
    parseComputed,
    nextId,
    parseColumnRow,
    parsePkKeyItems,
    normalizePkColumns,
    serializePkColumns,
    pkColumnNames,
    buildPrimaryKeyFromSpHelp,
    snapshotPrimaryKey,
    primaryKeyEqual,
    identityTempColumnName,
    sqlhelpNewTableName,
    buildColumnDefinitionSql,
    parseSpHelp,
    snapshotColumn,
    columnsEqual,
    hasExecutableSqlLines,
    wrapScriptWithTransaction
  });
})(typeof window !== 'undefined' ? window : this);
`
);

// --- sphelp app: strip stats from createApp ---
let appPart = indexScript.slice(appIdx);
appPart = appPart.replace(/statsRawInput:[^\n]+\n\s*/g, '');
appPart = appPart.replace(/statsParsed:[^\n]+\n\s*/g, '');
appPart = appPart.replace(/statsParseError:[^\n]+\n\s*/g, '');
appPart = appPart.replace(/statsResult:[^\n]+\n\s*/g, '');
// Remove stats methods block
appPart = appPart.replace(/\n\s*formatMs\([\s\S]*?\n\s*},\n\s*loadSample\(\)/, '\n        loadSample()');
appPart = appPart.replace(/\n\s*applyTheme\(theme\) \{[\s\S]*?\n\s*toggleTheme\(\) \{[\s\S]*?\n\s*\}\s*\n\s*\},\s*\n\s*mounted\(\) \{[\s\S]*?\n\s*\}\s*\n\s*\}\)\.mount/, '\n      },\n      mixins: [SqlHelp.themeMixin]\n    }).mount');

const sphelpAppRefs = [
  'parseSpHelp', 'SAMPLE_SP_HELP', 'splitFixedColumns', 'parseBoolNullable', 'parseComputed',
  'nextId', 'normalizePkColumns', 'snapshotPrimaryKey', 'primaryKeyEqual', 'pkColumnNames',
  'identityTempColumnName', 'sqlhelpNewTableName', 'buildColumnDefinitionSql',
  'hasExecutableSqlLines', 'wrapScriptWithTransaction', 'snapshotColumn', 'buildTypeSql',
  'formatNullReplacementSql', 'columnsEqual', 'LENGTH_TYPES', 'PRECSCALE_TYPES', 'SCALE_TYPES'
];
let sphelpApp = appPart;
for (const name of sphelpAppRefs) {
  const re = new RegExp(`\\b${name}\\b`, 'g');
  sphelpApp = sphelpApp.replace(re, `SqlHelp.${name}`);
}

write(
  'src/js/sphelp-app.js',
  `/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  const { createApp } = Vue;
  ${sphelpApp.replace(/^createApp/, 'createApp')}
})().mount;
`
);

// Fix sphelp-app mount syntax
let sphelpContent = fs.readFileSync(path.join(root, 'src/js/sphelp-app.js'), 'utf8');
sphelpContent = sphelpContent.replace(/\}\)\(\)\.mount;\s*$/, '})();');
sphelpContent = sphelpContent.replace(
  /\}\)\.mount\('#app'\);/,
  `}).mount('#app');`
);
if (!sphelpContent.includes("mixins: [SqlHelp.themeMixin]")) {
  sphelpContent = sphelpContent.replace(
    /mounted\(\) \{\s*this\.applyTheme\(this\.theme\);\s*\}/,
    ''
  );
  sphelpContent = sphelpContent.replace(
    /methods: \{/,
    'mixins: [SqlHelp.themeMixin],\n      methods: {'
  );
  sphelpContent = sphelpContent.replace(
    /\n\s*applyTheme\(theme\) \{[\s\S]*?localStorage\.setItem\('sqlhelp-theme', this\.theme\);\s*\}\s*,?\s*(?=\n\s*copyScript|\n\s*showToast|\n\s*\},)/,
    '\n'
  );
  sphelpContent = sphelpContent.replace(
    /\n\s*showToast\(msg\) \{[\s\S]*?\n\s*\},/,
    `\n        showToast(msg) {
          SqlHelp.showToast(this, msg);
        },`
  );
}
fs.writeFileSync(path.join(root, 'src/js/sphelp-app.js'), sphelpContent, 'utf8');

// --- stats app ---
write(
  'src/js/stats-app.js',
  `/* global Vue, SqlHelp */
(function () {
  'use strict';
  const { createApp } = Vue;
  const S = SqlHelp;

  createApp({
    data() {
      return {
        theme: localStorage.getItem('sqlhelp-theme') || 'dark',
        statsRawInput: '',
        statsParsed: false,
        statsParseError: '',
        statsResult: null,
        toastMessage: ''
      };
    },
    methods: {
      formatMs(ms) {
        const n = Number(ms) || 0;
        return n + ' ms';
      },
      barPercent(value, max) {
        const v = Number(value) || 0;
        const m = Number(max) || 1;
        return Math.min(100, Math.round((v / m) * 100));
      },
      hotRowClass(elapsedMs) {
        const e = Number(elapsedMs) || 0;
        const threshold = this.statsResult?.elapsedThreshold || 50;
        if (e >= threshold * 2) return 'hot-high';
        if (e >= threshold) return 'hot-med';
        if (e > 0) return 'hot-low';
        return '';
      },
      loadStatsSample() {
        this.statsRawInput = S.SAMPLE_STATISTICS;
        this.statsParseError = '';
      },
      async parseStatsInputFromClipboard() {
        this.statsParseError = '';
        try {
          const text = await S.readClipboardText();
          if (!text.trim()) {
            this.statsParseError = 'Área de transferência vazia. Copie o resultado de STATISTICS IO/TIME antes de clicar.';
            return;
          }
          this.statsRawInput = text;
          this.parseStatsInput();
        } catch (e) {
          this.statsParseError = S.clipboardErrorMessage(e);
        }
      },
      parseStatsInput() {
        this.statsParseError = '';
        try {
          this.statsResult = S.parseStatisticsOutput(this.statsRawInput);
          this.statsParsed = true;
        } catch (e) {
          this.statsParsed = false;
          this.statsResult = null;
          this.statsParseError = e.message || 'Erro ao analisar estatísticas.';
        }
      },
      resetStats() {
        this.statsParsed = false;
        this.statsResult = null;
        this.statsParseError = '';
      },
      showToast(msg) {
        S.showToast(this, msg);
      }
    },
    mixins: [S.themeMixin]
  }).mount('#app');
})();
`
);

// --- compare ---
const compareScript = extractScript('compare.html');
const compareAppIdx = compareScript.indexOf('createApp({');
let compareLib = compareScript.slice(0, compareAppIdx).trim();
compareLib = compareLib.replace(/^const \{ createApp \} = Vue;\s*\n/, '');
compareLib = compareLib.replace(
  /\n\s*const LENGTH_TYPES = \[[^\]]+\];\s*\n\s*const PRECSCALE_TYPES = \[[^\]]+\];\s*\n\s*const SCALE_TYPES = \[[^\]]+\];\s*\n/,
  '\n'
);
compareLib = compareLib.replace(/\n\s*function parseOptionalInt[\s\S]*?\n\s*}\s*\n\s*function buildTypeSql[\s\S]*?\n\s*}\s*\n/, '\n');
compareLib = compareLib.replace(/\n\s*function formatNullReplacementSql[\s\S]*?\n\s*}\s*\n/, '\n');

write(
  'src/js/sqlhelp-compare-lib.js',
  `(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};
  var buildTypeSql = SqlHelp.buildTypeSql;
  var parseOptionalInt = SqlHelp.parseOptionalInt;
  var formatNullReplacementSql = SqlHelp.formatNullReplacementSql;
  ${compareLib}
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
`
);

let compareApp = compareScript.slice(compareAppIdx);
for (const name of [
  'parseTsv', 'compareColumnStatus', 'columnsDefinitionEqual', 'columnsTypeEqual',
  'needsDefaultForColumn', 'isDatetime2Col', 'buildTemporalSystemTimeLines',
  'buildTypeSql', 'formatNullReplacementSql', 'wrapScriptWithTransaction', 'TSV_HEADERS'
]) {
  compareApp = compareApp.replace(new RegExp(`\\b${name}\\b`, 'g'), `SqlHelp.${name}`);
}
compareApp = compareApp.replace(
  /\n\s*applyTheme\(theme\) \{[\s\S]*?\n\s*toggleTheme\(\) \{[\s\S]*?\n\s*\}\s*\n\s*\},\s*\n\s*mounted\(\) \{[\s\S]*?\n\s*\}/,
  '\n      },\n      mixins: [SqlHelp.themeMixin]'
);
compareApp = compareApp.replace(
  /\n\s*showToast\(msg\) \{[\s\S]*?\n\s*\},/,
  `\n        showToast(msg) {
          SqlHelp.showToast(this, msg);
        },`
);

write(
  'src/js/compare-app.js',
  `/* global Vue, SqlHelp */
(function () {
  'use strict';
  const { createApp } = Vue;
  ${compareApp}
})();`
);

// --- CSS ---
function extractStyle(htmlPath) {
  const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
  const m = html.match(/<style>\s*([\s\S]*?)\s*<\/style>/);
  if (!m) throw new Error('style not found in ' + htmlPath);
  return m[1];
}

const indexCss = extractStyle('index.html');
const compareCss = extractStyle('compare.html');

// Common: lines until .paste-area in index, plus shared from both
const commonEnd = indexCss.indexOf('.paste-area');
const commonFromIndex = indexCss.slice(0, commonEnd);

const compareOnlyStart = compareCss.indexOf('--bg-sidebar');
let commonVars = commonFromIndex;
if (compareOnlyStart > 0) {
  const sidebarVars = compareCss.slice(compareOnlyStart, compareCss.indexOf('}', compareOnlyStart) + 1);
  commonVars = commonVars.replace(
    /--placeholder-color: #[^;]+;/,
    (m) => m + '\n      ' + sidebarVars.trim()
  );
  // Add dark theme sidebar vars
  const darkSidebar = compareCss.match(/\[data-theme="dark"\] \{[\s\S]*?--sidebar-active:[^;]+;/);
  if (darkSidebar) {
    commonVars = commonVars.replace(
      /(\[data-theme="dark"\] \{[\s\S]*?)(--placeholder-color:[^;]+;)/,
      '$1$2\n      --bg-sidebar: #151820;\n      --sidebar-active: #3d8bfd;'
    );
  }
}

write('src/css/sqlhelp-common.css', commonVars + `
    .mono {
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.85rem;
    }

    .sql-output {
      min-height: 180px;
      max-height: 420px;
      overflow: auto;
      white-space: pre-wrap;
      background: var(--sql-bg);
      color: var(--sql-color);
      border-radius: 0.375rem;
      padding: 1rem;
    }

    .section-icon { width: 1.25rem; text-align: center; }

    [v-cloak] { display: none !important; }

    .sqlhelp-nav .nav-link {
      color: rgba(255, 255, 255, 0.85);
      border-radius: 0.375rem;
      padding: 0.35rem 0.75rem;
      font-size: 0.875rem;
    }

    .sqlhelp-nav .nav-link:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
    }

    .sqlhelp-nav .nav-link.active {
      color: #fff;
      background: rgba(255, 255, 255, 0.22);
      font-weight: 600;
    }
`);

write(
  'src/css/sqlhelp-sphelp.css',
  indexCss.slice(commonEnd, indexCss.indexOf('.stats-kpi')) +
    indexCss.slice(indexCss.indexOf('[data-theme="dark"] .alert-warning'), indexCss.indexOf('.stats-kpi'))
);

write('src/css/sqlhelp-stats.css', indexCss.slice(indexCss.indexOf('.stats-kpi')));

write(
  'src/css/sqlhelp-compare.css',
  compareCss.slice(compareCss.indexOf('tr.row-missing'))
);

console.log('All modules generated.');
