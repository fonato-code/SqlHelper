(function (root) {
	'use strict';
	var SqlHelp = root.SqlHelp = root.SqlHelp || {};
	SqlHelp._qt_ajuste_de_identity_cache_para_corrigir_saltos_de_identity_no_banco_de_dados = {
		id: "ajuste-de-identity-cache-para-corrigir-saltos-de-identity-no-banco-de-dados",
		title: "Ajuste de IDENTITY_CACHE para corrigir saltos de identity no banco de dados",
		tags: ["GERAL"],
		blocks: [
			{ type: 'sql', title: `Query`, sql: `
				USE TOR2
				-- Veirica o valor atual do cache do identity 
				SELECT name, value, value_for_secondary
				FROM sys.database_scoped_configurations
				WHERE name = 'IDENTITY_CACHE';

				-- desliga o uso de cache no identity 
				ALTER DATABASE SCOPED CONFIGURATION SET IDENTITY_CACHE = OFF;` },
			{ type: 'md', content: `_________________________________________________________` }
		]
	};
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
