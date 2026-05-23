(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_lista_bancos_que_possuem_a_tabela_x_tabela = {
    id: "lista-bancos-que-possuem-a-tabela-x-tabela",
    title: "Lista bancos que possuem a tabela X",
    tags: ["TABELA"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			DECLARE @Tabela NVARCHAR(300) = @@{string:dbo.ano:Tabela};

			DECLARE @SchemaName SYSNAME = PARSENAME(@Tabela, 2);
			DECLARE @TableName  SYSNAME = PARSENAME(@Tabela, 1);

			IF OBJECT_ID('tempdb..#Resultado') IS NOT NULL
				DROP TABLE #Resultado;

			CREATE TABLE #Resultado
			(
					DatabaseName SYSNAME
				,   SchemaName   SYSNAME
				,   TableName    SYSNAME
			);

			DECLARE @SQL NVARCHAR(MAX) = N'';
			SELECT @SQL = @SQL + '
			IF EXISTS
			(
				SELECT 1
				FROM    [' + name + '].sys.tables t
						INNER JOIN [' + name + '].sys.schemas s ON s.schema_id = t.schema_id
				WHERE   s.name = @SchemaName
						AND t.name = @TableName
			)
			BEGIN
				INSERT INTO #Resultado ( DatabaseName, SchemaName, TableName )
				VALUES ( ''' + name + ''', @SchemaName, @TableName );
			END;'
			FROM    sys.databases
			WHERE   state = 0 -- ONLINE
				AND database_id > 4; -- ignora bases de sistema

			EXEC sp_executesql
				@SQL,
				N'@SchemaName SYSNAME, @TableName SYSNAME',
				@SchemaName,
				@TableName;

			SELECT 'Select '''+DatabaseName+''', * from '+DatabaseName+'.'+SchemaName+'.'+TableName
			FROM #Resultado
			ORDER BY DatabaseName;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
