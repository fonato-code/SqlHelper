(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_analise_de_indice = {
    id: "analise-de-indice",
    title: "Analise de Indice",
    tags: [],
    blocks: [
      { type: 'md', content: `Para analisar os indices em relação a performance precisamos validar se os indices são realmente utilizados,  se existem somente para pesar nos updates, se exitem indices duplicados desnecessarios que pesam em update .

## Analise completa dos indices` },
      { type: 'sql', title: `Analise completa dos indices`, sql: `;with cte as  (
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

		,	SizeKB = SUM(S.[USED_PAGE_COUNT]) * 8
		,	Pages = SUM(S.[USED_PAGE_COUNT])
		,	i.object_id
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
	where	t.type= 'U'
	group by 
			t.schema_id
		,	t.name
		,	t.[object_id]
		,	i.[name] 
		,	i.object_id
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
	

)

select  Index_to_Check = 
        case 
			when c.Description  like '%Cluestered%'
				or c.Description  like '%unique%'
				or c.Description  like '%primary key%'
				or c.Description  like '%ignore duplicate keys%'
			then null
            when Total_User_Reads = 0 and p.updates > 0 then 'Pode ser excluido só serve para gerar updates'
            when PercentUse < 0.5 then 'indice custoso em updates para pouca leitura'  
            when Total_User_Reads = p.updates and p.updates > 0 then 'O indice esta sendo utilizado somente para atualizar ele proprio'
        end
	,	p.PercentUse
    ,   c.SchemaName
	,	p.TableName
	,	c.IndexName
	,	p.Total_User_Reads
	,	p.updates
	,	c.SizeKB
	,	c.Pages
	,   p.last_user_update
	,   p.user_seeks 
	,   p.last_user_seek
	,   p.user_scans 
	,   p.last_user_scan
	,   p.user_lookups
	,   p.last_user_lookup
	,	c.ColumnsName
	,	c.ColumnsIncludesName
	,	c.Filter
	,	c.[FillFactor]
	,	c.Description

from    (
    SELECT  i.object_id
		,	TableName = OBJECT_NAME(i.object_id)
        ,   IndexName = i.name
        ,   Total_User_Reads = user_seeks + user_scans + user_lookups
        ,   updates = user_updates
        ,   s.last_user_update
        ,   user_seeks 
        ,   s.last_user_seek
        ,   user_scans 
        ,   s.last_user_scan
        ,   user_lookups
        ,   s.last_user_lookup
        ,   i.type_desc
        ,   PercentUse = case 
                when (user_seeks + user_scans + user_lookups) = 0 then ((user_seeks + user_scans + user_lookups) + 1.0) / ( s.user_updates +1.0)
                when s.user_updates = 0 then ((user_seeks + user_scans + user_lookups) * 1.0)
                else (user_seeks + user_scans + user_lookups) * 1.0 / s.user_updates 
            end
    FROM    sys.dm_db_index_usage_stats s
            JOIN sys.indexes i 
                ON  i.object_id = s.object_id 
                AND i.index_id = s.index_id
    WHERE   database_id = DB_ID()
) p 
left join cte c on p.object_id = c.object_id and p.IndexName = c.IndexName 
ORDER BY
    p.TableName ASC, 
	PercentUse ASC;` },
      { type: 'md', content: `## Querie que retorna indices que tem exatamente a mesma quantidade de Leituras e updates

Por quê isso acontece? O que conta como user_update
	* INSERT na tabela
	* DELETE na tabela
	* UPDATE em coluna indexada
Toda vez que isso ocorre, o índice precisa ser atualizado` },
      { type: 'sql', title: `Query`, sql: `	SELECT
		OBJECT_NAME(i.object_id) AS tabela,
		i.name AS indice,
		s.user_seeks,
		s.user_scans,
		s.user_lookups,
		s.user_updates,
		(s.user_seeks + s.user_scans + s.user_lookups) AS total_reads
	FROM sys.indexes i
	JOIN sys.dm_db_index_usage_stats s
		ON s.object_id = i.object_id
	AND s.index_id = i.index_id
	WHERE
		database_id = DB_ID()
		AND (s.user_seeks + s.user_scans + s.user_lookups) = s.user_updates
		AND s.user_updates > 0
		AND i.is_primary_key = 0
		AND i.is_unique = 0;` },
      { type: 'md', content: `### Log parser  - querie para ler a media de tempo gasto nas requests` },
      { type: 'sql', title: `Query 2`, sql: `SELECT 
    c-ip AS IP_Origem,
    TO_UPPERCASE(EXTRACT_TOKEN(cs-uri-stem, 1, '/')) AS Aplicacao,
    cs-uri-stem,
    COUNT(*) AS Total_Requisicoes,
    AVG(time-taken) AS Tempo_Medio_ms,
    Max(time-taken) AS Tempo_Maximmo_ms,
    min(time-taken) AS Tempo_Minimo_ms
FROM 
   '[LOGFILEPATH]'
where TO_UPPERCASE(EXTRACT_TOKEN(cs-uri-stem, 1, '/')) = 'TOR_EPR_PARANA'
and c-ip = '200.195.141.246'
GROUP BY 
    c-ip,
    TO_UPPERCASE(EXTRACT_TOKEN(cs-uri-stem, 1, '/')),
cs-uri-stem
having COUNT(*) > 20
ORDER BY 
c-ip, 
    Tempo_Medio_ms DESC` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
