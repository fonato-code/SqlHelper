(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_listar_tabelas_sem_identity = {
    id: "listar-tabelas-sem-identity",
    title: "Listar tabelas sem Identity",
    tags: [],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
            SELECT  s.name AS SchemaName,
                    t.name AS TableName,
                    COUNT(c.column_id) AS ColumnCount,
                    p.rows AS [RowCount],
                    cc.name,
                    cc.tipo,
                    cc.Nullable
            FROM    sys.tables t
                    JOIN sys.schemas s
                        ON s.schema_id = t.schema_id
                    JOIN sys.columns c
                        ON c.object_id = t.object_id
                    JOIN sys.partitions p
                        ON p.object_id = t.object_id
                    AND p.index_id IN (0,1)
                    outer apply (
                        select  c.*
                            ,   ty.name tipo
                            ,   CASE WHEN c.is_nullable = 1
                                    THEN 'YES'
                                    ELSE 'NO'
                                END AS Nullable
                        from    sys.columns c 
                                inner join sys.types ty
                                    ON ty.user_type_id = c.user_type_id
                        where   c.name  = 'CD_'+t.name
                            and c.object_id = t.object_id
                    ) cc
            WHERE   NOT EXISTS (
                        SELECT 1
                        FROM sys.columns ci
                        WHERE ci.object_id = t.object_id
                        AND ci.is_identity = 1
                    )
                    AND not (T.NAME LIKE '%_HISTORICO' OR T.NAME LIKE '%_PRE_MIG')

            GROUP BY
                s.name,
                t.name,
                p.rows,
                cc.name,
                cc.tipo,
                cc.Nullable
            ORDER BY
            1, 2` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
