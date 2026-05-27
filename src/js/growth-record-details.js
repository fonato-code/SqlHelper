(function (global) {
  'use strict';

  var SQLSKILLS_RECORD_URL = 'https://www.sqlskills.com/blogs/paul/inside-the-storage-engine-anatomy-of-a-record/';
  var MS_RECORD_URL = 'https://learn.microsoft.com/en-us/sql/relational-databases/pages-and-extents-architecture-guide?view=sql-server-ver17';

  var RECORD_TYPE_TABLE_HTML = [
    '<p class="small mb-2">Bits 1–3 do byte <code>TagA</code> (valor × 2 no byte). Fonte: Paul S. Randal, SQLskills.</p>',
    '<div class="table-responsive"><table class="table table-sm table-bordered mb-0 growth-ph-detail-table">',
    '<thead><tr><th>Valor</th><th>Tipo</th><th>Descrição</th></tr></thead><tbody>',
    '<tr><td class="font-monospace">0</td><td>PRIMARY</td><td>Heap não encaminhado ou folha de índice clustered.</td></tr>',
    '<tr><td class="font-monospace">1</td><td>Forwarded</td><td>Registro movido (heap); contém back-pointer.</td></tr>',
    '<tr><td class="font-monospace">2</td><td>Forwarding</td><td>Stub que aponta para o novo local (heap).</td></tr>',
    '<tr><td class="font-monospace">3</td><td>Index</td><td>Registro de índice (níveis acima da folha ou folha NC).</td></tr>',
    '<tr><td class="font-monospace">4</td><td>Blob fragment</td><td>Fragmento LOB na árvore de texto.</td></tr>',
    '<tr><td class="font-monospace">5</td><td>Ghost index</td><td>Registro de índice marcado como ghost.</td></tr>',
    '<tr><td class="font-monospace">6</td><td>Ghost data</td><td>Registro de dados ghost (delete lógico).</td></tr>',
    '<tr><td class="font-monospace">7</td><td>Ghost version</td><td>Registro especial 15 B (header 1 B + tag 14 B).</td></tr>',
    '</tbody></table></div>',
    '<p class="small text-muted mb-0 mt-2">Ex.: registro PRIMARY com null bitmap + variáveis → <code>TagA = 0x30</code> (bits 4 e 5).</p>'
  ].join('');

  var RECORD_STRUCTURE_FIELD_DETAILS = {
    recordHeader: {
      detailMode: 'popover',
      detailTitle: 'Record header (4 B físicos)',
      summaryPt: 'TagA + TagB + offset do null bitmap (2 B). Primeiros 4 bytes do registro.',
      detailHtml: '<p><strong>Byte 0 — TagA:</strong> tipo de registro (bits 1–3) + flags (null bitmap, variáveis, versioning).</p>' +
        '<p><strong>Byte 1 — TagB:</strong> ex. <code>0x01</code> = ghost forwarded record.</p>' +
        '<p class="mb-2"><strong>Bytes 2–3:</strong> offset até o null bitmap (ushort, little-endian).</p>' +
        '<p class="mb-0 small">Use o botão <strong>Ver tabela</strong> em <em>Tipos de registro</em> para a lista completa de TagA.</p>'
    },
    recordType: {
      detailMode: 'modal',
      detailTitle: 'Tipos de registro (TagA)',
      summaryPt: 'Tipos PRIMARY, forwarded, index, ghost… (bits 1–3 do TagA).',
      detailHtml: RECORD_TYPE_TABLE_HTML
    },
    recordHeaderMeta: {
      detailMode: 'popover',
      detailTitle: 'Metadata expandida (modelo SqlHelp)',
      summaryPt: '6 B do header lógico de 12 B — status expandido e campos auxiliares do modelo de cálculo.',
      detailHtml: '<p>O motor de projeção SqlHelp usa um <strong>header lógico de 12 B</strong> para estimar tamanho.</p>' +
        '<p>Os primeiros <strong>4 B</strong> correspondem ao header físico (TagA/TagB/offset). Estes <strong>6 B</strong> completam a visão pedagógica (status expandidos, fim dos fixos, etc.).</p>' +
        '<p class="mb-0 small">No disco, TagA/TagB ocupam 2 bytes — não 6. Este bloco existe só para a soma bater com o modelo de 12 B.</p>'
    },
    fixedData: {
      detailMode: 'popover',
      detailTitle: 'Dados de tamanho fixo',
      summaryPt: 'Colunas fixas + bits empacotados (8 bits = 1 B). Ordem: heap = CREATE TABLE; clustered = chaves primeiro.',
      detailHtml: '<p>Colunas com tamanho fixo (<code>int</code>, <code>char</code>, <code>datetime</code>…) e colunas <code>bit</code> empacotadas.</p>' +
        '<ul class="small mb-2">' +
        '<li><strong>Heap:</strong> ordem do <code>CREATE TABLE</code> (fixos antes dos variáveis).</li>' +
        '<li><strong>Clustered:</strong> chaves do índice clustered vêm primeiro fisicamente.</li>' +
        '</ul><p class="mb-0">Imediatamente após o header de 4 B na ordem física do disco.</p>'
    },
    nullColCount: {
      detailMode: 'popover',
      detailTitle: 'Contagem de colunas (2 B)',
      summaryPt: '2 bytes antes do null bitmap — total de colunas na linha.',
      detailHtml: '<p><code>ushort</code> little-endian com o número de colunas do registro.</p>' +
        '<p class="mb-0">No modelo SqlHelp estes 2 B fazem parte do header lógico de 12 B; fisicamente ficam <strong>após</strong> os dados fixos e <strong>antes</strong> do bitmap.</p>'
    },
    nullBitmap: {
      detailMode: 'popover',
      detailTitle: 'Null bitmap',
      summaryPt: '1 bit por coluna (' + 'ceil(n/8)' + ') — otimização para detectar NULL sem valor sentinela.',
      detailHtml: '<p>Desde o SQL Server 2005: <strong>1 bit por coluna</strong>, nullable ou não (diferente do 2000).</p>' +
        '<p>Bits 1 em posições sem coluna = padding/clareza. Bit 0 = coluna não nula; bit 1 = NULL.</p>' +
        '<p class="mb-0">Evita comparar cada coluna fixa com valor NULL especial — ganho de CPU em leituras.</p>'
    },
    varColCount: {
      detailMode: 'popover',
      detailTitle: 'Contador colunas variáveis',
      summaryPt: '2 B — quantidade de colunas varchar/nvarchar/varbinary na linha.',
      detailHtml: '<p>Início da seção variável. Seguido pelo array de offsets (2 B × N) e pelos dados/ponteiros.</p>'
    },
    varOffsets: {
      detailMode: 'popover',
      detailTitle: 'Array de offsets variáveis',
      summaryPt: '2 B × N — cada entrada aponta para o fim (não o início) do valor da coluna.',
      detailHtml: '<p>Cada offset indica onde <strong>termina</strong> o valor — o comprimento é a diferença entre offsets consecutivos.</p>' +
        '<p class="mb-0">Ex.: offsets <code>0x0016</code> e <code>0x0021</code> → primeira coluna ocupa bytes entre o fim do bloco anterior e 0x16.</p>'
    },
    varData: {
      detailMode: 'popover',
      detailTitle: 'Dados variáveis / ponteiros',
      summaryPt: 'Payload in-row, ponteiro LOB (16 B) ou overflow (24 B). Limite ~8060 B in-row.',
      detailHtml: '<p>Valores <code>varchar</code>/<code>nvarchar</code>/<code>varbinary</code> in-row ou ponteiros quando:</p>' +
        '<ul class="small mb-2">' +
        '<li><strong>LOB</strong> — 16 B na linha (dados em páginas LOB).</li>' +
        '<li><strong>Overflow</strong> — 24 B (row &gt; 8060 B; colunas empurradas).</li>' +
        '</ul><p class="mb-0">Ver <a href="' + MS_RECORD_URL + '" target="_blank" rel="noopener">MS Learn — Pages and extents</a>.</p>'
    },
    versionTag: {
      detailMode: 'popover',
      detailTitle: 'Tag de versionamento (opcional, 14 B)',
      summaryPt: 'Opcional: RCSI/snapshot — 14 B (timestamp + ponteiro version store). Não incluído no cálculo SqlHelp.',
      detailHtml: '<p>Presente quando versionamento de linha está ativo (RCSI, snapshot isolation, online index build).</p>' +
        '<p>Bit 6 do TagA indica presença. Estrutura: timestamp + ponteiro para o version store no <code>tempdb</code>.</p>' +
        '<p class="mb-0 small"><strong>SQL Server 2025:</strong> optimized locking pode expor TID/Version Information no <code>DBCC PAGE</code> — fora do modelo de projeção desta ferramenta.</p>'
    }
  };

  function enrichRowStructureFields(fields) {
    return fields.map(function (f) {
      var d = RECORD_STRUCTURE_FIELD_DETAILS[f.id];
      if (!d) return Object.assign({}, f);
      var out = Object.assign({}, f);
      if (d.summaryPt) out.description = d.summaryPt;
      out.detailMode = d.detailMode;
      out.detailTitle = d.detailTitle || f.label;
      out.detailHtml = d.detailHtml;
      return out;
    });
  }

  global.GrowthRecordDetails = {
    SQLSKILLS_RECORD_URL: SQLSKILLS_RECORD_URL,
    MS_RECORD_URL: MS_RECORD_URL,
    RECORD_STRUCTURE_FIELD_DETAILS: RECORD_STRUCTURE_FIELD_DETAILS,
    enrichRowStructureFields: enrichRowStructureFields
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
