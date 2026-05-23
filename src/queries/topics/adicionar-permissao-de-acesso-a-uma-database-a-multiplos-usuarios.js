(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_adicionar_permissao_de_acesso_a_uma_database_a_multiplos_usuarios = {
    id: "adicionar-permissao-de-acesso-a-uma-database-a-multiplos-usuarios",
    title: "Adicionar permissão de acesso a uma database a multiplos usuarios",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	USE TOR2_REV
	GO

	DECLARE @usuarios TABLE (UserName SYSNAME);
	INSERT INTO @usuarios VALUES
		('FadamiAcesso-TOR2'),
		('henrique.costa'),
		('lucas.bravo'),
		('Aurelio.Miguel');

	DECLARE @u SYSNAME, @sql NVARCHAR(MAX);

	DECLARE c CURSOR LOCAL FOR SELECT UserName FROM @usuarios;
	OPEN c;
	FETCH NEXT FROM c INTO @u;

	WHILE @@FETCH_STATUS = 0
	BEGIN
		PRINT 'Concedendo db_owner para: ' + @u + ' ...';

		SET @sql = '
			IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = ' + QUOTENAME(@u,'''') + ')
			CREATE USER ' + QUOTENAME(@u) + ' FOR LOGIN ' + QUOTENAME(@u) + ';
			EXEC sp_addrolemember N''db_owner'', ' + QUOTENAME(@u,'''') + ';
		';
		EXEC(@sql);

		FETCH NEXT FROM c INTO @u;
	END

	CLOSE c;
	DEALLOCATE c;
	GO` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
