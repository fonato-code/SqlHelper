(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_lista_todas_as_fks_do_banco_dedados = {
    id: "lista-todas-as-fks-do-banco-dedados",
    title: "Lista todas as FKs do banco dedados",
    tags: ["FOREIGNKEY"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			SELECT 	fk.name AS ForeignKeyName,
					OBJECT_SCHEMA_NAME(fk.parent_object_id) AS SchemaName,
					OBJECT_NAME(fk.parent_object_id) AS TableName,
					COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS ColumnName,
					OBJECT_NAME(fk.referenced_object_id) AS ReferencedTableName,
					COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ReferencedColumnName,
					fk.delete_referential_action_desc AS OnDeleteAction,
					fk.update_referential_action_desc AS OnUpdateAction
			FROM 	sys.foreign_keys fk
					JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
			ORDER BY 
					SchemaName, TableName, ForeignKeyName;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
