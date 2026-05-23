(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_somente_a_fragmentacao_dos_indices = {
    id: "somente-a-fragmentacao-dos-indices",
    title: "somente a Fragmentação dos indices",
    tags: ["INDICE"],
    blocks: [
      { type: 'md', content: `verifica o nivel de fragmentação de cada uma das constraints do banco de dados e na guia de mensagem gera a querie para executar o rebuild/reorganize` },
      { type: 'sql', title: `Query`, sql: `	select
		TableName = object_name(b.object_id),
		IndexName = b.name, 
		FragmentationAvg = avg_fragmentation_in_percent,
		Script = case
			when avg_fragmentation_in_percent > 30 
			then 'alter index ' + b.name + ' on ' + schema_name(t.schema_id) + '.' + object_name(b.object_id) + ' rebuild with (online = on)'
			when avg_fragmentation_in_percent >= 5 and avg_fragmentation_in_percent <= 30 
			then 'alter index ' + b.name + ' on '+  schema_name(t.schema_id) + '.' + object_name(b.object_id) + ' reorganize'
		end
	from	sys.dm_db_index_physical_stats (db_id(), null, null, null, null) as a -- (Parâmetros da função: banco de dados, tabela, indice, partição física, modo de analise: default, null, limited (limitado), sampled (amostra), detailed (detalhado))
			join sys.indexes as b on a.object_id = b.object_id and a.index_id = b.index_id
			inner join sys.tables t on t.object_id = b.object_id
	order by script desc` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
