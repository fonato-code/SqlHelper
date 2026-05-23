(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  var ARRAY_TYPES = { array: 1, select: 1, enum: 1 };

  function normalizeType(type) {
    var t = String(type || '').trim().toLowerCase();
    if (t === 'number') return 'number';
    if (ARRAY_TYPES[t]) return 'array';
    if (t === 'string') return 'string';
    return 'string';
  }

  function findClosingBrace(sql, fromIndex) {
    var inSingle = false;
    var inDouble = false;
    for (var i = fromIndex; i < sql.length; i++) {
      var c = sql[i];
      if (!inDouble && c === "'") {
        if (sql[i + 1] === "'") {
          i++;
          continue;
        }
        inSingle = !inSingle;
      } else if (!inSingle && c === '"') {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble && c === '}') {
        return i;
      }
    }
    return -1;
  }

  function findLastColonOutsideQuotes(s) {
    var inSingle = false;
    var inDouble = false;
    var depth = 0;
    var lastColon = -1;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (!inDouble && c === "'") {
        if (s[i + 1] === "'") {
          i++;
          continue;
        }
        inSingle = !inSingle;
      } else if (!inSingle && c === '"') {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === ':' && depth === 0) lastColon = i;
      }
    }
    return lastColon;
  }

  function parseQuotedString(raw) {
    var s = String(raw || '').trim();
    if (
      (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") ||
      (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"')
    ) {
      return s.slice(1, -1).replace(/''/g, "'");
    }
    return s;
  }

  function parseArrayDefault(raw) {
    var s = String(raw || '').trim();
    if (!s.length || s.charAt(0) !== '[') return [];
    try {
      var json = s.replace(/'/g, '"');
      var arr = JSON.parse(json);
      if (!Array.isArray(arr)) return [];
      return arr.map(function (item) {
        return String(item);
      });
    } catch (e) {
      return [];
    }
  }

  function parseDefaultValue(type, defaultRaw) {
    var t = normalizeType(type);
    var raw = String(defaultRaw || '').trim();
    if (t === 'number') {
      var n = parseFloat(raw);
      return isFinite(n) ? n : 0;
    }
    if (t === 'array') {
      var options = parseArrayDefault(raw);
      return options.length ? options[0] : '';
    }
    return parseQuotedString(raw);
  }

  function tryParseJsonPlaceholder(inner) {
    var trimmed = String(inner || '').trim();
    if (!trimmed.length) return null;
    if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '"') return null;
    try {
      var obj = JSON.parse(trimmed);
      if (!obj || typeof obj !== 'object') return null;
      var type = normalizeType(obj.type);
      var name = String(obj.label || obj.name || '').trim();
      if (!name) return null;
      var options = Array.isArray(obj.options)
        ? obj.options.map(String)
        : parseArrayDefault(obj.default);
      if (type === 'array' && !options.length && Array.isArray(obj.default)) {
        options = obj.default.map(String);
      }
      var defaultVal = parseDefaultValue(
        type,
        type === 'array' ? JSON.stringify(options.length ? options : obj.default) : obj.default
      );
      if (type === 'array' && options.length) defaultVal = options[0];
      return {
        name: name,
        type: type,
        default: defaultVal,
        options: type === 'array' ? options : []
      };
    } catch (e) {
      return null;
    }
  }

  function parsePlaceholderInner(inner) {
    var jsonParsed = tryParseJsonPlaceholder(inner);
    if (jsonParsed) return jsonParsed;

    var firstColon = inner.indexOf(':');
    if (firstColon < 0) return null;

    var lastColon = findLastColonOutsideQuotes(inner);
    if (lastColon <= firstColon) return null;

    var type = inner.slice(0, firstColon).trim();
    var name = inner.slice(lastColon + 1).trim();
    var defaultRaw = inner.slice(firstColon + 1, lastColon).trim();
    if (!name) return null;

    var normalizedType = normalizeType(type);
    var options = normalizedType === 'array' ? parseArrayDefault(defaultRaw) : [];
    var defaultVal = parseDefaultValue(
      normalizedType,
      normalizedType === 'array' ? defaultRaw : defaultRaw
    );

    return {
      name: name,
      type: normalizedType,
      default: defaultVal,
      options: options
    };
  }

  SqlHelp.parseQueryParams = function parseQueryParams(sql) {
    var text = String(sql || '');
    var params = [];
    var i = 0;

    while (i < text.length) {
      var start = text.indexOf('@@{', i);
      if (start < 0) break;
      var innerStart = start + 3;
      var end = findClosingBrace(text, innerStart);
      if (end < 0) break;

      var inner = text.slice(innerStart, end);
      var parsed = parsePlaceholderInner(inner);
      if (parsed) {
        params.push({
          name: parsed.name,
          type: parsed.type,
          default: parsed.default,
          options: parsed.options || [],
          raw: text.slice(start, end + 1),
          start: start,
          end: end + 1
        });
      }
      i = end + 1;
    }

    return params;
  };

  SqlHelp.formatSqlParamValue = function formatSqlParamValue(type, value) {
    var t = normalizeType(type);
    if (t === 'number') {
      var n = Number(value);
      return isFinite(n) ? String(n) : '0';
    }
    var s = String(value == null ? '' : value);
    return "'" + s.replace(/'/g, "''") + "'";
  };

  SqlHelp.getDefaultParamValues = function getDefaultParamValues(params) {
    var out = {};
    (params || []).forEach(function (p) {
      out[p.name] = p.default;
    });
    return out;
  };

  SqlHelp.applyQueryParams = function applyQueryParams(sql, valuesByLabel) {
    var text = String(sql || '');
    var params = SqlHelp.parseQueryParams(text);
    if (!params.length) return text;

    var sorted = params.slice().sort(function (a, b) {
      return b.start - a.start;
    });

    var result = text;
    sorted.forEach(function (p) {
      var val = Object.prototype.hasOwnProperty.call(valuesByLabel || {}, p.name)
        ? valuesByLabel[p.name]
        : p.default;
      var formatted = SqlHelp.formatSqlParamValue(p.type, val);
      result = result.slice(0, p.start) + formatted + result.slice(p.end);
    });

    return result;
  };

  SqlHelp.buildParamKey = function buildParamKey(topicId, blockIndex, label) {
    return String(topicId || '') + '::' + blockIndex + '::' + label;
  };
})(typeof window !== 'undefined' ? window : this);
