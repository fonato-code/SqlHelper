(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_tamanho_maximo_de_uma_linha_na_tabela = {
    id: "tamanho-maximo-de-uma-linha-na-tabela",
    title: "tamanho maximo de uma linha na tabela",
    tags: ["TABELA"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	go
	create or alter function dbo.getColumnSize (@typeName SYSNAME, @max_length INT, @precision INT)
	RETURNS INT
	AS
	BEGIN
		RETURN (SELECT 
		CASE @typeName
			WHEN 'tinyint'          THEN 1
			WHEN 'smallint'         THEN 2
			WHEN 'int'              THEN 4
			WHEN 'bigint'           THEN 8
			WHEN 'bit'              THEN 0.125
			WHEN 'decimal' THEN 
				case	when @precision >= 29 then 17 
						when @precision >= 20 then 13
						when @precision >= 10 then 9
						else 5
				end 
			WHEN 'numeric'          THEN
				case	when @precision >= 29 then 17 
						when @precision >= 20 then 13
						when @precision >= 10 then 9
						else 5
				end 
			WHEN 'money'            THEN 8
			WHEN 'smallmoney'       THEN 4

			WHEN 'real'             THEN 4
			WHEN 'float'            THEN 
				CASE	WHEN @precision >=25 THEN 8 
						ELSE 4 
				END

			WHEN 'date'             THEN 3
			WHEN 'time'             THEN 
				case	when @precision >= 14 then 5
						when @precision >= 12 then 4
						else 3
				end 
			WHEN 'datetime2'        THEN 
				case	when @precision < 3 then 6
						when @precision < 4 then 7
						else 8
				end 
			WHEN 'datetimeoffset'   THEN 
				case	when @precision >= 32 then 10
						when @precision >= 30 then 9
						else 8
				end 
			WHEN 'datetime'         THEN 8
			WHEN 'smalldatetime'    THEN 4


			WHEN 'timestamp'        THEN 10 -- treated as vabinary(8)

			WHEN 'binary'           THEN @max_length
			WHEN 'varbinary'        THEN @max_length + 2
			
			WHEN 'char'             THEN @max_length
			WHEN 'varchar'          THEN @max_length + 2
			WHEN 'nchar'            THEN @max_length
			WHEN 'nvarchar'         THEN @max_length + 2

			WHEN 'uniqueidentifier' THEN 16
		END)
	END
	go
	select SchemaName
		,	ObjectName
		,	SUM(CEILING(Bytes))+4+2+2+2+(ceiling(count(distinct columnname)*1.0/8.0)) As RowSize
	from (
		select s.name as SchemaName, o.name AS ObjectName, c.name as ColumnName, t.name as TypeName
			, dbo.getColumnSize(t.name,c.max_length, c.precision) AS Bytes
		from sys.objects o
			inner join sys.schemas s on s.schema_id=o.schema_id
			inner join sys.columns c on o.object_id=c.object_id
			inner join sys.types t on c.system_type_id=t.system_type_id
				and t.user_type_id=c.user_type_id
		where o.type='U'
			AND RIGHT(t.name,4) != 'text'
		UNION ALL
		select s.name as SchemaName, o.name AS ObjectName, c.name as ColumnName, t.name as TypeName
			, dbo.getColumnSize(t.name,c.max_length, c.precision) AS Bytes
		from sys.objects o
			inner join sys.schemas s on s.schema_id=o.schema_id
			inner join sys.indexes i on i.object_id = o.object_id
			inner join sys.index_columns ic on ic.object_id = o.object_id
				and i.index_id = ic.index_id
			inner join sys.columns c on o.object_id=c.object_id
				and ic.column_id = c.column_id
			inner join sys.types t on c.system_type_id=t.system_type_id
				and t.user_type_id=c.user_type_id
		where o.type='U'
			AND RIGHT(t.name,4) != 'text'
		) Z
	group by SchemaName, ObjectName` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
