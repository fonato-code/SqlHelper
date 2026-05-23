(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_criar_usuario_de_banco_de_dados = {
    id: "criar-usuario-de-banco-de-dados",
    title: "Criar usuario de banco de dados",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	DECLARE @UserName NVARCHAR(100) = 'reginaldo.santos'
	DECLARE @Password NVARCHAR(100) = '123@mudar'

	/* Criando o login no servidor (se ainda não existir) */ 
	IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = @UserName)
	BEGIN
		DECLARE @SQL_USER NVARCHAR(MAX) =  'CREATE LOGIN ['+ @UserName +'] 
					WITH PASSWORD = ''' + @Password + ''' MUST_CHANGE, 
					CHECK_EXPIRATION = ON;'

			EXEC sp_executesql @SQL_USER
	END

	DECLARE @DatabaseName NVARCHAR(255);
	DECLARE @SQL NVARCHAR(MAX);

	/* Cursor para iterar sobre cada banco de dados e conceder permissões */
	DECLARE db_cursor CURSOR FOR
	SELECT name 
	FROM sys.databases 
	WHERE name IN (
			'TESTE'
	);

	OPEN db_cursor;
	FETCH NEXT FROM db_cursor INTO @DatabaseName;

	WHILE @@FETCH_STATUS = 0
	BEGIN
			SET @SQL = '
			USE [' + @DatabaseName + '];

			/* Criando o usuário no banco de dados, se não existir */
			IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = ''' + @UserName + ''')
			BEGIN
					CREATE USER [' + @UserName + '] FOR LOGIN [' + @UserName + '];
			END

			/* Concedendo permissões ao usuário*/
			ALTER ROLE db_datareader ADD MEMBER [' + @UserName + '];
			ALTER ROLE db_datawriter ADD MEMBER [' + @UserName + '];
			ALTER ROLE db_ddladmin ADD MEMBER [' + @UserName + '];
			';

			EXEC sp_executesql @SQL;
			
			FETCH NEXT FROM db_cursor INTO @DatabaseName;
	END

	CLOSE db_cursor;
	DEALLOCATE db_cursor;

	PRINT 'Usuário criado e permissões concedidas com sucesso!';` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
