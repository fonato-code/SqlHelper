(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_listar_tabelas_sem_primary_key = {
    id: "listar-tabelas-sem-primary-key",
    title: "Listar Tabelas Sem Primary Key",
    tags: [],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT  s.name AS SchemaName,
			t.name AS TableName,
			p.rows AS [RowCount],
			c.name
	FROM    sys.tables t
			JOIN sys.schemas s
				ON s.schema_id = t.schema_id
			LEFT JOIN sys.key_constraints pk
				ON pk.parent_object_id = t.object_id
			AND pk.type = 'PK'
			JOIN sys.partitions p
				ON p.object_id = t.object_id
			AND p.index_id IN (0,1)
			outer apply (
				select  * 
				from    sys.columns c 
				where   c.name  = 'CD_'+t.name
					and c.object_id = t.object_id
			) c
	WHERE   pk.object_id IS NULL
	ORDER BY
		4 desc, 
		p.rows DESC;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
