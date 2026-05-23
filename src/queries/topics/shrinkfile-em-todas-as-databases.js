(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_shrinkfile_em_todas_as_databases = {
    id: "shrinkfile-em-todas-as-databases",
    title: "shrinkfile em todas as databases",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	--  obs trocar o pipeline por quebra de linha na coluna de script 
	;with fs
	as
	(
	    select database_id, type, size * 8.0 / 1024 size, name
	    from sys.master_files
	), ds as(
		select 
			name,
			DataFileSizeMB ,
			LogFileSizeMB,
			name_log, 
			name_data
		from	sys.databases db
				cross apply(
					select	sum(size) 
						,	fs.name
					from	fs 
					where	type = 0 
						and fs.database_id = db.database_id
					group by name 
				) as ca1 (DataFileSizeMB, name_data)
				cross apply(
					select	sum(size) 
						,	fs.name
					from	fs 
					where	type = 1
						and fs.database_id = db.database_id
					group by name 
				) as ca2 (LogFileSizeMB, name_log)
		where	db.state <> 6
	) , fim as(
		select	name
			,	name_log
			,	name_data 
			,	DataFileSizeMB = convert(decimal(18,3), sum(DataFileSizeMB) )
			,	LogFileSizeMB  = convert(decimal(18,3), sum(LogFileSizeMB) )
		from	ds
		group by 
			name, 
			name_log, 
			name_data 
		with rollup
	)
	select	*, 
	'		|USE ['+NAME+']
		|ALTER DATABASE ['+NAME+']	SET RECOVERY SIMPLE
		|GO
		|DBCC SHRINKFILE (['+NAME_DATA+'], 1)
		|GO
		|DBCC SHRINKFILE (['+NAME_LOG+'], 1)
		|GO
		|PRINT(''['+NAME+'] FEITO'')
	'
	from	fim 
	where	(name_data is not null or (name_data is null and name is null))
	order by 4 desc` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
