(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_quantidade_de_deadlocks_desde_o_inicio_do_banco = {
    id: "quantidade-de-deadlocks-desde-o-inicio-do-banco",
    title: "Quantidade de deadlocks desde o inicio do banco",
    tags: ["DEADLOCK"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT	' '  = 'Deadlocks Occurrences Report'
		,	AveragePerDay = CONVERT(BIGINT,((1.0 * p.cntr_value / 
				NULLIF(datediff(DD,d.create_date,CURRENT_TIMESTAMP),0))))
		,	Details = CAST(p.cntr_value AS NVARCHAR(100)) + ' deadlocks have been recorded since startup.'
		,	StartupDateTime = d.create_date 
	FROM	sys.dm_os_performance_counters p
			INNER JOIN sys.databases d ON d.name = 'tempdb'
	WHERE	RTRIM(p.counter_name) = 'Number of Deadlocks/sec'
		AND RTRIM(p.instance_name) = '_Total'` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
