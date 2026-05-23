/**
 * Carrega scripts de tópicos de forma síncrona (document.write).
 * Deve ser incluído logo após topics-manifest.js, antes de catalog.js.
 */
(function () {
  if (!window.SqlHelp || !SqlHelp.queryTopicScripts) return;
  SqlHelp.queryTopicScripts.forEach(function (tag) {
    document.write(tag);
  });
})();
