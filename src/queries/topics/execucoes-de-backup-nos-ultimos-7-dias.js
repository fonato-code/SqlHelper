(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_execucoes_de_backup_nos_ultimos_7_dias = {
    id: "execucoes-de-backup-nos-ultimos-7-dias",
    title: "Execuções de backup nos ultimos 7 dias",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			SELECT 
				CONVERT(CHAR(100), SERVERPROPERTY('Servername')) AS Server, 
				msdb.dbo.backupset.database_name, 
				msdb.dbo.backupset.backup_start_date, 
				msdb.dbo.backupset.backup_finish_date, 
				datediff(second, msdb.dbo.backupset.backup_start_date, msdb.dbo.backupset.backup_finish_date),
				msdb.dbo.backupset.expiration_date, 
				CASE msdb..backupset.type 
						WHEN 'D' THEN 'Database' 
						WHEN 'L' THEN 'Log' 
						END AS backup_type, 
				msdb.dbo.backupset.backup_size, 
				msdb.dbo.backupmediafamily.logical_device_name, 
				msdb.dbo.backupmediafamily.physical_device_name, 
				msdb.dbo.backupset.name AS backupset_name, 
				msdb.dbo.backupset.description 
			FROM 
				msdb.dbo.backupmediafamily 
				INNER JOIN msdb.dbo.backupset ON msdb.dbo.backupmediafamily.media_set_id = msdb.dbo.backupset.media_set_id 
			WHERE 
				(CONVERT(datetime, msdb.dbo.backupset.backup_start_date, 102) >= getdate() -7 ) 
			ORDER BY 
				msdb.dbo.backupset.backup_start_date` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
