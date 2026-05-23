const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function extractInlineScript(htmlFile) {
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  const m = html.match(
    /<script src="src\/js\/bootstrap-v5\.3\.8\.js"><\/script>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/
  );
  if (!m) {
    // Already modular — read from backup inline if needed
    const backup = path.join(root, 'src/js/_index-inline.js');
    if (htmlFile === 'index.html' && fs.existsSync(backup)) {
      return fs.readFileSync(backup, 'utf8');
    }
    throw new Error('script not found in ' + htmlFile);
  }
  return m[1].replace(/^\s{4}/gm, '');
}

function prefixRefs(code, names) {
  let out = code;
  for (const name of names) {
    out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), `SqlHelp.${name}`);
  }
  return out;
}

const SPHELP_REFS = [
  'parseSpHelp', 'SAMPLE_SP_HELP', 'splitFixedColumns', 'parseBoolNullable', 'parseComputed',
  'nextId', 'normalizePkColumns', 'snapshotPrimaryKey', 'primaryKeyEqual', 'pkColumnNames',
  'identityTempColumnName', 'sqlhelpNewTableName', 'buildColumnDefinitionSql',
  'hasExecutableSqlLines', 'wrapScriptWithTransaction', 'snapshotColumn', 'buildTypeSql',
  'formatNullReplacementSql', 'columnsEqual', 'LENGTH_TYPES', 'PRECSCALE_TYPES', 'SCALE_TYPES',
  'parseStatisticsOutput', 'SAMPLE_STATISTICS'
];

// Use backup for full original app (index.html was already split)
let indexInline = fs.existsSync(path.join(root, 'src/js/_index-inline.js'))
  ? fs.readFileSync(path.join(root, 'src/js/_index-inline.js'), 'utf8')
  : extractInlineScript('index.html');

// Normalize line endings for regex
indexInline = indexInline.replace(/\r\n/g, '\n');

const appStart = indexInline.indexOf('createApp({');
let appBody = indexInline.slice(appStart);

// Remove stats data
appBody = appBody.replace(/\n\s*statsRawInput:[^\n]*\n/g, '\n');
appBody = appBody.replace(/\n\s*statsParsed:[^\n]*\n/g, '\n');
appBody = appBody.replace(/\n\s*statsParseError:[^\n]*\n/g, '\n');
appBody = appBody.replace(/\n\s*statsResult:[^\n]*\n/g, '\n');

// Remove stats methods block
appBody = appBody.replace(
  /\n\s*formatMs\(ms\) \{[\s\S]*?\n\s*resetStats\(\) \{[\s\S]*?\n\s*\},/,
  '\n'
);

appBody = prefixRefs(appBody, SPHELP_REFS);

// Replace theme block at end of methods
appBody = appBody.replace(
  /\n\s*showToast\(msg\) \{[\s\S]*?bootstrap\.Toast\.getOrCreateInstance\(el\);[\s\S]*?\n\s*\},[\s\S]*?\n\s*applyTheme\(theme\) \{[\s\S]*?localStorage\.setItem\('sqlhelp-theme', this\.theme\);[\s\S]*?\n\s*\}[\s\S]*?\n\s*\},[\s\S]*?\n\s*mounted\(\) \{[\s\S]*?this\.applyTheme\(this\.theme\);[\s\S]*?\n\s*\}[\s\S]*?\n\s*\}\)\.mount/,
  `
        showToast(msg) {
          SqlHelp.showToast(this, msg);
        }
      },
      mixins: [SqlHelp.themeMixin]
    }).mount`
);

const sphelpApp = `/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  const { createApp } = Vue;
  ${appBody}
})();`;

fs.writeFileSync(path.join(root, 'src/js/sphelp-app.js'), sphelpApp, 'utf8');
console.log('sphelp-app.js', sphelpApp.length);

// compare from backup or compare.html
let compareInline = fs.existsSync(path.join(root, 'src/js/_compare-inline.js'))
  ? fs.readFileSync(path.join(root, 'src/js/_compare-inline.js'), 'utf8')
  : extractInlineScript('compare.html');
compareInline = compareInline.replace(/\r\n/g, '\n');

const compareStart = compareInline.indexOf('createApp({');
let compareBody = compareInline.slice(compareStart);

const COMPARE_REFS = [
  'parseTsv', 'compareColumnStatus', 'columnsDefinitionEqual', 'columnsTypeEqual',
  'needsDefaultForColumn', 'isDatetime2Col', 'buildTemporalSystemTimeLines',
  'buildTypeSql', 'formatNullReplacementSql', 'wrapScriptWithTransaction', 'TSV_HEADERS'
];
compareBody = prefixRefs(compareBody, COMPARE_REFS);

compareBody = compareBody.replace(
  /\n\s*showToast\(msg\) \{[\s\S]*?bootstrap\.Toast\.getOrCreateInstance\(el\)\.show\(\);[\s\S]*?\n\s*\},[\s\S]*?\n\s*applyTheme\(theme\) \{[\s\S]*?localStorage\.setItem\('sqlhelp-theme', this\.theme\);[\s\S]*?\n\s*\}[\s\S]*?\n\s*\},[\s\S]*?\n\s*mounted\(\) \{[\s\S]*?this\.applyTheme\(this\.theme\);[\s\S]*?\n\s*\}[\s\S]*?\n\s*\}\)\.mount/,
  `
        showToast(msg) {
          SqlHelp.showToast(this, msg);
        }
      },
      mixins: [SqlHelp.themeMixin]
    }).mount`
);

const compareApp = `/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  const { createApp } = Vue;
  ${compareBody}
})();`;

fs.writeFileSync(path.join(root, 'src/js/compare-app.js'), compareApp, 'utf8');
console.log('compare-app.js', compareApp.length);

// Verify
const checks = ['sphelp-app.js', 'compare-app.js'];
for (const f of checks) {
  const c = fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
  if (c.includes('statsRawInput')) console.warn('WARN', f, 'still has statsRawInput');
  if (c.includes('formatMs(')) console.warn('WARN', f, 'still has formatMs');
  if (c.includes('applyTheme(theme)')) console.warn('WARN', f, 'still has applyTheme');
  if (!c.includes('mixins: [SqlHelp.themeMixin]')) console.warn('WARN', f, 'missing theme mixin');
  try {
    new Function(c);
    console.log('OK parse', f);
  } catch (e) {
    console.error('FAIL parse', f, e.message);
  }
}
