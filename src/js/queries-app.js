/* global Vue, SqlHelp, hljs */
(function () {
  'use strict';
  var { createApp } = Vue;

  function getQueryIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('id') || '').trim();
  }

  function setQueryIdInUrl(id) {
    var url = new URL(window.location.href);
    if (id) url.searchParams.set('id', id);
    else url.searchParams.delete('id');
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  createApp({
    data() {
      return {
        theme: localStorage.getItem('sqlhelp-theme') || 'dark',
        topics: (SqlHelp.queryTopics || []).slice(),
        selectedId: getQueryIdFromUrl(),
        search: '',
        activeTag: '',
        toastMessage: '',
        paramValues: {}
      };
    },
    computed: {
      allTags() {
        var set = {};
        this.topics.forEach(function (t) {
          (t.tags || []).forEach(function (tag) {
            set[tag] = true;
          });
        });
        return Object.keys(set).sort();
      },
      filteredTopics() {
        var q = (this.search || '').trim().toLowerCase();
        var tag = this.activeTag;
        return this.topics.filter(function (t) {
          if (tag && (!t.tags || t.tags.indexOf(tag) < 0)) return false;
          if (!q) return true;
          if ((t.title || '').toLowerCase().indexOf(q) >= 0) return true;
          if ((t.id || '').toLowerCase().indexOf(q) >= 0) return true;
          return (t.tags || []).some(function (tg) {
            return tg.toLowerCase().indexOf(q) >= 0;
          });
        });
      },
      selectedTopic() {
        if (!this.selectedId) return null;
        return this.topics.find(function (t) {
          return t.id === this.selectedId;
        }, this) || null;
      },
      renderedBlocks() {
        var topic = this.selectedTopic;
        if (!topic || !topic.blocks) return [];
        var self = this;
        return topic.blocks.map(function (block, index) {
          if (block.type === 'md') {
            return {
              key: 'md-' + index,
              type: 'md',
              html: SqlHelp.renderMarkdown(block.content)
            };
          }

          var templateSql = SqlHelp.normalizeSqlIndent(block.sql || '');
          var params = SqlHelp.parseQueryParams(templateSql);
          var valuesMap = {};
          params.forEach(function (p) {
            var key = SqlHelp.buildParamKey(topic.id, index, p.name);
            var stored = self.paramValues[key];
            valuesMap[p.name] = stored !== undefined ? stored : p.default;
          });

          var resolvedSql = SqlHelp.applyQueryParams(templateSql, valuesMap);
          var paramsForUi = params.map(function (p) {
            return {
              name: p.name,
              type: p.type,
              options: p.options || [],
              paramKey: SqlHelp.buildParamKey(topic.id, index, p.name),
              value: valuesMap[p.name]
            };
          });

          return {
            key: 'sql-' + index,
            type: 'sql',
            title: block.title || '',
            templateSql: templateSql,
            resolvedSql: resolvedSql,
            sqlHtml: SqlHelp.highlightSql(resolvedSql),
            params: paramsForUi
          };
        });
      }
    },
    watch: {
      selectedId() {
        this.initParamValues();
      }
    },
    methods: {
      initParamValues() {
        var topic = this.selectedTopic;
        if (!topic || !topic.blocks) {
          this.paramValues = {};
          return;
        }
        var values = {};
        topic.blocks.forEach(function (block, blockIndex) {
          if (block.type !== 'sql') return;
          var sql = SqlHelp.normalizeSqlIndent(block.sql || '');
          var params = SqlHelp.parseQueryParams(sql);
          params.forEach(function (p) {
            var key = SqlHelp.buildParamKey(topic.id, blockIndex, p.name);
            values[key] = p.default;
          });
        });
        this.paramValues = values;
      },
      setParamValue(key, value) {
        this.paramValues = Object.assign({}, this.paramValues, (function () {
          var o = {};
          o[key] = value;
          return o;
        })());
      },
      selectTopic(topic) {
        this.selectedId = topic.id;
        setQueryIdInUrl(topic.id);
      },
      toggleTag(tag) {
        this.activeTag = this.activeTag === tag ? '' : tag;
      },
      async copySql(sql) {
        if (!sql) return;
        try {
          await navigator.clipboard.writeText(sql);
          SqlHelp.showToast(this, 'Query copiada para a área de transferência.');
        } catch (e) {
          SqlHelp.showToast(this, 'Não foi possível copiar. Selecione o texto manualmente.');
        }
      },
      showToast(msg) {
        SqlHelp.showToast(this, msg);
      }
    },
    mounted() {
      if (this.selectedId && !this.selectedTopic && this.topics.length) {
        this.selectedId = this.topics[0].id;
        setQueryIdInUrl(this.selectedId);
      }
      this.initParamValues();
    },
    mixins: [SqlHelp.themeMixin]
  }).mount('#app');
})();
