(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_saude_dos_planos_de_execucao_agurpados_pelas_queires_do_banco_de_dados = {
    id: "saude-dos-planos-de-execucao-agurpados-pelas-queires-do-banco-de-dados",
    title: "Saude dos planos de execução agurpados pelas queires do banco de dados",
    tags: ["QUERIE"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	-- Analisar :
	-- Queries com uma média muito alta de IO
	-- queries com um tempo de trabalho muito alto retornando poucas linhas 
	DECLARE	@ExcelFormat BIT = 'false'
	DECLARE @TimeDelta varchar(100) = convert(decimal(19,12), iif(@ExcelFormat = 'true', 0.000011573883, 1))
	DECLARE	@type varchar(50) = 'TOTAL' -- total , min, max, last
	DECLARE @query varchar(max) = '
		SELECT	[Object] = OBJECT_NAME(qt.objectid, qt.[dbid])
			,	[Statement] = convert(varchar(60), ( 
					SELECT TOP 1 
						SUBSTRING(qt.text,statement_start_offset / 2+1 ,   
						((CASE	WHEN statement_end_offset = -1   
								THEN (LEN(CONVERT(nvarchar(max),qt.text)) * 2)   
								ELSE statement_end_offset 
							END)  
						- statement_start_offset) / 2+1)))
			,	[execution count] = execution_count
			,	[Plan generation num] = Plan_generation_num
			,	[Creation time] = convert(varchar(20), Creation_time, 120)
			,	[Last execution time] = convert(varchar(20), Last_execution_time, 120)
			,	[LifeTime (s)] = replace(convert(varchar(50),convert(decimal(19,12), DATEDIFF(second, Creation_time, Last_execution_time) * 0.000011573883)), ''.'','','')

			,	[worker time (s)] = replace(convert(varchar(50),convert(decimal(19,12), '+@type+'_worker_time / 1000000.0 * '+@TimeDelta+')), ''.'','','')
			,	[elapsed time (s)] = replace(convert(varchar(50),convert(decimal(19,12), '+@type+'_elapsed_time / 1000000.0 * '+@TimeDelta+')), ''.'','','')
			,	[clr time (s)] = replace(convert(varchar(50),convert(decimal(19,12), '+@type+'_clr_time / 1000000.0 * '+@TimeDelta+')), ''.'','','')

			,	[physical reads] = '+@type+'_physical_reads
			,	[num physical reads] = '+@type+'_num_physical_reads
			,	[logical writes] = '+@type+'_logical_writes
			,	[logical reads] = '+@type+'_logical_reads
			,	[page server reads] = '+@type+'_page_server_reads
			,	[num page server_reads] = '+@type+'_num_page_server_reads

			,	[rows] = '+@type+'_rows
			,	[dop] = '+@type+'_dop

			,	[grant kb] = '+@type+'_grant_kb
			,	[used grant kb] = '+@type+'_used_grant_kb
			,	[ideal grant kb] = '+@type+'_ideal_grant_kb
		
			,	[reserved threads] = '+@type+'_reserved_threads
			,	[used threads] = '+@type+'_used_threads
		
			,	[columnstore segment reads] = '+@type+'_columnstore_segment_reads
			,	[columnstore segment skips] = '+@type+'_columnstore_segment_skips
		
			,	[spills] = '+@type+'_spills
		FROM 	sys.dm_exec_query_stats AS qs
				CROSS APPLY sys.dm_exec_sql_text(qs.[sql_handle]) AS qt
		WHERE	qt.[dbid] = DB_ID()'
	
	print(@query)
	execute(@query)` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
