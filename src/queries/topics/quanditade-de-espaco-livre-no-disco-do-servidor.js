(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_quanditade_de_espaco_livre_no_disco_do_servidor = {
    id: "quanditade-de-espaco-livre-no-disco-do-servidor",
    title: "Quanditade de espaço livre no disco do servidor",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	SELECT	DISTINCT
			Unidade = ISNULL(VS.volume_mount_point, 'Sem Nome')
		,	Descricao = ISNULL(VS.logical_volume_name,'Sem Descrição')
		,	TotalGB = CAST(CAST(VS.total_bytes AS DECIMAL(19, 2)) / 1024 / 1024 / 1024 AS DECIMAL(10, 2))
		,	DisponivelGB = CAST(CAST(VS.available_bytes AS DECIMAL(19, 2)) / 1024 / 1024 / 1024 AS DECIMAL(10, 2))
		,	DisponivelPercentual =  CAST(( CAST(VS.available_bytes AS DECIMAL(19, 2)) / CAST(VS.total_bytes AS DECIMAL(19, 2)) * 100 ) AS DECIMAL(10, 2))
		,	OcupadoPercentual = CAST(( 100 - CAST(VS.available_bytes AS DECIMAL(19, 2)) / CAST(VS.total_bytes AS DECIMAL(19, 2)) * 100 ) AS DECIMAL(10, 2))
	FROM	sys.master_files AS MF
			CROSS APPLY sys.dm_os_volume_stats(MF.database_id, MF.file_id) AS VS` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
