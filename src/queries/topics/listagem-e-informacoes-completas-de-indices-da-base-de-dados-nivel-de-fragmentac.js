(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_listagem_e_informacoes_completas_de_indices_da_base_de_dados_nivel_de_fragmentac = {
    id: "listagem-e-informacoes-completas-de-indices-da-base-de-dados-nivel-de-fragmentac",
    title: "Listagem e Informações Completas de Indices da base de dados + Nivel de Fragmentação",
    tags: ["INDICE"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `------------------------------------------------------------------------------------------------------------------------
	SELECT	SchemaName =  SCHEMA_NAME(t.schema_id)
		,	TableName = t.name
		,	IndexName = i.[name] 
		,	ColumnsName = LEFT(ColumnsName , LEN(ColumnsName)-1)
		,	ColumnsIncludesName = LEFT(ColumnsIncludesName , LEN(ColumnsIncludesName)-1)
		,	[Filter] = i.filter_definition
		,	[FillFactor] = convert(decimal(9,2), i.fill_factor /100.0)
		,	[Description] = convert(varchar(210),
				  iif(i.index_id = 1,  'clustered' , 'nonclustered' )
				+ iif(iif(i.type = 7, 1,0) = 1,  ' hash' , '' )
				+ iif(ignore_dup_key <>0,  ', ignore duplicate keys' , '' )
				+ iif(is_unique <>0,  ', unique' , '' )
				+ iif(is_hypothetical <>0,  ', hypothetical' , '' )
				+ iif(is_primary_key <>0,  ', primary key' , '' )
				+ iif(is_unique_constraint <> 0,  ', unique key' , '' )
				+ iif(iif(i.type = 5 or i.type = 6, 1 , 0) <> 0,  ', columnstore' , '' )
				+ iif(iif(i.type = 5 or i.type = 6, 0,ss.auto_created) <> 0,  ', auto create' , '' )
				+ iif(iif(i.type = 5 or i.type = 6, 0,ss.no_recompute) <> 0,  ', stats no recompute' , '' )
			)
		,	Fragmentation = convert(decimal(9,4), avg_fragmentation_in_percent  /100.0)
		,	SizeKB = SUM(S.[USED_PAGE_COUNT]) * 8
		,	Pages = SUM(S.[USED_PAGE_COUNT])
	FROM	sys.indexes i
			left join sys.stats ss
				on	i.object_id = ss.object_id 
				and i.index_id = ss.stats_id
			inner join sys.tables t on i.[object_id] = t.[object_id]
			cross apply (
				SELECT	c.[name] + ','
				FROM	sys.index_columns ic
						JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
				WHERE	ic.object_id = i.object_id 
					and i.index_id = ic.index_id
					and ic.is_included_column = 0
				FOR XML PATH('')
			) as c (ColumnsName)
			cross apply (
				SELECT	c.[name] + ','
				FROM	sys.index_columns ic
						JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
				WHERE	ic.object_id = i.object_id 
					and i.index_id = ic.index_id
					and ic.is_included_column = 1
				FOR XML PATH('')
			) as ci (ColumnsIncludesName)
			inner join SYS.DM_DB_PARTITION_STATS AS S
					ON 	S.[OBJECT_ID] = I.[OBJECT_ID]
		    		AND S.[INDEX_ID] = I.[INDEX_ID]
			INNER JOIN sys.dm_db_index_physical_stats (db_id(), null, null, null, null) ps
					ON I.object_id = ps.object_id and i.index_id = ps.index_id
	where	t.type= 'U'
	group by 
			t.schema_id
		,	t.name
		,	t.[object_id]
		,	i.[name] 
		,	ColumnsName 
		,	ColumnsIncludesName 
		,	i.index_id
		,	i.type_desc
		,	i.is_unique
		,	i.fill_factor
		,	i.data_space_id
		,	i.ignore_dup_key
		,	i.is_primary_key
		,	i.filter_definition
		,	i.is_unique_constraint
		,	i.is_hypothetical
		,	ss.auto_created
		,	i.type
		,	ss.no_recompute
		,	avg_fragmentation_in_percent
	ORDER BY  
			tableName
		,	[Description]
		,	SIZEKB DESC` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
