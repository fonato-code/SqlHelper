(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_lista_bancos_que_possuem_a_procedure_x_procedure = {
	id: "lista-bancos-que-possuem-a-procedure-x-procedure",
	title: "Lista bancos que possuem a Procedure X",
	tags: ["PROCEDURE"],
	blocks: [
	  { type: 'sql', title: `Query`, sql: `
			DECLARE @procedure_name NVARCHAR(200) = @@{string:SPC_OCORRENCIA:Procedure}
			DECLARE @sql NVARCHAR(MAX) = @@{string: :Sufixo}

			SELECT @sql += '
			    SELECT ''' + name + ''' AS banco_de_dados,
			           CASE WHEN EXISTS (
			               SELECT 1 FROM [' + name + '].sys.procedures
			               WHERE name = ''' + @procedure_name + '''
			           ) THEN ''SIM'' ELSE ''NÃO'' END AS existe
			'
			+ CASE WHEN name <> (SELECT TOP 1 name FROM sys.databases ORDER BY name DESC) 
			       THEN ' UNION ALL ' ELSE '' END
			FROM sys.databases
			WHERE state_desc = 'ONLINE'     
			  AND name NOT IN ('tempdb')    
			ORDER BY name

			EXEC sp_executesql @sql` 
 		}
	]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
