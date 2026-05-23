(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_quanditade_de_espaco_livre_nos_arquivos_dobanco = {
    id: "quanditade-de-espaco-livre-nos-arquivos-dobanco",
    title: "Quanditade de espaço livre nos arquivos dobanco",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	-- Serve para analisar o tamanho de espaço livre antes de fazer um DBCC SHRINKFILE
	SELECT NAME 
		,	[Tamanho Total kb] = SIZE
		,	[Espaco Ocupado kb] = CAST(FILEPROPERTY(NAME, 'SPACEUSED') AS INT)
		,	[Espaco Livre kb] = SIZE - CAST(FILEPROPERTY(NAME, 'SPACEUSED') AS INT)
		,	[Paginas Livre] = (SIZE - CAST(FILEPROPERTY(NAME, 'SPACEUSED') AS INT))/8
	FROM	SYS.DATABASE_FILES;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
