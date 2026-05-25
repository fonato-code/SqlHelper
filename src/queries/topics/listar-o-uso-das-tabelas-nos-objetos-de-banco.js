(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_listar_o_uso_das_tabelas_nos_objetos_de_banco = {
    id: "listar-o-uso-das-tabelas-nos-objetos-de-banco",
    title: "Listar o uso das tabelas nos objetos de banco",
    tags: [],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
            /*   OBSERVAÇÃO IMPORTANTE : sys.sql_expression_dependencies NÃO pega 
                [ SQL dinâmico, EXEC(@sql), strings concatenadas]
                
                UTILIZAR: 

                SELECT  o.type_desc,
                        s.name AS SchemaName,
                        o.name AS ObjectName,
                        m.definition
                FROM    sys.sql_modules m
                        JOIN sys.objects o
                            ON o.object_id = m.object_id
                        JOIN sys.schemas s
                            ON s.schema_id = o.schema_id
                WHERE   m.definition LIKE '%cinto%';
            */
            SELECT  s.name  AS SchemaName,
                    t.name  AS TableName,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM sys.sql_expression_dependencies d
                            WHERE d.referenced_id = t.object_id
                        )
                        THEN 'SIM'
                        ELSE 'NAO'
                    END AS IsUsed,
                    COUNT(DISTINCT o.object_id) AS TotalReferences
            FROM    sys.tables t
                    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
                    LEFT JOIN sys.sql_expression_dependencies d ON d.referenced_id = t.object_id
                    LEFT JOIN sys.objects o
                        ON o.object_id = d.referencing_id
                    AND o.type IN (
                            'P',    -- Procedure
                            'FN',   -- Scalar Function
                            'TF',   -- Table Function
                            'IF',   -- Inline Function
                            'TR',   -- Trigger
                            'V'     -- View
                    )
            GROUP BY
                s.name,
                t.name,
                t.object_id
            ORDER BY
                IsUsed,
                s.name,
                t.name;

            SELECT  s.name  AS TableSchema,
                    t.name  AS TableName,
                    so.type_desc AS ObjectType,
                    ss.name AS ObjectSchema,
                    so.name AS ObjectName
            FROM    sys.tables t
                    JOIN sys.schemas s
                        ON s.schema_id = t.schema_id
                    LEFT JOIN sys.sql_expression_dependencies d
                        ON d.referenced_id = t.object_id
                    LEFT JOIN sys.objects so
                        ON so.object_id = d.referencing_id
                    LEFT JOIN sys.schemas ss
                        ON ss.schema_id = so.schema_id
            WHERE   so.type IN (
                        'P',   -- Procedure
                        'FN',  -- Scalar Function
                        'TF',  -- Table Function
                        'IF',  -- Inline Function
                        'TR',  -- Trigger
                        'V'    -- View
                    )
            ORDER BY
                s.name,
                t.name,
                so.type_desc,
                so.name;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
