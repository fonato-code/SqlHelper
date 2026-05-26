/* SqlHelp — exportar esquema (colunas + índices) para projeção de crescimento.
   SSMS: Results to File ou copiar grid → salvar como .log (tab-delimitado). */
SELECT
    'COL' AS RecordType,
    s.name AS TableSchema,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS [Type],
    CASE
        WHEN c.max_length = -1 THEN 'MAX'
        WHEN ty.name IN ('nvarchar', 'nchar')
            THEN CAST(c.max_length / 2 AS VARCHAR(20))
        ELSE CAST(c.max_length AS VARCHAR(20))
    END AS [Length],
    CAST(c.precision AS VARCHAR(20)) AS [Prec],
    CAST(c.scale AS VARCHAR(20)) AS [Scale],
    CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS Nullable,
    CASE WHEN c.is_identity = 1 THEN 'YES' ELSE 'NO' END AS IsIdentity,
    '' AS IndexName,
    '' AS IndexType,
    '' AS KeyOrdinal,
    '' AS IsIncluded,
    '' AS IsPrimaryKey,
    '' AS IsUnique
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.is_ms_shipped = 0

UNION ALL

SELECT
    'IDX' AS RecordType,
    s.name AS TableSchema,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS [Type],
    CASE
        WHEN c.max_length = -1 THEN 'MAX'
        WHEN ty.name IN ('nvarchar', 'nchar')
            THEN CAST(c.max_length / 2 AS VARCHAR(20))
        ELSE CAST(c.max_length AS VARCHAR(20))
    END AS [Length],
    CAST(c.precision AS VARCHAR(20)) AS [Prec],
    CAST(c.scale AS VARCHAR(20)) AS [Scale],
    CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS Nullable,
    'NO' AS IsIdentity,
    i.name AS IndexName,
    CASE WHEN i.type = 1 THEN 'CLUSTERED' ELSE 'NONCLUSTERED' END AS IndexType,
    CAST(ic.key_ordinal AS VARCHAR(20)) AS KeyOrdinal,
    CASE WHEN ic.is_included_column = 1 THEN 'YES' ELSE 'NO' END AS IsIncluded,
    CASE WHEN i.is_primary_key = 1 THEN 'YES' ELSE 'NO' END AS IsPrimaryKey,
    CASE WHEN i.is_unique = 1 THEN 'YES' ELSE 'NO' END AS IsUnique
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = t.object_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.is_ms_shipped = 0
  AND i.type IN (1, 2)
  AND i.is_hypothetical = 0

ORDER BY
    TableSchema,
    TableName,
    RecordType,
    IndexName,
    KeyOrdinal,
    ColumnName;
