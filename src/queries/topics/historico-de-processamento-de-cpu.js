(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_historico_de_processamento_de_cpu = {
    id: "historico-de-processamento-de-cpu",
    title: "Historico de processamento de CPU",
    tags: ["CPU"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	select
			id
		,	SQLServerCPUUtilization
		,	100 - SystemIdle - SQLServerCPUUtilization as NonSQLCPUUtilization
		,	SystemIdle
		,	record
	from (
		select	record
			,	id = record.value('(./Record/@id)[1]', 'int')
			,	SystemIdle = record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int')
			,	SQLServerCPUUtilization = record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int')
			,	timestamp
	    from	(
				select	timestamp
					,	record = convert(xml, record)
				from	sys.dm_os_ring_buffers
				where	ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
					and record like '%<SystemHealth>%'
		) as RingBufferInfo
	) AS TabularInfo
	order by id desc

	DECLARE @gc VARCHAR(MAX), @gi VARCHAR(MAX);

	WITH BR_Data as (
		SELECT	timestamp
			,	record = CONVERT(XML, record)
		FROM	sys.dm_os_ring_buffers
		WHERE	ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR' 
			and record like '%<SystemHealth>%'
	), Extracted_XML as (
		SELECT	timestamp
			,	record_id = record.value('(./Record/@id)[1]', 'int')
			,	SystemIdle = record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'bigint')
			,	SQLCPU = record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'bigint')
		FROM	BR_Data
	), CPU_Data as (
		SELECT	record_id
			,	rn = ROW_NUMBER() OVER(ORDER BY record_id)
			,	EventTime = dateadd(ms, -1 * ((SELECT ms_ticks  FROM sys.dm_os_sys_info) - [timestamp]), GETDATE())
			,	SQLCPU
			,	SystemIdle
			,	OtherCPU = 100 - SystemIdle - SQLCPU
		FROM	Extracted_XML
	)
	SELECT	@gc = CAST((
				SELECT  CAST(d1.rn as VARCHAR) + ' ' + CAST(d1.SQLCPU as VARCHAR) + ',' 
				FROM	CPU_Data as d1 
				ORDER BY d1.rn 
				FOR XML PATH('')) as VARCHAR(MAX))
		,	@gi = CAST((
				SELECT  CAST(d1.rn as VARCHAR) + ' ' + CAST(d1.OtherCPU as VARCHAR) + ',' 
				FROM	CPU_Data as d1 
				ORDER BY d1.rn 
				FOR XML PATH('')) as VARCHAR(MAX))
	OPTION (RECOMPILE);

	SELECT CAST('LINESTRING(' + LEFT(@gc,LEN(@gc)-1) + ')' as GEOMETRY), 'SQL CPU %' as Measure
	UNION ALL
	SELECT CAST('LINESTRING(1 100,2 100)' as GEOMETRY), ''
	UNION ALL
	SELECT CAST('LINESTRING(' + LEFT(@gi,LEN(@gi)-1) + ')' as GEOMETRY), 'Other CPU %';` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
