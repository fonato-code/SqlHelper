(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};
  const SAMPLE_STATISTICS = `SQL Server parse and compile time:
CPU time = 0 ms, elapsed time = 0 ms.

(10 linhas afetadas)
Table 'MAO_STATUS_OUVIDORIA'. Scan count 1, logical reads 2, physical reads 0, page server reads 0, read-ahead reads 0, page server read-ahead reads 0, lob logical reads 0, lob physical reads 0, lob page server reads 0, lob read-ahead reads 0, lob page server read-ahead reads 0.
SQL Server Execution Times:
CPU time = 0 ms,  elapsed time = 1 ms.

(10 linhas afetadas)
Table 'MAO_STATUS_OUVIDORIA'. Scan count 1, logical reads 2, physical reads 0, page server reads 0, read-ahead reads 0, page server read-ahead reads 0, lob logical reads 0, lob physical reads 0, lob page server reads 0, lob read-ahead reads 0, lob page server read-ahead reads 0.
SQL Server Execution Times:
CPU time = 0 ms,  elapsed time = 441 ms.

(10 linhas afetadas)
Table 'MAO_STATUS_OUVIDORIA'. Scan count 1, logical reads 2, physical reads 0, page server reads 0, read-ahead reads 0, page server read-ahead reads 0, lob logical reads 0, lob physical reads 0, lob page server reads 0, lob read-ahead reads 0, lob page server read-ahead reads 0.
SQL Server Execution Times:
CPU time = 0 ms,  elapsed time = 445 ms.

(10 linhas afetadas)
Table 'PEDIDOS'. Scan count 2, logical reads 1500, physical reads 12, page server reads 0, read-ahead reads 8, page server read-ahead reads 0, lob logical reads 0, lob physical reads 0, lob page server reads 0, lob read-ahead reads 0, lob page server read-ahead reads 0.
SQL Server Execution Times:
CPU time = 63 ms,  elapsed time = 589 ms.

(10 linhas afetadas)
Table 'MAO_STATUS_OUVIDORIA'. Scan count 1, logical reads 2, physical reads 1, page server reads 0, read-ahead reads 0, page server read-ahead reads 0, lob logical reads 0, lob physical reads 0, lob page server reads 0, lob read-ahead reads 0, lob page server read-ahead reads 0.
SQL Server Execution Times:
CPU time = 62 ms,  elapsed time = 242 ms.

Horário de conclusão: 2026-05-19T19:43:04.9740822-03:00`;
   function normalizeStatsText(text) {
   return String(text || '')
     .replace(/\u00a0/g, ' ')
     .replace(/\r\n/g, '\n');
 }
   function simplifyStatsTableName(name) {
   if (!name || name.charAt(0) !== '#') return name;
   return name.replace(/_+[0-9A-Fa-f]+$/, '');
 }
   function parseStatisticsOutput(text) {
   const normalized = normalizeStatsText(text);
   const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0);
     const rowsRe = /^\((\d+)\s+(?:linhas?\s+afetadas|rows?\s+affected)\)/i;
   const tableRe = /^Table\s+'([^']+)'\.\s*Scan count\s+(\d+),\s*logical reads\s+(\d+),\s*physical reads\s+(\d+)(?:,\s*page server reads\s+(\d+))?(?:,\s*read-ahead reads\s+(\d+))?/i;
   const timeRe = /CPU time\s*=\s*(\d+)\s*ms,?\s*elapsed time\s*=\s*(\d+)\s*ms/i;
   const parseCompileHeader = /SQL Server parse and compile time/i;
   const execTimesHeader = /SQL Server Execution Times/i;
     const result = {
     parseCompile: null,
     batches: [],
     tableAggregates: [],
     hotBatches: [],
     completionTime: '',
     totals: {
       cpuMs: 0,
       elapsedMs: 0,
       logicalReads: 0,
       physicalReads: 0,
       rowsAffected: 0
     },
     maxLogicalReads: 1,
     maxPhysicalReads: 1,
     elapsedThreshold: 50
   };
     let pendingRows = null;
   let currentBatch = null;
   let expectParseCompileTime = false;
   let expectExecTime = false;
   let batchIndex = 0;
     function flushBatch() {
     if (!currentBatch) return;
     batchIndex += 1;
     currentBatch.index = batchIndex;
     result.batches.push(currentBatch);
     result.totals.cpuMs += currentBatch.cpuMs;
     result.totals.elapsedMs += currentBatch.elapsedMs;
     result.totals.logicalReads += currentBatch.logicalReads;
     result.totals.physicalReads += currentBatch.physicalReads;
     if (currentBatch.rowsAffected != null) {
       result.totals.rowsAffected += currentBatch.rowsAffected;
     }
     currentBatch = null;
   }
     for (const line of lines) {
     if (/^Horário de conclusão:/i.test(line)) {
       result.completionTime = line;
       continue;
     }
       if (parseCompileHeader.test(line)) {
       expectParseCompileTime = true;
       continue;
     }
       if (execTimesHeader.test(line)) {
       expectExecTime = true;
       continue;
     }
       const timeMatch = line.match(timeRe);
     if (timeMatch) {
       const cpu = parseInt(timeMatch[1], 10) || 0;
       const elapsed = parseInt(timeMatch[2], 10) || 0;
       if (expectParseCompileTime) {
         result.parseCompile = { cpuMs: cpu, elapsedMs: elapsed };
         expectParseCompileTime = false;
         continue;
       }
       if (expectExecTime && currentBatch) {
         currentBatch.cpuMs = cpu;
         currentBatch.elapsedMs = elapsed;
         expectExecTime = false;
         flushBatch();
         continue;
       }
       if (currentBatch && currentBatch.tableName) {
         currentBatch.cpuMs = cpu;
         currentBatch.elapsedMs = elapsed;
         flushBatch();
       }
       continue;
     }
       const rowsMatch = line.match(rowsRe);
     if (rowsMatch) {
       pendingRows = parseInt(rowsMatch[1], 10);
       continue;
     }
       const tableMatch = line.match(tableRe);
     if (tableMatch) {
       flushBatch();
       currentBatch = {
         tableName: simplifyStatsTableName(tableMatch[1]),
         scanCount: parseInt(tableMatch[2], 10) || 0,
         logicalReads: parseInt(tableMatch[3], 10) || 0,
         physicalReads: parseInt(tableMatch[4], 10) || 0,
         readAheadReads: parseInt(tableMatch[6], 10) || 0,
         rowsAffected: pendingRows,
         cpuMs: 0,
         elapsedMs: 0
       };
       pendingRows = null;
       expectExecTime = false;
       continue;
     }
   }
     flushBatch();
     if (!result.batches.length) {
     throw new Error('Nenhuma estatística IO/TIME encontrada. Cole o texto completo da aba Mensagens do SSMS.');
   }
     const tableMap = {};
   for (const b of result.batches) {
     const key = b.tableName || '(sem tabela)';
     if (!tableMap[key]) {
       tableMap[key] = {
         name: key,
         occurrences: 0,
         scanCount: 0,
         logicalReads: 0,
         physicalReads: 0,
         readAheadReads: 0,
         cpuMs: 0,
         elapsedMs: 0
       };
     }
     const t = tableMap[key];
     t.occurrences += 1;
     t.scanCount += b.scanCount;
     t.logicalReads += b.logicalReads;
     t.physicalReads += b.physicalReads;
     t.readAheadReads += b.readAheadReads;
     t.cpuMs += b.cpuMs;
     t.elapsedMs += b.elapsedMs;
   }
     result.tableAggregates = Object.values(tableMap)
     .sort((a, b) => b.logicalReads - a.logicalReads || b.elapsedMs - a.elapsedMs);
     result.maxLogicalReads = Math.max(1, ...result.tableAggregates.map(t => t.logicalReads));
   result.maxPhysicalReads = Math.max(1, ...result.tableAggregates.map(t => t.physicalReads));
     const maxElapsed = Math.max(...result.batches.map(b => b.elapsedMs));
   result.elapsedThreshold = maxElapsed > 100 ? Math.max(50, Math.floor(maxElapsed * 0.25)) : 1;
     result.hotBatches = result.batches
     .filter(b => b.elapsedMs > 0 || b.cpuMs > 0)
     .sort((a, b) => b.elapsedMs - a.elapsedMs || b.cpuMs - a.cpuMs || b.logicalReads - a.logicalReads)
     .slice(0, 20);
     return result;
 }
  SqlHelp.SAMPLE_STATISTICS = SAMPLE_STATISTICS;
  SqlHelp.normalizeStatsText = normalizeStatsText;
  SqlHelp.simplifyStatsTableName = simplifyStatsTableName;
  SqlHelp.parseStatisticsOutput = parseStatisticsOutput;
})(typeof window !== 'undefined' ? window : this);
