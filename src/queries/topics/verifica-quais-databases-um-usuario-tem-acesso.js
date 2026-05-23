(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_verifica_quais_databases_um_usuario_tem_acesso = {
    id: "verifica-quais-databases-um-usuario-tem-acesso",
    title: "Verifica quais databases um usuário tem acesso",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	DECLARE @LoginName NVARCHAR(100) = 'pedro.lucena';

	-- Tabela temporária para armazenar os bancos acessíveis
	CREATE TABLE #Databases (DatabaseName NVARCHAR(255));

	DECLARE @DBName NVARCHAR(255);
	DECLARE db_cursor CURSOR FOR 
	SELECT name FROM sys.databases WHERE state_desc = 'ONLINE';

	OPEN db_cursor;
	FETCH NEXT FROM db_cursor INTO @DBName;

	WHILE @@FETCH_STATUS = 0
	BEGIN
			DECLARE @SQL NVARCHAR(MAX);
			SET @SQL = 'USE [' + @DBName + '];
									IF EXISTS (
											SELECT 1 FROM sys.database_principals dp
											JOIN sys.database_role_members drm ON dp.principal_id = drm.member_principal_id
											WHERE dp.name = ''' + @LoginName + '''
											OR EXISTS (
													SELECT 1 FROM sys.database_principals WHERE name = ''' + @LoginName + '''
											)
									) 
									INSERT INTO #Databases VALUES (''' + @DBName + ''')';
			
			EXEC sp_executesql @SQL;
			FETCH NEXT FROM db_cursor INTO @DBName;
	END;

	CLOSE db_cursor;
	DEALLOCATE db_cursor;

	-- Exibir os bancos acessíveis
	SELECT * FROM #Databases;

	-- Limpar tabela temporária
	DROP TABLE #Databases;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
