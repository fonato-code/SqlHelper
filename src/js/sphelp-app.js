/* global Vue, SqlHelp, bootstrap */
(function () {
  'use strict';
  const { createApp } = Vue;
  createApp({
      data() {
        return {
          theme: localStorage.getItem('sqlhelp-theme') || 'dark',
          rawInput: '',
          parseError: '',
          parsed: false,
          completionTime: '',
          table: { name: '', schema: 'dbo', owner: '', type: '', created: '' },
          columns: [],
          indexes: [],
          constraints: [],
          primaryKey: { enabled: false, name: '', columns: [], clustered: true, _original: null },
          generatedSql: '',
          scriptWarnings: [],
          toastMessage: '',
          reseedIdentity: false,
          pkDragIndex: null,
          pkDragOverIndex: null,
          sqlTypes: [
            'bigint', 'binary', 'bit', 'char', 'date', 'datetime', 'datetime2',
            'datetimeoffset', 'decimal', 'float', 'geography', 'geometry', 'image',
            'int', 'money', 'nchar', 'ntext', 'numeric', 'nvarchar', 'real', 'smalldatetime',
            'smallint', 'smallmoney', 'sql_variant', 'text', 'time', 'timestamp',
            'tinyint', 'uniqueidentifier', 'varbinary', 'varchar', 'xml'
          ]
        };
      },
      computed: {
        otherConstraints() {
          return this.constraints
            .filter(c => !/^DEFAULT on column/i.test(c.type) && !/^PRIMARY KEY/i.test(c.type))
            .map(c => `${c.type} â€” ${c.name} (${c.keys})`);
        },
        nonPkIndexes() {
          const pkName = this.primaryKey.enabled ? this.primaryKey.name : '';
          return this.indexes.filter(ix => {
            if (pkName && ix.index_name === pkName) return false;
            if (/primary key/i.test(ix.index_description || '')) return false;
            return true;
          });
        },
        pkSelectableColumns() {
          return this.columns.filter(c => !c._deleted);
        },
        hasIdentityColumn() {
          return this.columns.some(c => c.isIdentity && !c._deleted);
        },
        identityColumns() {
          return this.columns.filter(c => c.isIdentity && !c._deleted);
        },
        pkMissing() {
          if (!this.primaryKey.enabled) return true;
          return SqlHelp.normalizePkColumns(this.primaryKey.columns).length === 0;
        }
      },
      methods: {

        loadSample() {
          this.rawInput = SqlHelp.SAMPLE_SP_HELP;
          this.parseError = '';
        },
        async parseInputFromClipboard() {
          this.parseError = '';
          try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) {
              this.parseError = 'Ãrea de transferÃªncia vazia. Copie o resultado do sp_help antes de clicar.';
              return;
            }
            this.rawInput = text;
            this.parseInput();
          } catch (e) {
            if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
              this.parseError = 'NÃ£o foi possÃ­vel ler a Ã¡rea de transferÃªncia. Permita o acesso ao colar ou use o botÃ£o Analisar apÃ³s colar no campo acima.';
            } else {
              this.parseError = e.message || 'Erro ao ler a Ã¡rea de transferÃªncia.';
            }
          }
        },
        parseInput() {
          this.parseError = '';
          try {
            const data = SqlHelp.parseSpHelp(this.rawInput);
            this.table = { ...data.table };
            this.columns = data.columns;
            this.indexes = data.indexes;
            this.constraints = data.constraints;
            this.primaryKey = { ...data.primaryKey, _original: null };
            this.primaryKey.columns = SqlHelp.normalizePkColumns(this.primaryKey.columns);
            this.primaryKey._original = SqlHelp.snapshotPrimaryKey(this.primaryKey);
            this.completionTime = data.completionTime;
            this.parsed = true;
            this.reseedIdentity = false;
            this.generatedSql = '';
            this.scriptWarnings = [];
          } catch (e) {
            this.parseError = e.message || 'Erro ao analisar o texto.';
          }
        },
        reset() {
          this.parsed = false;
          this.reseedIdentity = false;
          this.generatedSql = '';
          this.scriptWarnings = [];
        },
        identityVarType(col) {
          const t = (col.type || '').toLowerCase();
          if (['bigint', 'int', 'smallint', 'tinyint', 'decimal', 'numeric'].includes(t)) return t;
          return 'bigint';
        },
        colNeedsLength(type) {
          return SqlHelp.LENGTH_TYPES.includes((type || '').toLowerCase());
        },
        colNeedsPrecScale(type) {
          const t = (type || '').toLowerCase();
          return SqlHelp.PRECSCALE_TYPES.includes(t) || SqlHelp.SCALE_TYPES.includes(t);
        },
        onTypeChange(col) {
          if (!this.colNeedsLength(col.type)) {
            col.lengthDisplay = '';
            col.length = null;
          }
          if (!this.colNeedsPrecScale(col.type)) {
            col.prec = null;
            col.scale = 0;
          }
          this.markModified(col);
        },
        onLengthInput(col) {
          const v = (col.lengthDisplay || '').trim().toUpperCase();
          col.length = v === 'MAX' ? -1 : (parseInt(v, 10) || null);
          this.markModified(col);
        },
        markModified(col) {
          if (col._status === 'new' || col._deleted) return;
          if (col._original && !SqlHelp.columnsEqual(col, col._original)) {
            col._status = 'modified';
          } else {
            col._status = 'unchanged';
          }
        },
        isIdentityBlocked(col) {
          const holder = this.columns.find(c => c.isIdentity && !c._deleted);
          return !!(holder && holder._id !== col._id);
        },
        toggleIdentity(col, checked) {
          if (checked) {
            this.columns.forEach(c => {
              if (c._id !== col._id && c.isIdentity) {
                c.isIdentity = false;
                this.markModified(c);
              }
            });
            col.isIdentity = true;
            col.nullable = false;
            col.identitySeed = col.identitySeed ?? 1;
            col.identityIncrement = col.identityIncrement || 1;
            if (col._status !== 'new') col.identityPreserveValues = true;
          } else {
            col.isIdentity = false;
          }
          this.markModified(col);
        },
        addColumn() {
          this.columns.push({
            _id: SqlHelp.nextId(),
            _status: 'new',
            _deleted: false,
            _original: null,
            name: 'NOVA_COLUNA',
            type: 'int',
            computed: false,
            length: null,
            lengthDisplay: '',
            prec: null,
            scale: 0,
            nullable: true,
            collation: null,
            isIdentity: false,
            identitySeed: 1,
            identityIncrement: 1,
            identityPreserveValues: false,
            hasDefault: false,
            defaultValue: '',
            defaultConstraintName: '',
            nullReplacement: ''
          });
        },
        toggleDefault(col, checked) {
          col.hasDefault = checked;
          if (checked && !col.defaultConstraintName && this.table.name) {
            const t = (this.table.name || 'TBL').replace(/[^a-zA-Z0-9_]/g, '_');
            const c = (col.name || 'COL').replace(/[^a-zA-Z0-9_]/g, '_');
            col.defaultConstraintName = `DF_${t}_${c}`;
          }
          this.markModified(col);
        },
        needsNullReplacement(col) {
          if (col._deleted || col.nullable || col._status === 'new') return false;
          const orig = col._original;
          return !!(orig && orig.nullable && !col.nullable);
        },
        toggleDelete(col) {
          if (col._status === 'new') {
            this.columns = this.columns.filter(c => c._id !== col._id);
            return;
          }
          col._deleted = !col._deleted;
          if (col._deleted) col._status = 'modified';
          else this.markModified(col);
        },
        qualifiedTable() {
          const schema = (this.table.schema || 'dbo').trim();
          const name = (this.table.name || '').trim();
          return `[${schema}].[${name}]`;
        },
        onPrimaryKeyToggle() {
          if (this.primaryKey.enabled && !this.primaryKey.name) {
            const s = (this.table.schema || 'dbo').replace(/[^a-zA-Z0-9_]/g, '_');
            const t = (this.table.name || 'TBL').replace(/[^a-zA-Z0-9_]/g, '_');
            this.primaryKey.name = `PK_${s}_${t}`;
          }
          if (!this.primaryKey.enabled) {
            this.primaryKey.columns = [];
          }
        },
        isPkColumnSelected(name) {
          return this.primaryKey.columns.some(c => c.name === name);
        },
        togglePkColumn(name, checked) {
          if (checked) {
            if (!this.isPkColumnSelected(name)) {
              this.primaryKey.columns.push({ name, direction: 'ASC' });
            }
          } else {
            this.primaryKey.columns = this.primaryKey.columns.filter(c => c.name !== name);
          }
        },
        pkDragStart(idx, ev) {
          this.pkDragIndex = idx;
          if (ev && ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(idx));
          }
        },
        pkDragEnd() {
          this.pkDragIndex = null;
          this.pkDragOverIndex = null;
        },
        pkDragLeave(idx) {
          if (this.pkDragOverIndex === idx) this.pkDragOverIndex = null;
        },
        pkDrop(dropIdx) {
          const from = this.pkDragIndex;
          if (from === null || from === dropIdx) {
            this.pkDragEnd();
            return;
          }
          const cols = [...this.primaryKey.columns];
          const [item] = cols.splice(from, 1);
          cols.splice(dropIdx, 0, item);
          this.primaryKey.columns = cols;
          this.pkDragEnd();
        },
        pkExistsInDatabase() {
          const o = this.primaryKey._original;
          return !!(o && o.enabled && o.name);
        },
        getPkConstraintNameForDrop() {
          const o = this.primaryKey._original;
          if (o && o.enabled && o.name) return o.name.trim();
          return '';
        },
        isColumnInOriginalPk(colName) {
          const o = this.primaryKey._original;
          return !!(o && o.enabled && SqlHelp.pkColumnNames(o.columns).includes(colName));
        },
        appendDropPkConstraint(lines, qTable, colName, pkAlreadyDropped) {
          if (pkAlreadyDropped) return false;
          if (!this.pkExistsInDatabase()) return false;
          if (!this.isColumnInOriginalPk(colName)) return false;
          const pkName = this.getPkConstraintNameForDrop();
          if (!pkName) return false;
          lines.push(`-- Remover PK existente no banco (coluna [${colName}] faz parte da chave)`);
          lines.push(`ALTER TABLE ${qTable} DROP CONSTRAINT [${pkName}];`);
          lines.push('GO');
          return true;
        },
        appendAddPkConstraint(lines, qTable, schema, table, isRecreate) {
          if (!this.primaryKey.enabled) return false;
          const validCols = SqlHelp.normalizePkColumns(this.primaryKey.columns).filter(item => {
            return this.columns.some(c => c.name === item.name && !c._deleted);
          });
          if (!validCols.length) return false;
          const pkType = this.primaryKey.clustered ? 'CLUSTERED' : 'NONCLUSTERED';
          const colsSql = validCols.map(c => `[${c.name}] ${c.direction || 'ASC'}`).join(', ');
          const pkName = (this.primaryKey.name && this.primaryKey.name.trim()) ||
            `PK_${schema}_${table}`.replace(/[^a-zA-Z0-9_]/g, '_');
          lines.push(isRecreate ? '-- Recriar Primary Key' : '-- Criar Primary Key');
          lines.push(`ALTER TABLE ${qTable} ADD CONSTRAINT [${pkName}] PRIMARY KEY ${pkType} (${colsSql});`);
          lines.push('GO');
          return true;
        },
        shouldAddPkAtEnd(pkRecreatedInline) {
          if (!this.primaryKey.enabled || pkRecreatedInline) return false;
          if (!this.pkExistsInDatabase()) return true;
          return this.primaryKeyChanged() || this.needsDropPrimaryKeyFirst();
        },
        appendAddIdentityScript(lines, col, qTable, schema, table, pkAlreadyDropped) {
          const preserve = col.identityPreserveValues !== false;
          let pkDropped = this.appendDropPkConstraint(lines, qTable, col.name, pkAlreadyDropped);

          if (col.hasDefault && col.defaultConstraintName) {
            lines.push(`ALTER TABLE ${qTable} DROP CONSTRAINT [${col.defaultConstraintName}];`);
            lines.push('GO');
          }

          if (preserve) {
            const newTable = SqlHelp.sqlhelpNewTableName(table);
            const qNewTable = `[${schema}].[${newTable}]`;
            const activeCols = this.columns.filter(c => !c._deleted);

            lines.push(`-- Adicionar IDENTITY em [${col.name}] preservando valores (nova tabela + INSERT)`);
            lines.push(`-- IDENTITY nÃ£o permite UPDATE; IDENTITY_INSERT sÃ³ funciona com INSERT`);
            lines.push(`CREATE TABLE ${qNewTable} (`);
            activeCols.forEach((c, i) => {
              const comma = i < activeCols.length - 1 ? ',' : '';
              lines.push(`  ${SqlHelp.buildColumnDefinitionSql(c, col)}${comma}`);
            });
            lines.push(');');
            lines.push('GO');

            const colList = activeCols.map(c => `[${c.name}]`).join(', ');
            lines.push(`SET IDENTITY_INSERT ${qNewTable} ON;`);
            lines.push('GO');
            lines.push(`INSERT INTO ${qNewTable} (${colList})`);
            lines.push(`SELECT ${colList} FROM ${qTable};`);
            lines.push('GO');
            lines.push(`SET IDENTITY_INSERT ${qNewTable} OFF;`);
            lines.push('GO');
            lines.push(`DROP TABLE ${qTable};`);
            lines.push('GO');
            lines.push(`EXEC sp_rename N'${schema}.${newTable}', N'${table}', 'OBJECT';`);
            lines.push('GO');
          } else {
            const seed = col.identitySeed ?? 1;
            const inc = col.identityIncrement || 1;
            const tmp = SqlHelp.identityTempColumnName(col.name);
            const typeSql = SqlHelp.buildTypeSql(col);

            lines.push(`-- Adicionar IDENTITY em [${col.name}] (novos valores gerados pelo SQL Server)`);
            lines.push(`ALTER TABLE ${qTable} ADD [${tmp}] ${typeSql} IDENTITY(${seed}, ${inc}) NOT NULL;`);
            lines.push('GO');
            lines.push(`ALTER TABLE ${qTable} DROP COLUMN [${col.name}];`);
            lines.push('GO');
            lines.push(`EXEC sp_rename N'${schema}.${table}.${tmp}', N'${col.name}', 'COLUMN';`);
            lines.push('GO');
          }

          let pkRecreated = false;
          if (pkDropped || pkAlreadyDropped) {
            pkRecreated = this.appendAddPkConstraint(lines, qTable, schema, table, true);
          } else if (this.primaryKey.enabled && !this.pkExistsInDatabase()) {
            pkRecreated = this.appendAddPkConstraint(lines, qTable, schema, table, false);
          }
          lines.push('');
          return pkRecreated;
        },
        appendRemoveIdentityScript(lines, col, qTable, schema, table, pkAlreadyDropped) {
          const tmp = SqlHelp.identityTempColumnName(col.name);
          const typeSql = SqlHelp.buildTypeSql(col);
          let pkDropped = this.appendDropPkConstraint(lines, qTable, col.name, pkAlreadyDropped);

          lines.push(`-- Remover IDENTITY de [${col.name}] (recria sem identity)`);
          lines.push(`ALTER TABLE ${qTable} ADD [${tmp}] ${typeSql} NOT NULL;`);
          lines.push('GO');
          lines.push(`UPDATE ${qTable} SET [${tmp}] = [${col.name}];`);
          lines.push('GO');
          lines.push(`ALTER TABLE ${qTable} DROP COLUMN [${col.name}];`);
          lines.push('GO');
          lines.push(`EXEC sp_rename N'${schema}.${table}.${tmp}', N'${col.name}', 'COLUMN';`);
          lines.push('GO');

          let pkRecreated = false;
          if (pkDropped || pkAlreadyDropped) {
            pkRecreated = this.appendAddPkConstraint(lines, qTable, schema, table, true);
          } else if (this.primaryKey.enabled && !this.pkExistsInDatabase()) {
            pkRecreated = this.appendAddPkConstraint(lines, qTable, schema, table, false);
          }
          lines.push('');
          return pkRecreated;
        },
        primaryKeyChanged() {
          const o = this.primaryKey._original;
          if (!o) return this.primaryKey.enabled;
          return !SqlHelp.primaryKeyEqual(this.primaryKey, o);
        },
        needsDropPrimaryKeyFirst() {
          if (!this.pkExistsInDatabase()) return false;
          const o = this.primaryKey._original;
          if (!this.primaryKey.enabled) return true;
          if (this.primaryKeyChanged()) return true;
          const origPkNames = SqlHelp.pkColumnNames(o.columns);
          const deletedPkCol = this.columns.some(c => c._deleted && origPkNames.includes(c.name));
          const renamedPkCol = this.columns.some(c => {
            const orig = c._original;
            return orig && c.name !== orig.name && origPkNames.includes(orig.name);
          });
          return deletedPkCol || renamedPkCol;
        },
        generateScript() {
          const lines = [];
          const warnings = [];
          const schema = (this.table.schema || 'dbo').trim();
          const table = (this.table.name || '').trim();
          const qTable = this.qualifiedTable();

          lines.push('-- SqlHelp: script gerado a partir do sp_help');
          lines.push(`-- Tabela: ${qTable}`);
          lines.push(`-- Data: ${new Date().toISOString()}`);
          lines.push('');

          let hasChanges = false;
          const origPk = this.primaryKey._original;
          const allIdentityCols = this.columns.filter(c => c.isIdentity && !c._deleted);
          if (allIdentityCols.length > 1) {
            warnings.push('SQL Server permite apenas uma coluna IDENTITY por tabela. Desmarque as demais.');
          }

          let pkDroppedEarly = false;
          let pkRecreatedInline = false;

          if (this.needsDropPrimaryKeyFirst()) {
            hasChanges = true;
            lines.push('-- Remover primary key existente');
            lines.push(`ALTER TABLE ${qTable} DROP CONSTRAINT [${origPk.name}];`);
            lines.push('GO');
            lines.push('');
            pkDroppedEarly = true;
          }

          // RemoÃ§Ãµes
          for (const col of this.columns.filter(c => c._deleted && c._status !== 'new')) {
            hasChanges = true;
            if (col.defaultConstraintName) {
              lines.push(`ALTER TABLE ${qTable} DROP CONSTRAINT [${col.defaultConstraintName}];`);
              lines.push('GO');
            }
            lines.push(`ALTER TABLE ${qTable} DROP COLUMN [${col.name}];`);
            lines.push('GO');
            lines.push('');
          }

          // RenomeaÃ§Ãµes e alteraÃ§Ãµes
          for (const col of this.columns.filter(c => !c._deleted && c._status !== 'new')) {
            const orig = col._original;
            if (!orig) continue;

            if (col.name !== orig.name) {
              hasChanges = true;
              lines.push(`EXEC sp_rename N'${schema}.${table}.${orig.name}', N'${col.name}', 'COLUMN';`);
              lines.push('GO');
              warnings.push(`Renomear coluna ${orig.name} â†’ ${col.name}: confira dependÃªncias (Ã­ndices, FK, views).`);
            }

            const typeChanged = col.type !== orig.type ||
              (col.lengthDisplay || '') !== (orig.lengthDisplay || '') ||
              col.prec !== orig.prec ||
              col.scale !== orig.scale;
            const nullChanged = col.nullable !== orig.nullable;
            const defChanged = !!col.hasDefault !== !!orig.hasDefault ||
              (col.hasDefault && (
                (col.defaultValue || '') !== (orig.defaultValue || '') ||
                (col.defaultConstraintName || '') !== (orig.defaultConstraintName || '')
              ));

            const goingNotNull = orig.nullable && !col.nullable;
            if ((typeChanged || nullChanged) && goingNotNull) {
              const replSql = SqlHelp.formatNullReplacementSql(col.nullReplacement, col.type);
              if (replSql) {
                hasChanges = true;
                lines.push(`-- Preencher NULL em [${col.name}] antes de NOT NULL`);
                lines.push(`UPDATE ${qTable} SET [${col.name}] = ${replSql} WHERE [${col.name}] IS NULL;`);
                lines.push('GO');
                lines.push('');
              } else {
                warnings.push(`Coluna [${col.name}]: informe "Subst. NULL" para atualizar registros nulos antes do NOT NULL.`);
              }
            }

            const identityToggled = col.isIdentity !== orig.isIdentity;
            const identityPropsChanged = col.isIdentity && orig.isIdentity &&
              (col.identitySeed !== orig.identitySeed || col.identityIncrement !== orig.identityIncrement);

            if (identityToggled && !col._deleted && allIdentityCols.length <= 1) {
              hasChanges = true;
              if (col.isIdentity && !orig.isIdentity) {
                if (this.appendAddIdentityScript(lines, col, qTable, schema, table, pkDroppedEarly)) {
                  pkRecreatedInline = true;
                }
                if (col.identityPreserveValues !== false) {
                  warnings.push(`Identity em [${col.name}]: tabela recriada â€” revise FK, defaults e permissÃµes.`);
                } else {
                  warnings.push(`Identity em [${col.name}]: valores antigos de [${col.name}] serÃ£o descartados (novos IDs).`);
                }
              } else if (!col.isIdentity && orig.isIdentity) {
                if (this.appendRemoveIdentityScript(lines, col, qTable, schema, table, pkDroppedEarly)) {
                  pkRecreatedInline = true;
                }
                warnings.push(`Identity removida de [${col.name}]: coluna recriada sem identity.`);
              }
            } else if (identityToggled && allIdentityCols.length > 1) {
              warnings.push(`Identity em [${col.name}]: ignorada â€” jÃ¡ existe outra coluna identity.`);
            } else if (identityPropsChanged) {
              warnings.push(`Alterar seed/increment de identity em [${col.name}] exige recriaÃ§Ã£o manual da coluna.`);
            }

            if ((typeChanged || nullChanged) && !identityToggled) {
              hasChanges = true;
              const typeSql = SqlHelp.buildTypeSql(col);
              const nullSql = col.nullable ? 'NULL' : 'NOT NULL';
              lines.push(`ALTER TABLE ${qTable} ALTER COLUMN [${col.name}] ${typeSql} ${nullSql};`);
              lines.push('GO');
            }

            if (defChanged) {
              hasChanges = true;
              const hadDefault = !!orig.hasDefault && orig.defaultConstraintName;
              const wantDefault = !!col.hasDefault && col.defaultValue && col.defaultValue.trim();
              if (hadDefault && (!wantDefault || orig.defaultConstraintName !== col.defaultConstraintName ||
                  (orig.defaultValue || '') !== (col.defaultValue || ''))) {
                lines.push(`ALTER TABLE ${qTable} DROP CONSTRAINT [${orig.defaultConstraintName}];`);
                lines.push('GO');
              }
              if (wantDefault) {
                const defName = (col.defaultConstraintName && col.defaultConstraintName.trim()) ||
                  `DF_${table}_${col.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
                if (!hadDefault || orig.defaultConstraintName !== col.defaultConstraintName ||
                    (orig.defaultValue || '') !== (col.defaultValue || '')) {
                  lines.push(`ALTER TABLE ${qTable} ADD CONSTRAINT [${defName}] DEFAULT ${col.defaultValue.trim()} FOR [${col.name}];`);
                  lines.push('GO');
                }
              } else if (col.hasDefault && !(col.defaultValue && col.defaultValue.trim())) {
                warnings.push(`Coluna [${col.name}]: default marcado sem valor â€” informe o valor ou desmarque o checkbox.`);
              }
            }
            lines.push('');
          }

          // Novas colunas
          for (const col of this.columns.filter(c => c._status === 'new' && !c._deleted)) {
            hasChanges = true;
            const typeSql = SqlHelp.buildTypeSql(col);
            const nullSql = col.nullable ? 'NULL' : 'NOT NULL';
            let line = `ALTER TABLE ${qTable} ADD [${col.name}] ${typeSql} ${nullSql}`;
            if (col.isIdentity && allIdentityCols.length <= 1) {
              line += ` IDENTITY(${col.identitySeed ?? 1}, ${col.identityIncrement || 1})`;
              warnings.push(`Nova coluna identity [${col.name}]: sÃ³ Ã© permitida em tabela vazia ou com cuidado extra.`);
            } else if (col.isIdentity) {
              warnings.push(`Nova coluna [${col.name}]: identity nÃ£o aplicada â€” jÃ¡ existe outra coluna identity.`);
            }
            line += ';';
            lines.push(line);
            lines.push('GO');
            if (col.hasDefault && col.defaultValue && col.defaultValue.trim()) {
              const defName = (col.defaultConstraintName && col.defaultConstraintName.trim()) ||
                `DF_${table}_${col.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
              lines.push(`ALTER TABLE ${qTable} ADD CONSTRAINT [${defName}] DEFAULT ${col.defaultValue.trim()} FOR [${col.name}];`);
              lines.push('GO');
            }
            lines.push('');
          }

          if (this.shouldAddPkAtEnd(pkRecreatedInline)) {
            const pkCols = SqlHelp.normalizePkColumns(this.primaryKey.columns);
            const validCols = pkCols.filter(item => {
              const col = this.columns.find(c => c.name === item.name && !c._deleted);
              return !!col;
            });
            const invalid = pkCols.filter(item => !validCols.some(v => v.name === item.name));
            if (invalid.length) {
              warnings.push(`PK: colunas invÃ¡lidas ou removidas (${invalid.map(i => i.name).join(', ')}). Atualize a seleÃ§Ã£o.`);
            }
            if (validCols.length) {
              hasChanges = true;
              const isRecreate = this.pkExistsInDatabase() && (this.primaryKeyChanged() || this.needsDropPrimaryKeyFirst());
              this.appendAddPkConstraint(lines, qTable, schema, table, isRecreate);
              lines.push('');
            } else if (this.primaryKey.enabled) {
              warnings.push('Primary Key ativa sem colunas vÃ¡lidas selecionadas.');
            }
          } else if (!this.primaryKey.enabled && origPk && origPk.enabled && this.primaryKeyChanged()) {
            hasChanges = true;
          }

          if (this.reseedIdentity) {
            const identityCols = this.identityColumns;
            if (!identityCols.length) {
              warnings.push('Reseed identity marcado, mas nÃ£o hÃ¡ coluna identity na tabela.');
            } else {
              hasChanges = true;
              const fullTable = `${schema}.${table}`;
              lines.push('');
              lines.push('-- Reseed identity: prÃ³ximo INSERT = MAX(coluna) + increment');
              for (const col of identityCols) {
                const varName = '@max_' + col.name.replace(/[^a-zA-Z0-9_]/g, '_');
                const sqlType = this.identityVarType(col);
                lines.push(`DECLARE ${varName} ${sqlType};`);
                lines.push(`SELECT ${varName} = ISNULL(MAX([${col.name}]), 0) FROM ${qTable};`);
                lines.push(`DBCC CHECKIDENT ('${fullTable}', RESEED, ${varName});`);
                lines.push('GO');
                lines.push('');
              }
            }
          }

          if (!hasChanges) {
            lines.push('-- Nenhuma alteraÃ§Ã£o detectada em relaÃ§Ã£o ao sp_help original.');
            this.generatedSql = lines.join('\n');
          } else {
            lines.push('-- Revise o script antes de executar em produÃ§Ã£o.');
            this.generatedSql = SqlHelp.hasExecutableSqlLines(lines)
              ? SqlHelp.wrapScriptWithTransaction(lines, qTable)
              : lines.join('\n');
          }

          this.scriptWarnings = warnings;
        },
        copyScript() {
          if (!this.generatedSql) return;
          navigator.clipboard.writeText(this.generatedSql).then(() => {
            this.showToast('Script copiado para a Ã¡rea de transferÃªncia.');
          }).catch(() => {
            this.showToast('NÃ£o foi possÃ­vel copiar. Selecione o texto manualmente.');
          });
        },
        showToast(msg) {
          SqlHelp.showToast(this, msg);
        }
      },
      mixins: [SqlHelp.themeMixin]
    }).mount('#app');

})();