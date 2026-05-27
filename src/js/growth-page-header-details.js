(function (global) {
  'use strict';

  var SQLSKILLS_PAGE_URL = 'https://www.sqlskills.com/blogs/paul/inside-the-storage-engine-anatomy-of-a-page/';

  var M_TYPE_TABLE_HTML = [
    '<p class="small mb-2">Valores comuns de <code>m_type</code> (1 byte no offset 9). Fonte: Paul S. Randal, SQLskills.</p>',
    '<div class="table-responsive"><table class="table table-sm table-bordered mb-0 growth-ph-detail-table">',
    '<thead><tr><th>Valor</th><th>Tipo</th><th>Descrição</th></tr></thead><tbody>',
    '<tr><td class="font-monospace">1</td><td>Data</td><td>Registros de dados em heap ou folha de índice clustered.</td></tr>',
    '<tr><td class="font-monospace">2</td><td>Index</td><td>Registros de índice nos níveis superiores do clustered e em todos os níveis do nonclustered.</td></tr>',
    '<tr><td class="font-monospace">3</td><td>TEXT_MIX</td><td>Página de texto com trechos pequenos de LOB e partes internas da árvore de texto; pode ser compartilhada na partição.</td></tr>',
    '<tr><td class="font-monospace">4</td><td>TEXT_TREE</td><td>Página de texto com grandes blocos de LOB de uma única coluna.</td></tr>',
    '<tr><td class="font-monospace">7</td><td>Sort</td><td>Resultados intermediários de operação de ordenação.</td></tr>',
    '<tr><td class="font-monospace">8</td><td>GAM</td><td><strong>G</strong>lobal <strong>A</strong>llocation <strong>M</strong>ap — extent alocado ou não (1ª página = 2 em cada arquivo).</td></tr>',
    '<tr><td class="font-monospace">9</td><td>SGAM</td><td><strong>S</strong>hared GAM — extent disponível para páginas mistas (1ª = página 3).</td></tr>',
    '<tr><td class="font-monospace">10</td><td>IAM</td><td><strong>I</strong>ndex <strong>A</strong>llocation <strong>M</strong>ap — extents alocados a uma unidade de alocação.</td></tr>',
    '<tr><td class="font-monospace">11</td><td>PFS</td><td><strong>P</strong>age <strong>F</strong>ree <strong>S</strong>pace — alocação e espaço livre por página (~64 MB); 1ª = página 1.</td></tr>',
    '<tr><td class="font-monospace">13</td><td>Boot</td><td>Informações do banco; única no DB (página 9 do arquivo 1).</td></tr>',
    '<tr><td class="font-monospace">15</td><td>File header</td><td>Cabeçalho do arquivo; uma por arquivo (página 0).</td></tr>',
    '<tr><td class="font-monospace">16</td><td>DCM</td><td>Diff map — extents alterados desde último backup full/diff (1ª = página 6).</td></tr>',
    '<tr><td class="font-monospace">17</td><td>ML map</td><td>Extents alterados em bulk-logged desde último backup (1ª = página 7).</td></tr>',
    '<tr><td class="font-monospace">18</td><td>Repair</td><td>Página desalocada por DBCC CHECKDB durante reparo.</td></tr>',
    '<tr><td class="font-monospace">19</td><td>Reorganize</td><td>Página temporária de ALTER INDEX … REORGANIZE / DBCC INDEXDEFRAG.</td></tr>',
    '<tr><td class="font-monospace">20</td><td>Bulk load</td><td>Pré-alocada em bulk load; depois formatada como página “real”.</td></tr>',
    '</tbody></table></div>'
  ].join('');

  var PAGE_HEADER_FIELD_DETAILS = {
    pageId: {
      detailMode: 'popover',
      detailTitle: 'm_pageId',
      summaryPt: 'Identifica arquivo e número da página, ex.: (1:143) = página 143 no arquivo 1.',
      detailHtml: '<p>Identifica o <strong>arquivo</strong> (.mdf/.ndf) e a <strong>posição</strong> da página dentro dele.</p>' +
        '<p class="mb-0 small">Exemplo do dump <code>DBCC PAGE</code>: <code>m_pageId = (1:143)</code> → página <strong>143</strong> no arquivo <strong>1</strong>. ' +
        '8 bytes no header (offset 0–7).</p>'
    },
    headerVersion: {
      detailMode: 'popover',
      detailTitle: 'm_headerVersion',
      summaryPt: 'Versão do cabeçalho; desde o SQL Server 7.0 o valor é sempre 1.',
      detailHtml: '<p>Versão da estrutura do page header.</p><p class="mb-0">Desde o <strong>SQL Server 7.0</strong> este valor é sempre <code>1</code>.</p>'
    },
    type: {
      detailMode: 'modal',
      detailTitle: 'm_type — tipos de página',
      summaryPt: 'Tipo da página: 1 = dados, 2 = índice, 8 = GAM, 10 = IAM, 11 = PFS…',
      detailHtml: M_TYPE_TABLE_HTML
    },
    typeFlagBits: {
      detailMode: 'popover',
      detailTitle: 'm_typeFlagBits',
      summaryPt: 'Flags auxiliares: ex. 0x4 = todas as linhas com tamanho fixo na página de dados.',
      detailHtml: '<p><strong>Páginas de dados/índice:</strong> se o valor é <code>0x4</code>, todas as linhas na página têm o <strong>mesmo tamanho fixo</strong>.</p>' +
        '<p class="mb-0"><strong>Página PFS:</strong> bit <code>1</code> indica que pelo menos uma página no intervalo PFS tem ghost record.</p>'
    },
    level: {
      detailMode: 'popover',
      detailTitle: 'm_level',
      summaryPt: 'Nível na B-tree: 0 = folha; aumenta até a raiz. Em páginas não-índice, sempre 0.',
      detailHtml: '<p>Nível da página na <strong>árvore B-tree</strong> do índice.</p>' +
        '<ul class="small mb-2"><li><strong>0</strong> = nível folha (dados no clustered, ou folha do NC).</li>' +
        '<li>Aumenta em direção à <strong>raiz</strong> (uma página na raiz).</li></ul>' +
        '<p class="mb-0">Para tipos que não são página de índice, o nível é sempre <strong>0</strong>. ' +
        'No SQL Server 2000, folha clustered e o nível acima eram ambos “0” — era preciso olhar <code>m_type</code> também.</p>'
    },
    flagBits: {
      detailMode: 'popover',
      detailTitle: 'm_flagBits',
      summaryPt: 'Flags da página: 0x200 = checksum; 0x100 = proteção torn page.',
      detailHtml: '<p>Vários <strong>bits de estado</strong> da página:</p>' +
        '<ul class="small mb-2">' +
        '<li><code>0x200</code> — página tem <strong>checksum</strong> (PAGE_VERIFY CHECKSUM).</li>' +
        '<li><code>0x100</code> — <strong>torn-page protection</strong> ativa.</li>' +
        '</ul><p class="mb-0 small">Alguns bits deixaram de ser usados a partir do SQL Server 2005.</p>'
    },
    indxId: {
      detailMode: 'popover',
      detailTitle: 'm_objId / m_indexId (allocation unit)',
      summaryPt: 'No SQL Server 2005+, identifica a unidade de alocação (não mais object_id/index_id direto).',
      detailHtml: '<p>No <strong>SQL Server 2000</strong>, <code>m_objId</code> e <code>m_indexId</code> eram o object_id e index_id reais.</p>' +
        '<p>A partir do <strong>2005</strong>, o modelo de metadados mudou: estes campos identificam a <strong>unidade de alocação</strong> (allocation unit) à qual a página pertence.</p>' +
        '<p class="mb-0 small">Em bancos atualizados do 2000 ou em algumas system tables, ainda podem refletir IDs “clássicos”. ' +
        'O <code>DBCC PAGE</code> também mostra linhas <code>Metadata:</code> (fora dos 96 B) com ObjectId/IndexId resolvidos.</p>'
    },
    prevPage: {
      detailMode: 'popover',
      detailTitle: 'm_prevPage',
      summaryPt: 'Ponteiro (6 B efetivos) para a página anterior no mesmo nível da B-tree; NULL na ponta esquerda.',
      detailHtml: '<p>Ponteiro para a <strong>página anterior</strong> no mesmo nível do índice (lista duplamente encadeada na ordem <em>lógica</em> das chaves).</p>' +
        '<p>Armazena um page ID de <strong>6 bytes</strong> (dentro dos 8 bytes do campo). ' +
        'Não precisa ser a página fisicamente adjacente no arquivo (fragmentação).</p>' +
        '<p class="mb-0">Na ponta <strong>esquerda</strong> do nível, <code>m_prevPage</code> é <code>NULL</code>. Em heap de uma página, costuma ser NULL.</p>'
    },
    nextPage: {
      detailMode: 'popover',
      detailTitle: 'm_nextPage',
      summaryPt: 'Ponteiro para a próxima página no nível; NULL na ponta direita.',
      detailHtml: '<p>Ponteiro para a <strong>próxima página</strong> no mesmo nível da B-tree (ordem lógica do índice).</p>' +
        '<p class="mb-0">Na ponta <strong>direita</strong>, <code>m_nextPage</code> é <code>NULL</code>. ' +
        'Exceção: após <code>ALTER TABLE … REBUILD</code> de heap, os ponteiros podem existir sem uso real (código de rebuild de índice).</p>'
    },
    pminRec: {
      detailMode: 'popover',
      detailTitle: 'pminlen',
      summaryPt: 'Tamanho da parte de tamanho fixo dos registros nesta página (nome no dump: pminlen).',
      detailHtml: '<p>No artigo SQLskills o campo aparece como <code>pminlen</code> no dump <code>DBCC PAGE</code> (não confundir com ghost offset).</p>' +
        '<p class="mb-0">É o tamanho da <strong>porção de comprimento fixo</strong> dos registros armazenados na página — útil para entender o layout mínimo de cada linha.</p>'
    },
    freeData: {
      detailMode: 'popover',
      detailTitle: 'm_freeData',
      summaryPt: 'Offset do primeiro byte após o fim do último registro; o espaço livre pode estar antes disso.',
      detailHtml: '<p>Offset a partir do byte 0 da página até o <strong>primeiro byte depois do último registro</strong>.</p>' +
        '<p class="mb-0">Importante: pode haver <strong>espaço livre antes</strong> desse ponto (buracos por deletes). O motor não compacta automaticamente a cada delete.</p>'
    },
    freeCnt: {
      detailMode: 'popover',
      detailTitle: 'm_freeCnt',
      summaryPt: 'Quantidade de bytes livres contíguos na página.',
      detailHtml: '<p>Número de <strong>bytes livres</strong> na página (espaço disponível para novos registros ou crescimento de linhas).</p>' +
        '<p class="mb-0">Trabalha junto com <code>m_freeData</code> e o slot array na base da página.</p>'
    },
    reserved: {
      detailMode: 'popover',
      detailTitle: 'm_reservedCnt',
      summaryPt: 'Bytes livres reservados por transações ativas (rollback); algoritmo complexo.',
      detailHtml: '<p><code>m_reservedCnt</code> — bytes de espaço livre <strong>reservados</strong> por transações que liberaram espaço na página.</p>' +
        '<p>Impede que outra transação use esse espaço até o commit/rollback correto. O valor muda com um algoritmo interno relativamente complexo.</p>' +
        '<p class="mb-0"><code>m_xactReserved</code> guarda o último incremento aplicado a este campo.</p>'
    },
    slotCnt: {
      detailMode: 'popover',
      detailTitle: 'm_slotCnt',
      summaryPt: 'Número de registros (slots) na página; cada slot = 2 B no final da página.',
      detailHtml: '<p>Contagem de <strong>registros</strong> (slots) na página.</p>' +
        '<p class="mb-0">Cada entrada no <strong>Row Offset Array</strong> ocupa 2 bytes no final da página e aponta para o início de uma linha. ' +
        'Os slots crescem de baixo para cima (do fim da página).</p>'
    },
    lsn: {
      detailMode: 'popover',
      detailTitle: 'm_lsn',
      summaryPt: 'LSN do último log que alterou esta página (recuperação e replicação).',
      detailHtml: '<p><strong>Log Sequence Number</strong> do último registro de log que modificou a página.</p>' +
        '<p class="mb-0">Fundamental para recuperação de desastres, replicação e consistência durável.</p>'
    },
    xactReserved: {
      detailMode: 'popover',
      detailTitle: 'm_xactReserved',
      summaryPt: 'Último valor somado a m_reservedCnt por uma transação.',
      detailHtml: '<p>Quantidade que foi <strong>por último adicionada</strong> ao campo <code>m_reservedCnt</code>.</p>' +
        '<p class="mb-0">Ajuda o motor a gerenciar espaço reservado durante transações concorrentes.</p>'
    },
    xdesId: {
      detailMode: 'popover',
      detailTitle: 'm_xdesId',
      summaryPt: 'ID interno da transação que mais recentemente alterou m_reservedCnt.',
      detailHtml: '<p>ID interno da transação que mais recentemente contribuiu para <code>m_reservedCnt</code>.</p>' +
        '<p class="mb-0">Vincula a reserva de espaço à estrutura de transação distribuída (XDES).</p>'
    },
    ghostRecCnt: {
      detailMode: 'popover',
      detailTitle: 'm_ghostRecCnt',
      summaryPt: 'Quantidade de registros “ghost” (marcados para remoção, ainda não limpos).',
      detailHtml: '<p>Contagem de <strong>ghost records</strong> na página — linhas logicamente removidas mas ainda presentes fisicamente até limpeza assíncrona.</p>' +
        '<p class="mb-0">Processos como ghost cleanup reduzem este contador ao reutilizar espaço.</p>'
    },
    tornBits: {
      detailMode: 'popover',
      detailTitle: 'm_tornBits',
      summaryPt: 'Checksum da página ou bits de torn-page protection, conforme PAGE_VERIFY do banco.',
      detailHtml: '<p>Armazena o <strong>page checksum</strong> <em>ou</em> os bits deslocados pela proteção <strong>torn page</strong>, dependendo da configuração do banco.</p>' +
        '<p class="mb-0">Detecta gravações parciais incorretas em disco.</p>'
    },
    allocUnit: {
      detailMode: 'popover',
      detailTitle: 'Allocation unit / padding',
      summaryPt: 'Referência à unidade de alocação e bytes de alinhamento até completar 96 B.',
      detailHtml: '<p>Bytes restantes do header até <strong>96</strong>, incluindo referência à <strong>unidade de alocação</strong> (modelo 2005+).</p>' +
        '<p class="mb-0 small">O layout exato pode variar por versão; o importante é que o header ocupa sempre os primeiros 96 bytes de cada página.</p>'
    }
  };

  function enrichPageHeaderFields(fields) {
    return fields.map(function (f) {
      var d = PAGE_HEADER_FIELD_DETAILS[f.id];
      if (!d) return Object.assign({}, f);
      var out = Object.assign({}, f);
      if (d.summaryPt) out.description = d.summaryPt;
      out.detailMode = d.detailMode;
      out.detailTitle = d.detailTitle || f.label;
      out.detailHtml = d.detailHtml;
      return out;
    });
  }

  global.GrowthPageHeaderDetails = {
    SQLSKILLS_PAGE_URL: SQLSKILLS_PAGE_URL,
    PAGE_HEADER_FIELD_DETAILS: PAGE_HEADER_FIELD_DETAILS,
    enrichPageHeaderFields: enrichPageHeaderFields
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
