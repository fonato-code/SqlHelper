/**
 * Importa QUERIES DE AJUDA T-SQL.md → src/queries/topics/*.js + catalog.js
 * Uso: node scripts/import-queries-from-md.js [caminho-do-md]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const defaultMd = path.join(
  process.env.USERPROFILE || '',
  'OneDrive',
  'Fadami',
  'Arquivos Importantes',
  'QUERIES DE AJUDA T-SQL.md'
);
const mdPath = process.argv[2] || defaultMd;
const topicsDir = path.join(root, 'src', 'queries', 'topics');
const catalogPath = path.join(root, 'src', 'queries', 'catalog.js');

function slugify(title) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\*\*\([^)]+\)\*\*/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'topico';
}

function escapeTemplate(str) {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function parseTitle(line) {
  const tagMatch = line.match(/\*\*\(([A-Z_]+)\)\*\*/);
  const tags = tagMatch ? [tagMatch[1]] : [];
  const title = line
    .replace(/^#\s+/, '')
    .replace(/\*\*\([^)]+\)\*\*/g, '')
    .trim();
  return { title, tags };
}

function parseSections(md) {
  const lines = md.split('\n');
  const h1Indices = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#\s+/.test(line) && !/^##\s+/.test(line)) {
      h1Indices.push(i);
    }
  }

  const topics = [];

  for (let k = 0; k < h1Indices.length; k++) {
    const h1Index = h1Indices[k];
    const endLine = k + 1 < h1Indices.length ? h1Indices[k + 1] : lines.length;

    const { title, tags } = parseTitle(lines[h1Index]);
    if (!title) continue;

    const body = lines.slice(h1Index + 1, endLine).join('\n').trim();
    const blocks = [];
    const fenceRe = /```\s*SQL\s*\n([\s\S]*?)```/gi;
    let lastEnd = 0;
    let match;
    let sqlIndex = 0;

    while ((match = fenceRe.exec(body)) !== null) {
      const mdBefore = body.slice(lastEnd, match.index).trim();
      if (mdBefore) {
        blocks.push({ type: 'md', content: mdBefore });
      }
      const sql = match[1].replace(/\s+$/, '');
      const beforeFence = body.slice(lastEnd, match.index);
      let sqlTitle = '';
      const titleMatch = beforeFence.match(/(?:^|\n)##\s+(.+)\s*$/i);
      if (titleMatch) {
        sqlTitle = titleMatch[1].trim();
      } else {
        sqlIndex += 1;
        sqlTitle = sqlIndex === 1 ? 'Query' : 'Query ' + sqlIndex;
      }
      const block = { type: 'sql', sql };
      if (sqlTitle && !/^querie\s*\d*$/i.test(sqlTitle)) {
        block.title = sqlTitle;
      } else if (sqlIndex > 1) {
        block.title = 'Query ' + sqlIndex;
      }
      blocks.push(block);
      lastEnd = match.index + match[0].length;
    }

    const mdAfter = body.slice(lastEnd).trim();
    if (mdAfter) {
      blocks.push({ type: 'md', content: mdAfter });
    }

    if (!blocks.length) continue;

    let id = slugify(title);
    const existing = topics.filter((t) => t.id === id).length;
    if (existing) id = id + '-' + (existing + 1);

    topics.push({ id, title, tags, blocks });
  }

  return topics;
}

function validateTopics(topics) {
  const ids = new Set();
  for (const t of topics) {
    if (ids.has(t.id)) throw new Error('ID duplicado: ' + t.id);
    ids.add(t.id);
  }
}

function blockToJs(block, indent) {
  const pad = indent || '      ';
  if (block.type === 'md') {
    return `${pad}{ type: 'md', content: \`${escapeTemplate(block.content)}\` }`;
  }
  const titlePart = block.title
    ? `, title: \`${escapeTemplate(block.title)}\``
    : '';
  return `${pad}{ type: 'sql'${titlePart}, sql: \`${escapeTemplate(block.sql)}\` }`;
}

function writeTopicFile(topic) {
  const varName = '_qt_' + topic.id.replace(/-/g, '_');
  const blocksJs = topic.blocks.map((b) => blockToJs(b)).join(',\n');
  const tagsJs = JSON.stringify(topic.tags);
  const content = `(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp.${varName} = {
    id: ${JSON.stringify(topic.id)},
    title: ${JSON.stringify(topic.title)},
    tags: ${tagsJs},
    blocks: [
${blocksJs}
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
`;
  fs.writeFileSync(path.join(topicsDir, topic.id + '.js'), content, 'utf8');
  return varName;
}

function writeCatalog(varNames) {
  const refs = varNames.map((v) => '    SqlHelp.' + v).join(',\n');
  const content = `/**
 * Catálogo de queries T-SQL (gerado/atualizado via scripts/import-queries-from-md.js)
 * Cada tópico está em src/queries/topics/<id>.js
 */
(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  var topics = [
${refs}
  ].filter(Boolean);
  SqlHelp.queryTopics = topics.slice().sort(function (a, b) {
    return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
  });
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
`;
  fs.writeFileSync(catalogPath, content, 'utf8');
}

function writeTopicsManifest(varNames, topicIds) {
  const scripts = topicIds
    .map((id) => `  '<script src="src/queries/topics/${id}.js"><\\/script>'`)
    .join(',\n');
  const content = `/**
 * AUTO-GENERATED — lista de scripts de tópicos para queries.html
 */
(function (global) {
  global.SqlHelp = global.SqlHelp || {};
  global.SqlHelp.queryTopicScripts = [
${scripts}
  ];
})(typeof window !== 'undefined' ? window : this);
`;
  fs.writeFileSync(path.join(root, 'src', 'queries', 'topics-manifest.js'), content, 'utf8');
}

function main() {
  if (!fs.existsSync(mdPath)) {
    console.error('Arquivo não encontrado:', mdPath);
    process.exit(1);
  }
  const md = fs.readFileSync(mdPath, 'utf8');
  const topics = parseSections(md);
  validateTopics(topics);
  if (!topics.length) {
    console.error('Nenhum tópico encontrado no markdown.');
    process.exit(1);
  }

  fs.mkdirSync(topicsDir, { recursive: true });

  const existing = fs.readdirSync(topicsDir).filter((f) => f.endsWith('.js'));
  for (const f of existing) {
    fs.unlinkSync(path.join(topicsDir, f));
  }

  const varNames = [];
  const topicIds = [];
  for (const topic of topics) {
    const varName = writeTopicFile(topic);
    varNames.push(varName);
    topicIds.push(topic.id);
    console.log('  +', topic.id);
  }

  writeCatalog(varNames);
  writeTopicsManifest(varNames, topicIds);
  console.log('\n' + topics.length + ' tópicos → src/queries/topics/');
  console.log('catalog.js e topics-manifest.js atualizados.');
}

main();
