-- estimativa de row_size_Potential

;WITH ColumnInfo AS (
    SELECT
            s.name AS SchemaName,
            t.name AS TableName,
            c.column_id,
            c.name AS ColumnName,
            ty.name AS TypeName,
            c.max_length,
            c.precision,
            c.scale,
            c.is_nullable,

            CASE
                -- FIXOS
                WHEN ty.name = 'tinyint'      THEN 1
                WHEN ty.name = 'smallint'     THEN 2
                WHEN ty.name = 'int'          THEN 4
                WHEN ty.name = 'bigint'       THEN 8
                WHEN ty.name = 'bit'          THEN 1
                WHEN ty.name = 'date'         THEN 3
                WHEN ty.name = 'smalldatetime' THEN 4
                WHEN ty.name = 'datetime'     THEN 8
                WHEN ty.name = 'datetime2'    THEN 8
                WHEN ty.name = 'uniqueidentifier' THEN 16
                WHEN ty.name = 'float'        THEN 8
                WHEN ty.name = 'real'         THEN 4
                WHEN ty.name = 'money'        THEN 8
                WHEN ty.name = 'smallmoney'   THEN 4

                -- VARCHAR/NVARCHAR
                WHEN ty.name IN ('varchar','char')
                    THEN CASE
                            WHEN c.max_length = -1 THEN 8000
                            ELSE c.max_length
                         END + 2

                WHEN ty.name IN ('nvarchar','nchar')
                    THEN CASE
                            WHEN c.max_length = -1 THEN 8000
                            ELSE c.max_length
                         END + 2

                -- VARBINARY
                WHEN ty.name IN ('varbinary','binary')
                    THEN CASE
                            WHEN c.max_length = -1 THEN 8000
                            ELSE c.max_length
                         END + 2

                ELSE 16
            END AS EstimatedColumnBytes,

            CASE
                WHEN c.max_length = -1 THEN 1
                ELSE 0
            END AS IsMaxColumn

    FROM sys.tables t
    JOIN sys.schemas s
        ON s.schema_id = t.schema_id
    JOIN sys.columns c
        ON c.object_id = t.object_id
    JOIN sys.types ty
        ON ty.user_type_id = c.user_type_id
)

SELECT
        SchemaName,
        TableName,

        COUNT(*) AS ColumnCount,

        SUM(EstimatedColumnBytes) AS EstimatedMaxRowBytes,

        CAST(
            SUM(EstimatedColumnBytes) / 8096.0
            AS DECIMAL(18,2)
        ) AS EstimatedPagesPerRow,

        SUM(IsMaxColumn) AS MaxColumns,

        CASE
            WHEN SUM(EstimatedColumnBytes) > 8060
            THEN 'YES'
            ELSE ''
        END AS PossibleRowOverflow,

        CASE
            WHEN SUM(IsMaxColumn) > 0
            THEN 'YES'
            ELSE ''
        END AS HasLOBPotential

FROM ColumnInfo
GROUP BY
        SchemaName,
        TableName

ORDER BY
        EstimatedMaxRowBytes DESC;