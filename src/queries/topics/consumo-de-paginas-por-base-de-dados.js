(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_consumo_de_paginas_por_base_de_dados = {
    id: "consumo-de-paginas-por-base-de-dados",
    title: "Consumo de Paginas por Base de dados",
    tags: ["MEMORIA"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			SELECT	DatabaseName
				,	[DirtyPages]
				,	[DirtyPagesMb] = convert(money, DirtyPages * 8.0 / 1024)
				,	[DirtyPages%] = convert(money, 1.0* DirtyPages/ TotalPages * 100.0)

				,	[CleanPages]
				,	[CleanPagesMb] = convert(money, CleanPages * 8.0 / 1024)
				,	[CleanPages%] = convert(money, 1.0* CleanPages/ TotalPages * 100.0)
				
				,	[TotalPagesMb] = convert(money, TotalPages * 8.0 / 1024)
				,	[Database%] = convert(money, (1.0* DirtyPages + CleanPages)/ TotalPages * 100.0)
			FROM (
				SELECT	*
					,	TotalPages = SUM(DirtyPages + CleanPages) OVER (ORDER BY (SELECT 1))
				FROM (
					SELECT	DatabaseName = DB_NAME(DATABASE_ID)
						,	DirtyPages = SUM(IIF(IS_MODIFIED = 1, 1, 0))
						,	CleanPages = SUM(IIF(IS_MODIFIED = 0, 1, 0))
					FROM	SYS.DM_OS_BUFFER_DESCRIPTORS
					GROUP BY(DATABASE_ID)
				) P 
			) p 
			ORDER BY convert(money, (1.0* DirtyPages + CleanPages)/ TotalPages * 100.0) DESC` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
