(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_listagem_de_sessions_atual = {
    id: "listagem-de-sessions-atual",
    title: "Listagem de Sessions Atual",
    tags: ["SESSION"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			SELECT	S.SESSION_ID AS [SPID]
				,	S.HOST_NAME
				,	S.PROGRAM_NAME
				,	S.HOST_PROCESS_ID AS [PID]
				,	T.OS_THREAD_ID AS [SO_THREAD]
				,	RE.BLOCKING_SESSION_ID [BLOCKED BY]
				,	RE.WAIT_TYPE 
				,	RE.TOTAL_ELAPSED_TIME / (1000.0) [TEMPO(SS)] 
				,	COALESCE(QUOTENAME(DB_NAME(ST.DBID)) + N'.' 
					+ QUOTENAME(OBJECT_SCHEMA_NAME(ST.OBJECTID,ST.DBID)) + N'.' 
					+ QUOTENAME(OBJECT_NAME(ST.OBJECTID,ST.DBID)),'') AS [COMMAND_TEXT]
				,	RE.COMMAND
				,	SUBSTRING(ST.TEXT,(RE.STATEMENT_START_OFFSET / 2) + 1,( ( 
						CASE RE.STATEMENT_END_OFFSET 
							WHEN - 1 THEN DATALENGTH(ST.TEXT) 
							ELSE RE.STATEMENT_END_OFFSET 
						END - RE.STATEMENT_START_OFFSET ) / 2 ) + 1) AS [STATEMENT_TEXT]
				,	ST.[TEXT]         AS [COMPLETE QUERY TEXT]
				,	QP.QUERY_PLAN     AS [QUERY_PLAN]
			FROM	SYS.DM_EXEC_SESSIONS AS S
					JOIN SYS.DM_EXEC_REQUESTS AS RE	ON S.SESSION_ID = RE.SESSION_ID
					JOIN SYS.DM_OS_WORKERS AS W ON RE.TASK_ADDRESS = W.TASK_ADDRESS
					JOIN SYS.DM_OS_THREADS AS T ON W.THREAD_ADDRESS = T.THREAD_ADDRESS 
					CROSS APPLY SYS.DM_EXEC_SQL_TEXT(RE.SQL_HANDLE) ST 
					CROSS APPLY SYS.DM_EXEC_QUERY_PLAN(PLAN_HANDLE) AS QP
			WHERE	S.SESSION_ID >51
			ORDER BY 
				8 DESC` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
