SELECT
    s.name AS TableSchema,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS [Type],

    CASE
        WHEN c.max_length = -1 THEN 'MAX'
        WHEN ty.name IN ('nvarchar','nchar')
            THEN CAST(c.max_length / 2 AS VARCHAR)
        ELSE CAST(c.max_length AS VARCHAR)
    END AS [Length],

    c.precision AS [Prec],
    c.scale AS [Scale],

    CASE WHEN c.is_nullable = 1
        THEN 'YES'
        ELSE 'NO'
    END AS Nullable,

    CASE WHEN c.is_identity = 1
        THEN 'YES'
        ELSE 'NO'
    END AS IsIdentity

FROM sys.tables t
JOIN sys.schemas s
    ON s.schema_id = t.schema_id
JOIN sys.columns c
    ON c.object_id = t.object_id
JOIN sys.types ty
    ON ty.user_type_id = c.user_type_id

ORDER BY
    s.name,
    t.name,
    c.column_id;