(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_consumo_de_paginas_por_objeto_da_base_atual = {
    id: "consumo-de-paginas-por-objeto-da-base-atual",
    title: "Consumo de Paginas por Objeto da Base Atual",
    tags: ["DISCO"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT	cached_pages_count  = COUNT(*)
		,	cached_pages_Mb = convert(decimal(9,3), COUNT(*) * 8.0 /1024.0 )
		,	obj.name 
		,	obj.index_id   
	FROM	sys.dm_os_buffer_descriptors AS bd   
			INNER JOIN   
			(  
				SELECT object_name(object_id) AS name   
					,index_id ,allocation_unit_id  
				FROM sys.allocation_units AS au  
					INNER JOIN sys.partitions AS p   
						ON au.container_id = p.hobt_id   
							AND (au.type = 1 OR au.type = 3)  
				UNION ALL  
				SELECT object_name(object_id) AS name     
					,index_id, allocation_unit_id  
				FROM sys.allocation_units AS au  
					INNER JOIN sys.partitions AS p   
						ON au.container_id = p.partition_id   
							AND au.type = 2  
			) AS obj   
				ON bd.allocation_unit_id = obj.allocation_unit_id  
	WHERE database_id = DB_ID()  
	GROUP BY obj.name, obj.index_id
	ORDER BY cached_pages_count DESC;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
