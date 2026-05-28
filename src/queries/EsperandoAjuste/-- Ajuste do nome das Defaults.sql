-- Ajuste do nome das Defaults
SELECT
        s.name AS TableSchema,
        t.name AS TableName,
        c.name AS ColumnName,
        dc.name AS CurrentDefaultConstraintName,
        dc.definition AS DefaultValue,

        s.name + '.Df_' + t.name + '__' + c.name AS NewDefaultConstraintName,

        CASE 
            WHEN dc.name = 'Df_' + t.name + '__' + c.name
            THEN '-- Já está no padrão'
            ELSE 
                'EXEC sp_rename ' +
                QUOTENAME(s.name + '.' + dc.name, '''') + ', ' +
                QUOTENAME('Df_' + t.name + '__' + c.name, '''') + ', ' +
                '''OBJECT'';'
        END AS RenameScript

FROM    sys.default_constraints dc
        JOIN sys.tables t
            ON t.object_id = dc.parent_object_id

        JOIN sys.schemas s
            ON s.schema_id = t.schema_id

        JOIN sys.columns c
            ON  c.object_id = dc.parent_object_id
            AND c.column_id = dc.parent_column_id

ORDER BY
5, 
        s.name,
        t.name,
        c.name;