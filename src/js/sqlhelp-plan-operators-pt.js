(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  /** Resumos em português para operadores frequentes no SqlHelp. */
  SqlHelp.PLAN_OPERATOR_DESCRIPTIONS_PT = {
    'Clustered Index Scan':
      'Varre o índice clustered da tabela (toda a tabela ou um intervalo). Alto custo de I/O quando muitas linhas são lidas.',
    'Clustered Index Seek':
      'Localiza linhas em um intervalo específico do índice clustered. Geralmente eficiente quando o predicado é seletivo.',
    'Index Scan':
      'Varre um índice não clustered (todo o índice ou um intervalo).',
    'Index Seek':
      'Busca um intervalo específico em um índice não clustered.',
    'Table Scan': 'Varre a tabela heap linha a linha quando não há índice adequado.',
    Sort: 'Reordena as linhas de entrada conforme colunas de ordenação (pode usar memória ou tempdb).',
    'Stream Aggregate':
      'Calcula agregações (SUM, COUNT, etc.) sobre um fluxo já ordenado, sem hash adicional.',
    'Hash Match':
      'Constrói tabela hash para unir ou agregar linhas; comum em joins grandes e agregações.',
    'Merge Join':
      'Une dois fluxos já ordenados (inner/outer/full). Eficiente quando ambas entradas estão ordenadas na chave do join.',
    'Nested Loops':
      'Para cada linha da entrada externa, procura correspondências na interna (seek ou scan). Bom para poucas linhas externas.',
    'Adaptive Join':
      'Escolhe hash join ou nested loops após examinar a primeira entrada (planos adaptativos).',
    Parallelism:
      'Distribui trabalho entre threads em planos paralelos (exchange de linhas entre threads).',
    Filter: 'Remove linhas que não satisfazem o predicado.',
    'Compute Scalar': 'Avalia expressões escalares por linha (colunas calculadas, conversões).',
    Concatenation: 'Empilha vários fluxos de entrada em uma única saída (UNION ALL).',
    'Table Spool': 'Armazena linhas em tempdb ou memória para reutilização (ex.: loops, CTEs).',
    'Index Spool': 'Cria estrutura temporária de índice para acelerar buscas repetidas.',
    'Key Lookup':
      'Busca colunas não presentes no índice não clustered (bookmark lookup no clustered).',
    'RID Lookup': 'Busca colunas adicionais em tabela heap via RID.',
    'Clustered Index Insert': 'Insere linhas no índice clustered (e índices não clustered relacionados).',
    'Clustered Index Delete': 'Remove linhas do índice clustered.',
    'Clustered Index Update': 'Atualiza linhas no índice clustered.',
    'Index Insert': 'Insere entradas em índice não clustered.',
    'Index Delete': 'Remove entradas de índice não clustered.',
    Bitmap: 'Filtra linhas em planos paralelos usando bitmap (reduz trabalho em joins).',
    'Sort Warning': 'Indica que o Sort não coube na memória concedida (spill para tempdb).',
    Assert: 'Valida condição (integridade referencial, subconsulta escalar com uma linha).',
    'Sequence Project': 'Atribui números de sequência ou identidade às linhas.',
    'Window Aggregate': 'Calcula funções de janela (ROW_NUMBER, SUM OVER, etc.).'
  };
})(typeof window !== 'undefined' ? window : this);
