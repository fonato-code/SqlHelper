(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_tabelas_sem_primarykey_ou_clustered_index_geral_performance = {
    id: "tabelas-sem-primarykey-ou-clustered-index-geral-performance",
    title: "Tabelas sem PrimaryKey ou Clustered Index   **(GERAL)(PERFORMANCE)**",
    tags: [],
    blocks: [
      { type: 'md', content: `## Query` },
      { type: 'sql', title: `Query`, sql: `SELECT   t.object_id
    ,   [schema_name] = SCHEMA_NAME(t.schema_id)
    ,   [table_name] = t.name
    ,   [check]  =  'sp_help '''+SCHEMA_NAME(t.schema_id)+'.'+t.name+''''
    ,   [WithPrimarykey] = iif(kc.object_id IS NULL, '', 'True')
    ,   [WithClusteredIndex] = iif(i.object_id IS NULL, '', 'True')
    ,   [PossibleTrash] = iif(
            t.name like '%BKP%' or 
            t.name like '%TMP%' or 
            t.name like '%TEMP%' or 
            t.name like '%[0-9][0-9][0-9][0-9]' or 
            t.name like '%HISTORICO' , 'True', '')
FROM    sys.tables t
        LEFT JOIN sys.key_constraints kc
            ON kc.parent_object_id = t.object_id
            AND kc.type = 'PK'
        LEFT JOIN sys.indexes i
            ON t.object_id = i.object_id
            AND i.type = 1  
WHERE   kc.object_id IS NULL
    OR  i.object_id IS NULL
ORDER BY
    [PossibleTrash] asc , schema_name, table_name;` },
      { type: 'md', content: `## Gabarito para adicionar PK e clustered` },
      { type: 'sql', title: `Gabarito para adicionar PK e clustered`, sql: `	ALTER TABLE schema.tableName ADD CONSTRAINT Pk_name PRIMARY KEY CLUSTERED 
    (   
        column1 ASC
        -- ,olumn2 ASC -- etc 
    )` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
