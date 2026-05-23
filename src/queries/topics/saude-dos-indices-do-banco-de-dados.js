(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_saude_dos_indices_do_banco_de_dados = {
    id: "saude-dos-indices-do-banco-de-dados",
    title: "Saude dos indices do banco de dados",
    tags: ["INDICE"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `		-- Analisar :
		-- indices clustered com muitos scans 
		select	Esquema = s.name
			,	Tabela  = o.name
			,	Index_name = i.name
			,	I.type_desc
			,	ius.* 
		from	sys.DM_DB_INDEX_USAGE_STATS ius
				inner join sys.objects o on o.object_id = ius.object_id
				inner join sys.schemas s on s.schema_id = o.schema_id
				inner join sys.indexes i on i.object_id = ius.object_id  and i.index_id = ius.index_id
		where	ius.database_id = DB_ID()
		order by	
				Tabela
			,	Index_name` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
