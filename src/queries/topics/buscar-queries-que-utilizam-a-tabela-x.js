(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_buscar_queries_que_utilizam_a_tabela_x = {
    id: "buscar-queries-que-utilizam-a-tabela-x",
    title: "buscar queries que utilizam a tabela X",
    tags: ["QUERIE"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	select distinct [Table Name] = o.Name, [Found In] = sp.Name, sp.type_desc
	from	sys.objects o 
			inner join sys.sql_expression_dependencies  sd 
				on o.object_id = sd.referenced_id
			inner join sys.objects sp 
				on sd.referencing_id = sp.object_id
				and sp.type in ('P', 'FN')
	where o.name = 'DIA'
	order by sp.Name` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
