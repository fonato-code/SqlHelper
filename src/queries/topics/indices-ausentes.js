(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_indices_ausentes = {
    id: "indices-ausentes",
    title: "Indices ausentes",
    tags: ["INDICE"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT  ObjectName = mid.statement
		,	mid.object_id
		,	mid.equality_columns
		,	mid.inequality_columns
		,	mid.included_columns
		,	improvement_measure = migs.avg_total_user_cost * (migs.avg_user_impact / 100.0) * (migs.user_seeks + migs.user_scans)	
		,	migs.user_seeks
		,	migs.user_scans
		,	migs.last_user_seek
		,	migs.last_user_scan
		,	migs.avg_user_impact
		,	migs.avg_total_user_cost
	FROM	sys.dm_db_missing_index_groups mig
			INNER JOIN sys.dm_db_missing_index_group_stats migs ON migs.group_handle = mig.index_group_handle
			INNER JOIN sys.dm_db_missing_index_details mid ON mig.index_handle = mid.index_handle
			cross apply (
				select	 [db]= [1]
					,	 [schema]= [2]
					,	 [table]= [3]
				from (
				select	ordem = row_number() over (order by (select '') ) 
					,	value 
				from	string_Split(mid.statement, '.')
				) p
				PIVOT  
				(  
					max(value)  
					FOR ordem IN  
					( [1], [2], [3])  
				) AS pvt
			) p
	where	migs.last_user_seek > (getdate() - 30)
	ORDER BY
			improvement_measure DESC;` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
