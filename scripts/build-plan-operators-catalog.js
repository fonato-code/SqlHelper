/**
 * Gera src/data/plan-operators-catalog.json a partir do markdown Microsoft Learn.
 * Uso: node scripts/build-plan-operators-catalog.js [caminho-md]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mdPath =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || '',
    '.cursor',
    'projects',
    'c-ProjetosTeste-SqlHelp',
    'uploads',
    'showplan-logical-and-physical-operators-reference-0.md'
  );
const altMd = path.join(root, 'uploads', 'showplan-logical-and-physical-operators-reference-0.md');
const inputPath = fs.existsSync(mdPath) ? mdPath : altMd;
const outPath = path.join(root, 'src', 'data', 'plan-operators-catalog.json');

function parseOperatorKind(desc) {
  const d = desc.toLowerCase();
  if (d.includes('language element')) return 'language';
  if (d.includes('logical and physical')) return 'both';
  if (d.includes('logical operator')) return 'logical';
  if (d.includes('physical operator')) return 'physical';
  return 'unknown';
}

function extractName(cell) {
  const m = cell.match(/\*\*([^*]+)\*\*/);
  if (!m) return cell.trim();
  let name = m[1].trim();
  const paren = name.indexOf('(');
  if (paren > 0 && name.includes('If') && name.includes('While')) {
    name = name.slice(0, paren).trim();
  }
  return name;
}

function extractIconFile(cell) {
  if (/^\s*None\s*$/i.test(cell)) return null;
  const m = cell.match(/icon-([a-z0-9-]+)\.png/i);
  return m ? 'icon-' + m[1] + '.png' : null;
}

function cleanDescription(cell) {
  return cell
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\|+$/g, '')
    .trim();
}

function main() {
  const text = fs.readFileSync(inputPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const operators = [];
  const byName = {};

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('Showplan operator')) continue;
    if (/^\|\s*---/.test(line)) continue;

    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 5) continue;

    const iconCell = parts[1];
    const nameCell = parts[2];
    const descCell = parts.slice(3).join('|').trim();

    const name = extractName(nameCell);
    if (!name) continue;

    const iconFile = extractIconFile(iconCell);
    const descriptionEn = cleanDescription(descCell);
    const operatorKind = parseOperatorKind(descriptionEn);

    const entry = {
      name,
      iconFile,
      descriptionEn,
      operatorKind
    };

    if (!byName[name] || (iconFile && !byName[name].iconFile)) {
      byName[name] = entry;
    }
  }

  for (const name of Object.keys(byName).sort()) {
    operators.push(byName[name]);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'https://learn.microsoft.com/en-us/sql/relational-databases/showplan-logical-and-physical-operators-reference',
    iconBaseUrl:
      'https://learn.microsoft.com/en-us/sql/relational-databases/media/showplan-logical-and-physical-operators-reference/',
    operators
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  const embedPath = path.join(root, 'src', 'js', 'sqlhelp-plan-operators-catalog.js');
  const embed =
    '/* Gerado por scripts/build-plan-operators-catalog.js — não editar */\n' +
    '(function (g) {\n' +
    "  'use strict';\n" +
    '  var SqlHelp = g.SqlHelp = g.SqlHelp || {};\n' +
    '  SqlHelp.PLAN_OPERATORS_CATALOG = ' +
    JSON.stringify(out) +
    ';\n' +
    "})(typeof window !== 'undefined' ? window : this);\n";
  fs.writeFileSync(embedPath, embed, 'utf8');

  console.log('Wrote', operators.length, 'operators to', outPath);
  console.log('Wrote embedded catalog to', embedPath);
}

main();
