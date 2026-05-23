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
        toastMessage: ''
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
        return topic.blocks.map(function (block, index) {
          if (block.type === 'md') {
            return {
              key: 'md-' + index,
              type: 'md',
              html: SqlHelp.renderMarkdown(block.content)
            };
          }
          var sql = SqlHelp.normalizeSqlIndent(block.sql || '');
          return {
            key: 'sql-' + index,
            type: 'sql',
            title: block.title || '',
            sql: sql,
            sqlHtml: SqlHelp.highlightSql(sql)
          };
        });
      }
    },
    methods: {
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
    },
    mixins: [SqlHelp.themeMixin]
  }).mount('#app');
})();
