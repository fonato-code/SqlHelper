/* eslint-disable no-console */
'use strict';
var path = require('path');
var fs = require('fs');

global.SqlHelp = {};
require(path.join(__dirname, '../src/js/sqlhelp-sql.js'));
require(path.join(__dirname, '../src/js/growth-page-header-details.js'));
require(path.join(__dirname, '../src/js/growth-record-details.js'));
require(path.join(__dirname, '../src/js/sqlhelp-growth-lib.js'));

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

function col(name, type, length, prec, scale) {
  return {
    name: name,
    type: type,
    length: length != null ? length : null,
    prec: prec != null ? prec : 0,
    scale: scale != null ? scale : 0,
    nullable: true,
    isIdentity: false
  };
}

// 8 bit columns => 1 byte packed (not 8)
var bits = [];
for (var i = 0; i < 8; i++) bits.push(col('B' + i, 'bit', 1, 1, 0));
var layoutBits = SqlHelp.computeSqlServerRowLayout(bits, {});
assert(layoutBits.fixedData.bitPackedBytes === 1, '8 bits => 1 byte packed');
assert(layoutBits.totalBytes < 30, '8 bits row is small');

// varchar(10) structural max => 12 bytes in variable section (2+10)
var layoutVarchar = SqlHelp.computeSqlServerRowLayout([col('X', 'varchar', 10)], {});
var varEntry = layoutVarchar.variableSection.entries[0];
assert(varEntry.payload === 10, 'varchar(10) payload 10');
assert(varEntry.bytesInRow === 12, 'varchar(10) in-row 12 bytes');

// varchar(10) min scenario => 3 bytes (2+1)
var layoutMin = SqlHelp.computeSqlServerRowLayout([col('X', 'varchar', 10)], { scenario: 'min' });
assert(layoutMin.variableSection.entries[0].bytesInRow === 3, 'varchar(10) min => 3 bytes');

// varchar(max) structural => tries in-row 8000 or lob
var layoutMax = SqlHelp.computeSqlServerRowLayout([col('L', 'varchar', -1)], {});
var lobEntry = layoutMax.variableSection.entries[0];
assert(
  lobEntry.storageMode === 'lob_root' || lobEntry.payload === 8000,
  'varchar(max) lob or 8000 in-row attempt'
);

// Synthetic wide row triggers overflow or lob
var wideCols = [];
for (var w = 0; w < 900; w++) {
  wideCols.push(col('C' + w, 'varchar', 20));
}
var layoutWide = SqlHelp.computeSqlServerRowLayout(wideCols, {});
var hasOffrow = layoutWide.overflowColumns.length > 0 || layoutWide.lobColumns.length > 0;
assert(hasOffrow || layoutWide.exceedsRowLimit, 'wide table uses overflow/lob or exceeds 8060');

// analyzeTable integration
var text = fs.readFileSync(path.join(__dirname, '../samples/crescimento-exemplo.log'), 'utf8');
var parsed = SqlHelp.parseGrowthLog(text, 'test');
var analysis = SqlHelp.analyzeDatabase(parsed);
var tiny = analysis.tables.find(function (t) { return t.name === 'EXEMPLO_TINYINT'; });
assert(tiny.rowLayout.totalBytes > 0, 'rowLayout on table');
assert(typeof tiny.rowLayout.rowSizePotencial === 'number' && tiny.rowLayout.rowSizePotencial > 0, 'rowSizePotencial');

var potOne = SqlHelp.computeRowSizePotencial([col('X', 'varchar', 10)]);
assert(potOne === 12 + 10 + 1, 'varchar(10) potencial: 12 + overhead 10 + null 1 = 23');
assert(tiny.scenarios.min.dataRowBytes < tiny.scenarios.max.dataRowBytes, 'min < max data row');
assert(tiny.potencial && tiny.potencial.bytesPerRow >= tiny.rowLayout.rowSizePotencial, 'table has potencial projection');
assert(tiny.potencial.dataRowBytes === tiny.rowLayout.rowSizePotencial, 'potencial bytesPerRow uses rowSizePotencial');

var potProj = tiny.potencial.projections[1000000];
if (tiny.pk.maxRows != null) {
  assert(potProj.cappedByPk, 'potencial projection capped by PK when applicable');
  assert(potProj.effectiveRows === tiny.pk.maxRows, 'potencial effective rows respects PK max');
}
assert(
  analysis.dbTotals.potencial &&
  analysis.dbTotals.potencial.projections[1000] &&
  analysis.dbTotals.potencial.projections[1000].totalBytes > 0,
  'dbTotals has potencial row'
);

// PAGE_HEADER_FIELDS sum to 96 bytes
var phSum = SqlHelp.PAGE_HEADER_FIELDS.reduce(function (s, f) { return s + f.bytes; }, 0);
assert(phSum === 96, 'PAGE_HEADER_FIELDS sum = 96 (got ' + phSum + ')');

// buildSlotArrayDetail: single row => offset 96, 2 bytes per slot
var slotOne = SqlHelp.buildSlotArrayDetail(1, tiny.rowLayout.totalBytes);
assert(slotOne.slots.length === 1, 'single slot shown');
assert(slotOne.slots[0].offsetValue === 96, 'first row offset = 96');
assert(slotOne.bytesPerSlot === 2, 'slot size = 2 bytes');
assert(slotOne.totalBytes === 2, 'one slot = 2 bytes total');

var slotMany = SqlHelp.buildSlotArrayDetail(12, 100);
assert(slotMany.slotsShown === 8 && slotMany.hasMore, 'max 8 slots displayed when count > 8');
assert(slotMany.slots[0].offsetValue === 96, 'first slot offset still 96');
assert(slotMany.slots[1].offsetValue === 196, 'second row contiguous at 96+100');

var pageDiag = tiny.rowLayout.pageDiagram;
assert(pageDiag.pageHeaderDetail && pageDiag.pageHeaderDetail.total === 96, 'pageDiagram has header detail');

var phFields = pageDiag.pageHeaderDetail.fields;
var typeField = phFields.find(function (f) { return f.id === 'type'; });
var pageIdField = phFields.find(function (f) { return f.id === 'pageId'; });
assert(typeField && typeField.detailMode === 'modal', 'm_type has modal detail');
assert(pageIdField && pageIdField.detailMode === 'popover', 'm_pageId has popover detail');
assert(pageDiag.pageHeaderDetail.attributionUrl, 'SQLskills attribution URL');
assert(pageDiag.slotArrayDetail && pageDiag.slotArrayDetail.slots.length >= 1, 'pageDiagram has slot detail');

var rsDetail = tiny.rowLayout.rowDiagram.rowStructureDetail;
var rsSum = rsDetail.fields.reduce(function (s, f) { return s + f.bytes; }, 0);
assert(rsSum === tiny.rowLayout.totalBytes, 'rowStructureDetail sums to totalBytes');
assert(rsDetail.fields[0].offset === 0, 'row structure starts at offset 0');
assert(rsDetail.fields[0].id === 'recordHeader', 'first field is physical record header');
var fixedIdx = rsDetail.fields.findIndex(function (f) { return f.id === 'fixedData'; });
var headerIdx = rsDetail.fields.findIndex(function (f) { return f.id === 'recordHeader'; });
assert(fixedIdx > headerIdx, 'fixed data after record header (physical order)');
var rsHeader = rsDetail.fields.find(function (f) { return f.id === 'recordHeader'; });
var rsType = rsDetail.fields.find(function (f) { return f.id === 'recordType'; });
assert(rsHeader && rsHeader.detailMode === 'popover', 'recordHeader has popover detail');
assert(rsType && rsType.detailMode === 'modal', 'recordType has modal detail');
assert(rsDetail.attributionUrl && rsDetail.learnUrl, 'row structure SQLskills + MS Learn URLs');

assert(SqlHelp.GROWTH_DOCS && SqlHelp.GROWTH_DOCS.sections.length >= 3, 'GROWTH_DOCS sections');
assert(SqlHelp.getGrowthDoc('storageMode', 'lob_root').url.indexOf('learn.microsoft.com') !== -1, 'LOB doc URL');
assert(SqlHelp.getGrowthTypeDocUrl('varchar').indexOf('char-and-varchar') !== -1, 'varchar type doc');
assert(SqlHelp.getGrowthTypeDocUrl('unknown_type_xyz').indexOf('learn.microsoft.com') !== -1, 'fallback type doc');

console.log(failed ? '\n' + failed + ' test(s) failed' : '\nAll tests passed');
process.exit(failed ? 1 : 0);
