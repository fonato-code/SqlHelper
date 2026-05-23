(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  function stripUnsafeHtml(html) {
    return String(html || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }

  SqlHelp.renderMarkdown = function renderMarkdown(md) {
    if (!md || !String(md).trim()) return '';
    if (typeof global.marked === 'undefined') {
      return '<pre class="query-doc-fallback">' + escapeHtml(md) + '</pre>';
    }
    global.marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false
    });
    return stripUnsafeHtml(global.marked.parse(md));
  };

  /**
   * Remove indentação comum à esquerda (ex.: alinhamento no template literal do .js).
   * Permite indentar o SQL no arquivo fonte sem afetar a exibição/cópia.
   */
  SqlHelp.normalizeSqlIndent = function normalizeSqlIndent(sql) {
    var text = String(sql || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = text.split('\n');

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return '';

    var min = Infinity;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var prefix = lines[i].match(/^[\t ]*/);
      var len = prefix ? prefix[0].length : 0;
      if (len < min) min = len;
    }

    if (!isFinite(min) || min <= 0) return lines.join('\n');

    return lines.map(function (line) {
      if (!line.trim()) return '';
      return line.slice(min);
    }).join('\n');
  };

  SqlHelp.highlightSql = function highlightSql(sql) {
    var text = SqlHelp.normalizeSqlIndent(sql);
    if (!text.trim()) return '';
    if (typeof global.hljs !== 'undefined' && typeof global.hljs.highlight === 'function') {
      try {
        return global.hljs.highlight(text, { language: 'sql', ignoreIllegals: true }).value;
      } catch (e) {
        /* fallback abaixo */
      }
    }
    return escapeHtml(text);
  };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})(typeof window !== 'undefined' ? window : this);
