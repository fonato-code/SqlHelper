const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const HEAD_ASSETS = `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="src/js/sqlhelp-theme.js"></script>
  <link href="src/css/bootsrtap-v5.3.8.css" rel="stylesheet">
  <link href="src/fontawesome5pro/fontawesome-pro-5.8.2.css" rel="stylesheet">
  <link href="src/css/sqlhelp-common.css" rel="stylesheet">`;

const FOOTER_SCRIPTS_BASE = `  <script src="src/js/vue.js"></script>
  <script src="src/js/bootstrap-v5.3.8.js"></script>
  <script src="src/js/sqlhelp-sql.js"></script>
  <script src="src/js/sqlhelp-ui.js"></script>`;

function nav(active) {
  const items = [
    { href: 'index.html', id: 'sphelp', label: 'sp_help', icon: 'fa-table' },
    { href: 'stats.html', id: 'stats', label: 'IO / Time', icon: 'fa-tachometer-alt' },
    { href: 'queries.html', id: 'queries', label: 'Queries', icon: 'fa-book' },
    { href: 'compare.html', id: 'compare', label: 'Comparar TSV', icon: 'fa-columns' },
    { href: 'growth.html', id: 'growth', label: 'Crescimento DB', icon: 'fa-chart-line' }
  ];
  const links = items.map(it => {
    const cls = active === it.id ? 'nav-link active' : 'nav-link';
    return `<li class="nav-item"><a href="${it.href}" class="${cls}"><i class="fal ${it.icon} me-1"></i>${it.label}</a></li>`;
  }).join('\n            ');
  return `<nav class="sqlhelp-nav me-2">
            <ul class="nav nav-pills gap-1 mb-0 flex-wrap justify-content-end">
            ${links}
            </ul>
          </nav>`;
}

function header(pageId, title, subtitle, icon) {
  return `    <header class="app-header py-3 mb-4 shadow-sm">
      <div class="container-fluid px-4">
        <div class="d-flex align-items-center gap-3 w-100 flex-wrap">
          <i class="fal ${icon} fa-2x"></i>
          <div class="flex-grow-1 min-width-0">
            <h1 class="h4 mb-0">${title}</h1>
            <p class="mb-0 small opacity-75">${subtitle}</p>
          </div>
          ${nav(pageId)}
          <button type="button" class="btn btn-sm theme-toggle-btn"
                  @click="toggleTheme"
                  :title="theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'">
            <i class="fal" :class="theme === 'dark' ? 'fa-sun' : 'fa-moon'"></i>
            <span class="ms-1 d-none d-sm-inline">{{ theme === 'dark' ? 'Claro' : 'Escuro' }}</span>
          </button>
        </div>
      </div>
    </header>`;
}

function toastHtml() {
  return `    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div class="toast align-items-center text-bg-success border-0" ref="toastEl" role="alert">
        <div class="d-flex">
          <div class="toast-body">
            <i class="fal fa-check me-1"></i> {{ toastMessage }}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    </div>`;
}

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Extract stats section
const statsMatch = indexHtml.match(
  /<!-- Estatísticas IO \/ TIME -->[\s\S]*?<\/section>\s*\n\s*<div class="stats-section-divider">[\s\S]*?<\/div>\s*\n/
);
const statsSection = statsMatch
  ? statsMatch[0].replace(/<div class="stats-section-divider">[\s\S]*?<\/div>\s*\n/, '')
  : '';

// Extract sphelp main (from Entrada sp_help to end of template before main close)
const sphelpMatch = indexHtml.match(
  /<!-- Entrada sp_help -->[\s\S]*?<\/template>\s*\n    <\/main>/
);
const sphelpMain = sphelpMatch ? sphelpMatch[0] : '';

function pageShell({ title, pageId, headerTitle, headerSub, headerIcon, extraCss, extraScripts, mainBody }) {
  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
${HEAD_ASSETS}
  <link href="src/css/${extraCss}" rel="stylesheet">
  <title>${title}</title>
</head>
<body>
  <div id="app" v-cloak>
${header(pageId, headerTitle, headerSub, headerIcon)}
    <main class="container-fluid px-4 pb-5">
${mainBody}
    </main>
${toastHtml()}
  </div>
${FOOTER_SCRIPTS_BASE}
${extraScripts}
</body>
</html>
`;
}

// index.html — sp_help only
fs.writeFileSync(
  path.join(root, 'index.html'),
  pageShell({
    title: 'SqlHelp — Editor sp_help',
    pageId: 'sphelp',
    headerTitle: 'SqlHelp',
    headerSub: 'Editor de colunas a partir do <code class="text-white">sp_help</code>',
    headerIcon: 'fa-database',
    extraCss: 'sqlhelp-sphelp.css',
    extraScripts: `  <script src="src/js/sqlhelp-sphelp-parser.js"></script>
  <script src="src/js/sphelp-app.js"></script>`,
    mainBody: sphelpMain
  }),
  'utf8'
);

// stats.html
fs.writeFileSync(
  path.join(root, 'stats.html'),
  pageShell({
    title: 'SqlHelp — STATISTICS IO / TIME',
    pageId: 'stats',
    headerTitle: 'SqlHelp — Estatísticas',
    headerSub: 'Análise de <code class="text-white">STATISTICS IO</code> e <code class="text-white">TIME</code>',
    headerIcon: 'fa-tachometer-alt',
    extraCss: 'sqlhelp-stats.css',
    extraScripts: `  <script src="src/js/sqlhelp-stats-parser.js"></script>
  <script src="src/js/stats-app.js"></script>`,
    mainBody: statsSection
  }),
  'utf8'
);

// compare.html — extract body from original before overwrite
const compareOrig = fs.readFileSync(path.join(root, 'compare.html'), 'utf8');
const compareMainMatch = compareOrig.match(/<main class="container-fluid px-4 pb-5">([\s\S]*?)<\/main>/);
const compareMain = compareMainMatch ? compareMainMatch[1] : '';

fs.writeFileSync(
  path.join(root, 'compare.html'),
  pageShell({
    title: 'SqlHelp — Comparar bases (TSV)',
    pageId: 'compare',
    headerTitle: 'SqlHelp — Comparar bases',
    headerSub: 'Importe TSV do banco <strong>origem</strong> e <strong>destino</strong> e gere scripts <code class="text-white">ALTER TABLE</code>',
    headerIcon: 'fa-columns',
    extraCss: 'sqlhelp-compare.css',
    extraScripts: `  <script src="src/js/sqlhelp-compare-lib.js"></script>
  <script src="src/js/compare-app.js"></script>`,
    mainBody: compareMain
  }),
  'utf8'
);

console.log('HTML pages built: index.html, stats.html, compare.html');
