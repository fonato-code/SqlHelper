(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_transformar_tabela_em_classe = {
    id: "transformar-tabela-em-classe",
    title: "Transformar Tabela em classe",
    tags: ["TABELA"],
    blocks: [
      { type: 'sql', title: `Query`, sql: `	-- usar a saida de texto para copiar os dados 
	declare	@objname nvarchar(776) = 'ocorrencia_vitima'
		,	@isBaseModel bit ='true'

	set nocount on
	declare	@dbname	sysname
		,	@no varchar(35)
		,	@yes varchar(35)
		,	@none varchar(35)
	select	@no = 'no'
		,	@yes = 'yes'
		,	@none = 'none'

	declare @objid int
	declare @sysobj_type char(2)
	select @objid = object_id, @sysobj_type = type from sys.all_objects where object_id = object_id(@objname)

	declare @precscaletypes nvarchar(150)
	select @precscaletypes = N'tinyint,smallint,decimal,int,bigint,real,money,float,numeric,smallmoney,date,time,datetime2,datetimeoffset,'

	select	 CONVERT(VARCHAR(MAX), iif(@isBaseModel = 'true', '[Coluna("'+upper(ColumnName)+'")] ', '')+ 'public '+CSharpTypeName+ ' '+ PropertyName+ iif(IsNullable = 'true', '?', '')+ ' { get; set; }')
	from	(
		select	PropertyName
			,	IsNullable = case when is_nullable = 0 then @no else @yes end
			,	CSharpTypeName = CType.[typeName]
			,	ColumnName =  name
		from	sys.all_columns 
				cross apply (
					select	PropertyName = STRING_AGG(CONVERT(VARCHAR(MAX), Left(upper(palavra), 1)+right(LOWER(palavra), len(palavra)-1)), '')
					from	( select palavra = value from string_split(name, '_')) c
				) p
				inner join (values 
						('bigint', 'Int64', 'long', 'default')
					, ('binary', 'Byte[]', 'byte[]', 'default')
					, ('bit', 'Boolean', 'bool', 'default')
					, ('char', 'String', 'string', 'string.Empty')
					, ('date', 'DateTime', 'DateTime', 'default')
					, ('datetime', 'DateTime', 'DateTime', 'default')
					, ('datetime2', 'DateTime', 'DateTime', 'default')
					, ('datetimeoffset', 'DateTimeOffset', 'DateTimeOffset', 'default')
					, ('decimal', 'Decimal', 'decimal', 'default')
					, ('FILESTREAM', 'Byte[]', 'byte[]', 'default')
					, ('float', 'Double', 'double', 'default')
					, ('image', 'Byte[]', 'byte[]', 'default')
					, ('int', 'Int32', 'int', 'default')
					, ('money', 'Decimal', 'decimal', 'default')
					, ('nchar', 'String', 'string', 'string.Empty')
					, ('numeric', 'Decimal', 'decimal', 'default')
					, ('nvarchar', 'String', 'string', 'string.Empty')
					, ('ntext', 'String', 'string', 'string.Empty')
					, ('real', 'Single', 'Single', 'default')
					, ('rowversion', 'Byte[]', 'byte[]', 'default')
					, ('smalldatetime', 'DateTime', 'DateTime', 'default')
					, ('smallint', 'Int16', 'short', 'default')
					, ('smallmoney', 'Decimal', 'decimal', 'default')
					, ('sql_variant', 'Object', 'Object', 'default')
					, ('text', 'String', 'string', 'string.Empty')
					, ('timestamp', 'Byte[]', 'byte[]', 'default')
					, ('tinyint', 'Byte', 'byte', 'default')
					, ('uniqueidentifier', 'Guid', 'Guid', 'default')
					, ('varbinary', 'Byte[]', 'byte[]', 'default')
					, ('varchar', 'String', 'string', 'string.Empty')
					, ('time', 'TimeSpan', 'TimeSpan', 'default')
					, ('xml', 'Xml', 'Xml', 'default')
				) CType ([typeName], nameNET , nameReal, [default])
						on type_name(user_type_id) =  CType.[typeName]
		where object_id = @objid
	) T` },
      { type: 'md', content: `_________________________________________________________` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
