-- colunas sem default
USE tor_plus;

DECLARE @ColumnName SYSNAME = 'cd_status';
DECLARE @default varchar(100) = 'getdate()';

SELECT
        s.name AS TableSchema,
        t.name AS TableName,
        c.name AS ColumnName,
        ty.name AS ColumnType,

        CASE 
            WHEN c.is_nullable = 1 THEN 'NULL'
            ELSE 'NOT NULL'
        END AS Nullable,

        dc.name AS DefaultConstraintName,
        dc.definition AS DefaultValue,

        -- Script sugerido para criar a DEFAULT
        'ALTER TABLE ' +
        QUOTENAME(s.name) + '.' + QUOTENAME(t.name) +
        ' ADD CONSTRAINT ' +
        QUOTENAME('Df_' + t.name + '__' + c.name) +
        ' DEFAULT ('+@default+') FOR ' +
        QUOTENAME(c.name) + ';'
        AS CreateDefaultScript

FROM    sys.tables t
        JOIN sys.schemas s
            ON s.schema_id = t.schema_id

        JOIN sys.columns c
            ON c.object_id = t.object_id

        JOIN sys.types ty
            ON ty.user_type_id = c.user_type_id

        LEFT JOIN sys.default_constraints dc
            ON  dc.parent_object_id = c.object_id
            AND dc.parent_column_id = c.column_id

WHERE   c.name = @ColumnName
    AND dc.object_id IS NULL

ORDER BY
        s.name,
        t.name;