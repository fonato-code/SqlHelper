(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_deadlock = {
    id: "deadlock",
    title: "deadlock",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT
		r.session_id,
		s.text AS sql_text,
		l.resource_type,
		DB_NAME(l.resource_database_id) AS database_name,
		l.resource_associated_entity_id,
		l.request_mode,
		r.status,
		r.blocking_session_id,

		-- Quando o comando atual começou
		r.start_time AS request_start_time,

		-- Quando a transação (da sessão) começou: pode haver múltiplas;
		-- pegamos a mais antiga para essa session_id
		tr.transaction_begin_time,

		-- Melhor estimativa de "desde quando o lock existe" para quem SEGURA o lock:
		-- o mais antigo entre início da transação e início do comando
		CASE
			WHEN tr.transaction_begin_time IS NOT NULL AND r.start_time IS NOT NULL
				THEN CASE WHEN tr.transaction_begin_time < r.start_time
						THEN tr.transaction_begin_time ELSE r.start_time END
			ELSE COALESCE(tr.transaction_begin_time, r.start_time)
		END AS lock_since_estimate,

		-- Para quem ESTÁ ESPERANDO por lock: desde quando está esperando
		wt.wait_duration_ms,
		CASE
			WHEN wt.wait_duration_ms IS NOT NULL
				THEN DATEADD(ms, -wt.wait_duration_ms, SYSDATETIME())
		END AS waiting_since

	FROM sys.dm_exec_requests AS r
	JOIN sys.dm_tran_locks AS l
	ON r.session_id = l.request_session_id
	CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) AS s

	-- Pega a transação mais antiga da sessão (se existir)
	OUTER APPLY (
		SELECT MIN(at.transaction_begin_time) AS transaction_begin_time
		FROM sys.dm_tran_session_transactions AS st
		JOIN sys.dm_tran_active_transactions  AS at
		ON at.transaction_id = st.transaction_id
		WHERE st.session_id = r.session_id
	) AS tr

	-- Se a sessão estiver esperando por lock, traz há quanto tempo
	LEFT JOIN sys.dm_os_waiting_tasks AS wt
	ON wt.session_id = r.session_id
	AND wt.wait_type LIKE 'LCK%'

	ORDER BY r.session_id;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
