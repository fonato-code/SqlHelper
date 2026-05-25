(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_executar_a_limpeza_do_banco_de_dados_do_its4 = {
    id: "executar-a-limpeza-do-banco-de-dados-do-its4",
    title: "executar a limpeza do banco de dados do its4",
    tags: ["ATALHO"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `
			-- DESABILITA A TEMPORAL
			ALTER TABLE ATIVO SET (SYSTEM_VERSIONING = OFF)

			GO
			SET NOCOUNT ON
			GO

			-- DELETA AS LINHAS DE VIATURA EM LOTES DE 10000
			DECLARE @C INT = 1
			WHILE 1 = 1
			BEGIN
				PRINT (CONVERT(VARCHAR(10),@C))

				DELETE TOP (10000)  FROM ATIVO_HISTORICO WHERE CD_TIPO_ATIVO = 29

				IF @@ROWCOUNT < 10000 BREAK;
				SELECT @C += 1
			END

			GO
			-- LIMPA AS TABELAS DE LOG
			TRUNCATE TABLE LOG_ATUALIZACAO_ATIVO
			TRUNCATE TABLE LOG_ATUALIZACAO_ATIVO_TRACING

			select * from log_atualizacao_ativo

			-- LIMPA OS ARQUIVOS DE LOG
			GO
			ALTER DATABASE ITS_SINOTICO	SET RECOVERY SIMPLE
			GO
			DBCC SHRINKFILE (ITS_SINOTICO, 1)
			GO
			DBCC SHRINKFILE (ITS_SINOTICO_log, 1)
			GO
			ALTER DATABASE ITS_SINOTICO	SET RECOVERY SIMPLE

			-- HABILITA A TEMPORAL
			GO
			ALTER TABLE DBO.ATIVO SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [DBO].ATIVO_HISTORICO, DATA_CONSISTENCY_CHECK = ON))` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
