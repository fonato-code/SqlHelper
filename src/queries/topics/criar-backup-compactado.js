(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_criar_backup_compactado = {
    id: "criar-backup-compactado",
    title: "Criar backup compactado",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	-- Querie para gerar um backup compactado
	BACKUP DATABASE SIPVIG TO DISK = 'Z:\\BKP_SIPVIG_COFRES\\HASQL2\\BACKUP\\SIPVIG_FULL_39081.bak' 
	WITH COPY_ONLY, COMPRESSION, CHECKSUM, STATS = 1 ,MAXTRANSFERSIZE = 2097152,BUFFERCOUNT=50,BLOCKSIZE =8192` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
