-- Alocation Type per table

USE tor_plus;

SELECT
        s.name AS SchemaName,
        t.name AS TableName,

        i.name AS IndexName,
        i.type_desc AS IndexType,

        au.type_desc AS AllocationType,

        au.total_pages,
        au.used_pages,
        au.data_pages,

        (au.total_pages * 8) / 1024.0 AS TotalMB,
        (au.used_pages * 8) / 1024.0 AS UsedMB,
        (au.data_pages * 8) / 1024.0 AS DataMB

FROM    sys.allocation_units au

        JOIN sys.partitions p
            ON  au.container_id =
                CASE
                    WHEN au.type IN (1, 3)
                    THEN p.hobt_id
                    ELSE p.partition_id
                END

        JOIN sys.tables t
            ON t.object_id = p.object_id

        JOIN sys.schemas s
            ON s.schema_id = t.schema_id

        LEFT JOIN sys.indexes i
            ON  i.object_id = p.object_id
            AND i.index_id = p.index_id

ORDER BY
        SchemaName,
        TableName
        ,
        
        TotalMB DESC


