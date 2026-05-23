(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_saude_das_procedures_do_banco_de_dados = {
    id: "saude-das-procedures-do-banco-de-dados",
    title: "Saude das procedures do banco de dados",
    tags: ["PROCEDURE"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT	OBJECT_NAME(OBJECT_ID)
		,	* 
	FROM	SYS.dm_exec_procedure_stats   
	where	database_id = DB_ID()		
	ORDER BY
		[total_worker_time] DESC;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
