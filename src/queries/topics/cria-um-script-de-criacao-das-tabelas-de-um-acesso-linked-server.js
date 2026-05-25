(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_cria_um_script_de_criacao_das_tabelas_de_um_acesso_linked_server = {
    id: "cria-um-script-de-criacao-das-tabelas-de-um-acesso-linked-server",
    title: "Cria um script de criação das tabelas de um acesso linked server",
    tags: ["GERAL"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			-- Variáveis de controle
			set nocount on 
			DECLARE @linkedServer NVARCHAR(128) = 'TRIPPER';
			DECLARE @remoteDb NVARCHAR(128) = 'TRIPPER_ENTR_DW';

			-- Tabela temporária para armazenar colunas
			IF OBJECT_ID('tempdb..#colunas') IS NOT NULL DROP TABLE #colunas;
			CREATE TABLE #colunas (
					TABLE_SCHEMA NVARCHAR(128),
					TABLE_NAME NVARCHAR(128),
					COLUMN_NAME NVARCHAR(128),
					DATA_TYPE NVARCHAR(128),
					CHARACTER_MAXIMUM_LENGTH INT,
					NUMERIC_PRECISION INT,
					NUMERIC_SCALE INT,
					IS_NULLABLE NVARCHAR(10)
			);

			-- Preencher com dados do banco remoto
			DECLARE @sql NVARCHAR(MAX) = '
					SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, 
								NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
					FROM [' + @remoteDb + '].INFORMATION_SCHEMA.COLUMNS
			';

			DECLARE @openquery NVARCHAR(MAX) = '
					INSERT INTO #colunas
					SELECT * FROM OPENQUERY([' + @linkedServer + '], ''' + REPLACE(@sql, '''', '''''') + ''')';

			EXEC (@openquery);

			-- Tabela para armazenar scripts
			IF OBJECT_ID('tempdb..#scripts') IS NOT NULL DROP TABLE #scripts;
			CREATE TABLE #scripts (
					ScriptText NVARCHAR(MAX)
			);

			-- 1. Adicionar CREATE SCHEMA para cada schema único
			INSERT INTO #scripts (ScriptText)
			SELECT DISTINCT 'CREATE SCHEMA [' + TABLE_SCHEMA + '];' FROM #colunas;

			-- 2. Gerar CREATE TABLEs
			DECLARE @schema NVARCHAR(128), @table NVARCHAR(128), @create NVARCHAR(MAX);

			DECLARE cur CURSOR FOR
					SELECT DISTINCT TABLE_SCHEMA, TABLE_NAME FROM #colunas ORDER BY TABLE_SCHEMA, TABLE_NAME;

			OPEN cur;
			FETCH NEXT FROM cur INTO @schema, @table;

			WHILE @@FETCH_STATUS = 0
			BEGIN
					SET @create = 'CREATE TABLE [' + @schema + '].[' + @table + '] (' + CHAR(13);

					SELECT @create = @create +
							'    [' + COLUMN_NAME + '] ' +
							DATA_TYPE +
							CASE 
									WHEN DATA_TYPE IN ('varchar', 'char', 'nvarchar', 'nchar') THEN 
											'(' + CASE 
															WHEN CHARACTER_MAXIMUM_LENGTH = -1 THEN 'MAX' 
															ELSE CAST(CHARACTER_MAXIMUM_LENGTH AS VARCHAR) 
													END + ')'
									WHEN DATA_TYPE IN ('decimal', 'numeric') THEN 
											'(' + CAST(NUMERIC_PRECISION AS VARCHAR) + ',' + CAST(NUMERIC_SCALE AS VARCHAR) + ')'
									ELSE ''
							END + ' ' +
							CASE WHEN IS_NULLABLE = 'NO' THEN 'NOT NULL' ELSE 'NULL' END + ',' + CHAR(13)
					FROM #colunas
					WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table;

					-- Remove vírgula final
					SET @create = LEFT(@create, LEN(@create) - 2) + CHAR(13) + ');';

					INSERT INTO #scripts (ScriptText) VALUES (@create);

					FETCH NEXT FROM cur INTO @schema, @table;
			END

			CLOSE cur;
			DEALLOCATE cur;

			-- Exibir os scripts com segurança (evita estouro de PRINT)
			DECLARE @linha NVARCHAR(MAX);
			DECLARE script_cursor CURSOR FOR SELECT ScriptText FROM #scripts;

			OPEN script_cursor;
			FETCH NEXT FROM script_cursor INTO @linha;

			WHILE @@FETCH_STATUS = 0
			BEGIN
					WHILE LEN(@linha) > 0
					BEGIN
					PRINT LEFT(@linha, 4000);
							SET @linha = SUBSTRING(@linha, 4001, LEN(@linha));
					END
				print 'GO'
					FETCH NEXT FROM script_cursor INTO @linha;
			END

			CLOSE script_cursor;
			DEALLOCATE script_cursor;` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
