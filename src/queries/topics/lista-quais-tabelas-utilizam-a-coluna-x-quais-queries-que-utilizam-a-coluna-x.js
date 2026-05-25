(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_lista_quais_tabelas_utilizam_a_coluna_x_quais_queries_que_utilizam_a_coluna_x = {
    id: "lista-quais-tabelas-utilizam-a-coluna-x-quais-queries-que-utilizam-a-coluna-x",
    title: "Lista quais tabelas utilizam a coluna X ,quais queries que utilizam a coluna X",
    tags: [],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
            use tor_plus

            DECLARE @ColumnName SYSNAME = 'CD_CONCESSAO';
            DECLARE @CharsBefore INT = 10;
            DECLARE @CharsAfter  INT = 10;

            ----------------------------------------------------------
            SELECT  s.name AS TableSchema
                ,   t.name AS TableName
                ,   c.name AS ColumnName
                ,   ty.name AS [Type]
                ,   CASE
                        WHEN ty.name IN ('varchar','char','varbinary','binary')
                        THEN CASE 
                                WHEN c.max_length = -1 
                                THEN 'MAX'
                                ELSE CAST(c.max_length AS VARCHAR(10))
                            END
                        WHEN ty.name IN ('nvarchar','nchar')
                        THEN CASE
                                WHEN c.max_length = -1 THEN 'MAX'
                                ELSE CAST(c.max_length / 2 AS VARCHAR(10))
                            END
                        ELSE NULL
                    END AS [Length]
                ,   c.precision AS [Prec]
                ,   c.scale AS [Scale]
                ,   CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS Nullable
                ,   CASE WHEN c.is_identity = 1 THEN 'YES' ELSE 'NO' END AS IsIdentity
                ,   CASE WHEN pk.column_id IS NOT NULL THEN 'YES' ELSE 'NO' END AS IsPrimaryKey
                ,   CASE WHEN fk.parent_column_id IS NOT NULL THEN 'YES' ELSE 'NO' END AS IsForeignKey
                ,   fkinfo.FK_Name
                ,   fkinfo.ReferencedSchema
                ,   fkinfo.ReferencedTable
                ,   fkinfo.ReferencedColumn
            FROM    sys.tables t
                    JOIN sys.schemas s ON s.schema_id = t.schema_id
                    JOIN sys.columns c ON c.object_id = t.object_id
                    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
                    LEFT JOIN (
                        SELECT  ic.object_id
                            ,   ic.column_id
                        FROM    sys.index_columns ic
                                JOIN sys.key_constraints kc
                                    ON  kc.parent_object_id = ic.object_id
                                    AND kc.unique_index_id = ic.index_id
                                    AND kc.type = 'PK'
                    ) pk
                        ON  pk.object_id = c.object_id
                        AND pk.column_id = c.column_id
                    LEFT JOIN sys.foreign_key_columns fk
                        ON  fk.parent_object_id = c.object_id
                        AND fk.parent_column_id = c.column_id
                    LEFT JOIN (
                        SELECT  fkc.parent_object_id
                            ,   fkc.parent_column_id
                            ,   fk.name AS FK_Name
                            ,   rs.name AS ReferencedSchema
                            ,   rt.name AS ReferencedTable
                            ,   rc.name AS ReferencedColumn
                        FROM    sys.foreign_key_columns fkc
                                JOIN sys.foreign_keys fk ON fk.object_id = fkc.constraint_object_id
                                JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
                                JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
                                JOIN sys.columns rc 
                                    ON  rc.object_id = fkc.referenced_object_id
                                    AND rc.column_id = fkc.referenced_column_id
                    ) fkinfo
                        ON  fkinfo.parent_object_id = c.object_id
                        AND fkinfo.parent_column_id = c.column_id
            WHERE   c.name = @ColumnName
            ORDER BY    
                    IsPrimaryKey desc
                ,   [Type]
                ,   s.name
                ,   t.name;

            ----------------------------------------------------------
            SELECT  SCHEMA_NAME(o.schema_id) AS ObjectSchema
                ,   o.name AS ObjectName
                ,   o.type_desc AS ObjectType
            FROM    sys.objects o
                    JOIN sys.sql_modules m ON m.object_id = o.object_id
            WHERE   m.definition LIKE '%' + @ColumnName + '%'
            ORDER BY
                    ObjectSchema
                ,   ObjectName;

            ----------------------------------------------------------
            ;WITH ObjectsWithText AS (
                SELECT  o.object_id
                    ,   SCHEMA_NAME(o.schema_id) AS ObjectSchema
                    ,   o.name AS ObjectName
                    ,   o.type_desc AS ObjectType
                    ,   CAST(m.definition AS NVARCHAR(MAX)) AS DefinitionText
                FROM    sys.objects o
                        JOIN sys.sql_modules m
                            ON m.object_id = o.object_id
                WHERE   m.definition LIKE '%' + @ColumnName + '%'
            ),
            Occurrences AS (
                SELECT  object_id
                    ,   ObjectSchema
                    ,   ObjectName
                    ,   ObjectType
                    ,   DefinitionText
                    ,   CHARINDEX(@ColumnName, DefinitionText) AS PositionFound
                    ,   1 AS OccurrenceNumber
                FROM    ObjectsWithText
                WHERE   CHARINDEX(@ColumnName, DefinitionText) > 0
                UNION ALL
                SELECT  object_id
                    ,   ObjectSchema
                    ,   ObjectName
                    ,   ObjectType
                    ,   DefinitionText
                    ,   CHARINDEX(
                            @ColumnName,
                            DefinitionText,
                            PositionFound + LEN(@ColumnName)
                        ) AS PositionFound
                    ,   OccurrenceNumber + 1
                FROM    Occurrences
                WHERE   CHARINDEX( @ColumnName, DefinitionText, PositionFound + LEN(@ColumnName) ) > 0
            )
            SELECT  ObjectSchema
                ,   ObjectName
                ,   ObjectType
                ,   OccurrenceNumber
                ,   PositionFound
                ,   LEN( LEFT(DefinitionText, PositionFound))  - 
                        LEN(REPLACE(LEFT(DefinitionText, PositionFound),CHAR(10), '')) + 1 AS LineNumber
                ,   SUBSTRING(
                        DefinitionText,
                        CASE
                            WHEN PositionFound - @CharsBefore < 1
                            THEN 1
                            ELSE PositionFound - @CharsBefore
                        END,
                        @CharsBefore + LEN(@ColumnName) + @CharsAfter
                    ) AS TextPreview
            FROM    Occurrences
            ORDER BY
                    ObjectSchema
                ,   ObjectName
                ,   OccurrenceNumber
            OPTION (MAXRECURSION 0);` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
