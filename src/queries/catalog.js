/**
 * Catálogo de queries T-SQL (gerado/atualizado via scripts/import-queries-from-md.js)
 * Cada tópico está em src/queries/topics/<id>.js
 */
(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  var topics = [
    SqlHelp._qt_ocupacao_atual_do_banco_de_dados_por_tabela,
    SqlHelp._qt_saude_dos_indices_do_banco_de_dados,
    SqlHelp._qt_listagem_e_informacoes_completas_de_indices_da_base_de_dados,
    SqlHelp._qt_listagem_e_informacoes_completas_de_indices_da_base_de_dados_nivel_de_fragmentac,
    SqlHelp._qt_somente_a_fragmentacao_dos_indices,
    SqlHelp._qt_indices_ausentes,
    SqlHelp._qt_lista_todas_as_fks_do_banco_dedados,
    SqlHelp._qt_saude_dos_planos_de_execucao_agurpados_pelas_queires_do_banco_de_dados,
    SqlHelp._qt_buscar_queries_que_utilizam_a_tabela_x,
    SqlHelp._qt_saude_das_procedures_do_banco_de_dados,
    SqlHelp._qt_criar_backup_compactado,
    SqlHelp._qt_quanditade_de_espaco_livre_nos_arquivos_dobanco,
    SqlHelp._qt_quanditade_de_espaco_livre_no_disco_do_servidor,
    SqlHelp._qt_execucoes_de_backup_nos_ultimos_7_dias,
    SqlHelp._qt_estatisticas_que_precisam_ser_tratadas,
    SqlHelp._qt_shrinkfile_em_todas_as_databases,
    SqlHelp._qt_historico_de_processamento_de_cpu,
    SqlHelp._qt_analise_de_memoria_atual_do_servidor,
    SqlHelp._qt_consumo_de_paginas_por_base_de_dados,
    SqlHelp._qt_consumo_de_paginas_por_objeto_da_base_atual,
    SqlHelp._qt_executar_a_limpeza_do_banco_de_dados_do_its4,
    SqlHelp._qt_listagem_de_sessions_atual,
    SqlHelp._qt_quantidade_de_deadlocks_desde_o_inicio_do_banco,
    SqlHelp._qt_tamanho_maximo_de_uma_linha_na_tabela,
    SqlHelp._qt_transformar_tabela_em_classe,
    SqlHelp._qt_analise_de_problema_em_paginas_de_dados,
    SqlHelp._qt_deadlock,
    SqlHelp._qt_criar_usuario_de_banco_de_dados,
    SqlHelp._qt_verifica_quais_databases_um_usuario_tem_acesso,
    SqlHelp._qt_cria_um_script_de_criacao_das_tabelas_de_um_acesso_linked_server,
    SqlHelp._qt_ajuste_de_identity_cache_para_corrigir_saltos_de_identity_no_banco_de_dados,
    SqlHelp._qt_adicionar_permissao_de_acesso_a_uma_database_a_multiplos_usuarios,
    SqlHelp._qt_adicionar_permissao_de_acesso_a_um_usuarios_a_multiplos_databases,
    SqlHelp._qt_tabelas_sem_primarykey_ou_clustered_index_geral_performance,
    SqlHelp._qt_comando_do_excel_para_realcar_linhas_e_colunas,
    SqlHelp._qt_analise_de_indice,
    SqlHelp._qt_lista_bancos_que_possuem_a_tabela_x_tabela,
    SqlHelp._qt_lista_bancos_que_possuem_a_procedure_x_procedure,
    SqlHelp._qt_lista_informacoes_da_tabela,
    SqlHelp._qt_listar_tabelas_sem_primary_key,
    SqlHelp._qt_listar_tabelas_sem_identity,
    SqlHelp._qt_listar_o_uso_das_tabelas_nos_objetos_de_banco,
    SqlHelp._qt_lista_quais_tabelas_utilizam_a_coluna_x_quais_queries_que_utilizam_a_coluna_x
  ].filter(Boolean);
  SqlHelp.queryTopics = topics.slice().sort(function (a, b) {
    return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
  });
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
