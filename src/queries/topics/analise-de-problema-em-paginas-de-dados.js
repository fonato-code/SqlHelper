(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_analise_de_problema_em_paginas_de_dados = {
    id: "analise-de-problema-em-paginas-de-dados",
    title: "analise de problema em paginas de dados",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	--DBCC CHECKDB (SUITS_WAY_TESTE) WITH NO_INFOMSGS, ALL_ERRORMSGS

	-- lista informações dos arquivos de banco 
	SELECT	mf.database_Id
		,	DBName = db.name 
		,	mf.[File_id]
		,	FileType = type_desc
		,	Location = Physical_Name
		--,	*
	FROM	sys.master_files mf
			INNER JOIN	sys.databases db ON db.database_id = mf.database_id

	-- exibe informações da pagina 
	select * from sys.dm_db_page_info ( 15 /*DatabaseId */, 1 /*FileId*/ , 1 /*PageId*/,  'DETAILED' /*Mode*/ )

	-- exibe todos os detalhes da pagina
	DBCC TRACEON (3604)
	-- dbcc page ( {'dbname' | dbid}, filenum, pagenum [, printopt={0|1|2|3} ])
	dbcc page( 15, 1 , 3283728 ,  3)  WITH TABLERESULTS
	DBCC TRACEOff (3604)

	-- lista de paginas de uma tabela
	SELECT	FileID = dpa.allocated_page_file_id
		,	PageID = dpa.allocated_page_page_id
		,	PageTypeDesc = dpa.page_type_desc
	FROM	sys.dm_db_database_page_allocations(DB_ID(), object_id('setor'), NULL, NULL, 'DETAILED') dpa` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
