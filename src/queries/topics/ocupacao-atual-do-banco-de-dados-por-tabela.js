(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_ocupacao_atual_do_banco_de_dados_por_tabela = {
    id: "ocupacao-atual-do-banco-de-dados-por-tabela",
    title: "Ocupação Atual do banco de dados por Tabela",
    tags: ["TABELA"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	select	object_id
		,	SchemaName
		,	TableName =  name	
		,	[rows]			
		,	[data_pages]	
		,	[index_pages]	
		,	[total_pages]		= [index_pages] + [data_pages]
		,	[data_size kb]		
		,	[index_size kb]	
		,	[total_size kb]		= [data_size kb] + [index_size kb]
		,	[reserved kb]	
		,	[unused kb]		
		,	[db_size gb]		= convert(decimal(5,2), db_size /1024.0 /1024.0)
	-- from (
		select	o.object_id
			,	SchemaName      = SCHEMA_NAME(t.schema_id)
			,	o.name			
			,	[rows]			=	case when t.is_memory_optimized = 1 then ca.[rowCount] else o.[rowCount] end 	
			,	[data_pages]	=	o.pages
			,	[index_pages]	=	(CASE WHEN usedpages > pages THEN (usedpages - pages) ELSE 0 END)
			,	[reserved kb]	=	o.reservedpages	* 8
			,	[data_size kb]	=	o.pages	* 8	
			,	[index_size kb]	=	(CASE WHEN usedpages > pages THEN (usedpages - pages) ELSE 0 END) * 8
			,	[unused kb]		=	(CASE WHEN reservedpages > usedpages THEN (reservedpages - usedpages) ELSE 0 END) * 8
			,	db_size
		from	(
			SELECT	o.object_id
				,	name			= object_name(o.object_id)
				,	reservedpages	= SUM( cast(p.reserved_page_count as bigint) )
				,	usedpages		= SUM( cast(p.used_page_count as bigint))
				,	pages			= SUM(	cast(CASE WHEN (p.index_id < 2) THEN (p.in_row_data_page_count + p.lob_used_page_count + p.row_overflow_used_page_count) ELSE 0 END as bigint) )
				,	[rowCount]		= SUM( cast(CASE WHEN (p.index_id < 2) THEN p.row_count ELSE 0 END  as bigint))
			FROM	sys.objects  o 
					inner join sys.dm_db_partition_stats p on p.object_id =  o.object_id
			where	type = 'U '
			group by 
				o.object_id
		) as o 
		inner join sys.tables t on t.object_id = o.object_id
		outer apply(
			SELECT	[rowCount] = SUM (pt.rows) 
				FROM	sys.partitions pt
				WHERE	index_id IN (0,1,5) 
					AND pt.object_id = o.object_id
		) as ca 
		cross apply (
			SELECT SUM(CONVERT(BIGINT,CASE WHEN STATUS & 64 = 0 THEN SIZE ELSE 0 END)) * 8 FROM DBO.SYSFILES
		) as db (db_size)
	) as ca
	order by 
			[total_size kb] desc` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
