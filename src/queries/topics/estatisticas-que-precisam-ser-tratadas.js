(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_estatisticas_que_precisam_ser_tratadas = {
    id: "estatisticas-que-precisam-ser-tratadas",
    title: "Estatisticas que precisam ser tratadas",
    tags: ["ESTATISTICAS"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			DECLARE @Threshold int = 1000; -- mínimo de linhas alteradas desde a última atualização
			SELECT
				[LastUpdate] = sp.last_updated,
				[Schema]     = SCHEMA_NAME(o.schema_id),
				[Table]      = o.name,
				[Statistic]  = s.name,
				[Rows]       = sp.rows,
				[RowsSampled]= sp.rows_sampled,
				[ModCounter] = sp.modification_counter,
				[UpdateCmd]  = 'UPDATE STATISTICS '
							+ QUOTENAME(SCHEMA_NAME(o.schema_id)) + '.' + QUOTENAME(o.name)
							+ ' ' + QUOTENAME(s.name) + ' WITH FULLSCAN;'
			FROM	sys.stats AS s
					JOIN sys.objects AS o
						ON o.object_id = s.object_id
					CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) AS sp
			WHERE	o.type = 'U'                 -- apenas tabelas de usuário
				AND o.is_ms_shipped = 0          -- exclui objetos do sistema
				AND sp.modification_counter > @Threshold
				AND LEFT(o.name, 3) NOT IN ('sys','dtp')  -- mantém seu filtro
				AND LEFT(o.name, 1) <> '_'        -- se vocês usam "_" p/ tabelas temporárias/stage
			ORDER BY sp.modification_counter DESC;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
