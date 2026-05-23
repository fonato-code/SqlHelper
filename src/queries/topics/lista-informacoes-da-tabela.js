(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_lista_informacoes_da_tabela = {
    id: "lista-informacoes-da-tabela",
    title: "Lista Informações da tabela",
    tags: [],
    blocks: [
      { type: 'sql', title: `Query`, sql: `use TOR_CRB_REV 

declare @teste  varchar(100)= 'dbo.GRAVIDADE'


DECLARE @Schema SYSNAME;
DECLARE @Tabela SYSNAME;


SET @Schema = PARSENAME(@teste, 2);
SET @Tabela = PARSENAME(@teste, 1);

-------------------------------------------------------
-- SELECT *
-------------------------------------------------------

DECLARE @SQL NVARCHAR(MAX);

SET @SQL = '
SELECT * 
FROM ' + QUOTENAME(@Schema) + '.' + QUOTENAME(@Tabela);

EXEC sp_executesql @SQL;
-------------------------------------------------------
-- Procedures que usam a tabela
-------------------------------------------------------

SELECT DISTINCT
    s.name AS SchemaName,
    o.name AS ProcedureName
FROM sys.sql_modules m
INNER JOIN sys.objects o 
    ON m.object_id = o.object_id
INNER JOIN sys.schemas s
    ON o.schema_id = s.schema_id
WHERE (
        m.definition LIKE '%' + @Tabela + '%'
        OR m.definition LIKE '%' + @Schema + '.' + @Tabela + '%'
      )
AND o.type = 'P'
ORDER BY 1,2;



-------------------------------------------------------
-- 3. Descobre a coluna PK da tabela informada
-------------------------------------------------------

DECLARE @ColunaPK SYSNAME;

SELECT TOP 1
    @ColunaPK = c.name
FROM sys.key_constraints kc
INNER JOIN sys.index_columns ic
    ON kc.parent_object_id = ic.object_id
    AND kc.unique_index_id = ic.index_id
INNER JOIN sys.columns c
    ON ic.object_id = c.object_id
    AND ic.column_id = c.column_id
INNER JOIN sys.tables t
    ON kc.parent_object_id = t.object_id
INNER JOIN sys.schemas s
    ON t.schema_id = s.schema_id
WHERE kc.type = 'PK'
AND s.name = @Schema
AND t.name = @Tabela
ORDER BY ic.key_ordinal;

-------------------------------------------------------
-- 4. Tabelas que possuem coluna com o mesmo nome da PK
-------------------------------------------------------

SELECT 
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM sys.tables t
INNER JOIN sys.schemas s
    ON t.schema_id = s.schema_id
INNER JOIN sys.columns c
    ON t.object_id = c.object_id
WHERE c.name = @ColunaPK
AND NOT (
    s.name = @Schema 
    AND t.name = @Tabela
)
ORDER BY s.name, t.name;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
