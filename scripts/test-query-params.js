'use strict';
const fs = require('fs');
const vm = require('vm');
const ctx = { window: {} };
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync('src/js/sqlhelp-query-params.js', 'utf8'), ctx);
const S = ctx.SqlHelp;

let failed = 0;
function ok(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    failed++;
  } else {
    console.log('OK:', name);
  }
}

const sql1 = "declare @t varchar(100)= @@{string:dbo.GRAVIDADE:teste}";
const p1 = S.parseQueryParams(sql1);
ok('parse string name', p1[0] && p1[0].name === 'teste');
ok('parse string default', p1[0] && p1[0].default === 'dbo.GRAVIDADE');

const sql2 = "x @@{array:['dbo.A','dbo.B']:sel} y";
const p2 = S.parseQueryParams(sql2);
ok('parse array options', p2[0] && p2[0].options.length === 2);
ok('parse array default', p2[0] && p2[0].default === 'dbo.A');

const applied = S.applyQueryParams(sql1, { teste: 'dbo.FUNCAO' });
ok('apply string', applied.includes("'dbo.FUNCAO'"));

const esc = S.applyQueryParams("@@{string:x:y}", { y: "O'Brien" });
ok('escape quotes', esc === "'O''Brien'");

const num = S.applyQueryParams("@@{number:0:n}", { n: 42 });
ok('apply number', num === '42');

const legacy = S.parseQueryParams("@@{string:'dbo.GRAVIDADE':t}");
ok('legacy quoted default', legacy[0] && legacy[0].default === 'dbo.GRAVIDADE');

process.exit(failed ? 1 : 0);
