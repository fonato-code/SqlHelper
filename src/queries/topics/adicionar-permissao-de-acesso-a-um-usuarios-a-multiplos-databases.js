(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_adicionar_permissao_de_acesso_a_um_usuarios_a_multiplos_databases = {
    id: "adicionar-permissao-de-acesso-a-um-usuarios-a-multiplos-databases",
    title: "Adicionar permissão de acesso a um usuarios a multiplos databases",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `use master 
go
DECLARE @Login SYSNAME = N'irio.oliveira';

DECLARE @Bancos TABLE (Nome SYSNAME NOT NULL PRIMARY KEY);
INSERT INTO @Bancos (Nome)
VALUES
(N'TOR2_DEV'),
(N'TOR_CART_DEV');  -- <-- adicione/remova aqui

DECLARE @Db SYSNAME, @Sql NVARCHAR(MAX);

DECLARE cur CURSOR FAST_FORWARD FOR
SELECT Nome FROM @Bancos;

OPEN cur;
FETCH NEXT FROM cur INTO @Db;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Sql = N'
    USE ' + QUOTENAME(@Db) + N';

    IF NOT EXISTS (
        SELECT 1
        FROM sys.database_principals
        WHERE name = @Login
    )
    BEGIN
        CREATE USER ' + QUOTENAME(@Login) + N' FOR LOGIN ' + QUOTENAME(@Login) + N';
    END

    -- Permissões (ajuste aqui)
    ALTER ROLE db_datareader ADD MEMBER ' + QUOTENAME(@Login) + N';
    ALTER ROLE db_datawriter ADD MEMBER ' + QUOTENAME(@Login) + N';
    ';

    EXEC sys.sp_executesql @Sql, N'@Login sysname', @Login = @Login;

    FETCH NEXT FROM cur INTO @Db;
END

CLOSE cur;
DEALLOCATE cur;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
