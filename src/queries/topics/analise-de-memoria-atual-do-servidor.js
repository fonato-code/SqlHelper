(function (root) {
	'use strict';
	var SqlHelp = root.SqlHelp = root.SqlHelp || {};
	SqlHelp._qt_analise_de_memoria_atual_do_servidor = {
	  id: "analise-de-memoria-atual-do-servidor",
	  title: "Analise de memoria atual do servidor",
	  tags: ["MEMORIA"],
	  blocks: [
		{ type: 'md', content: `## Querie 1 Page Life Expectancy e Grants de Memória
  * **Page life expectancy**: 
	  * Esse bloco mostra o Page life expectancy (PLE) e um mínimo recomendado calculado a partir do tamanho do buffer (a própria query calcula esse “mínimo saudável” com base em Database Cache Memory).
	  * Mede quantos segundos uma página de dados fica no buffer pool antes de ser expulsa. 
	  * Quanto maior, melhor.
	  * Compare o PLE atual com o recomendado: abaixo dele de forma persistente = buffer churn/pressão.
  * **Memory Grants Pending / Outstanding**: 
	  * Pending deve ficar 0 quase sempre. 
	  * Se ficar maior que zero por períodos contínuos, há gargalo de memória para execuções (hash/sort/window) — ou seja, as queries estão esperando concessão de memória.
	  
  
  ## Querie 2 Memória Física e Alocação
  Aqui você confere se o max server memory da instância está coerente com a RAM física e com outras instâncias do mesmo host 
  >  OBS cada instância precisa do seu max ajustado, e eles não podem se sobrepor a memoria total do servidor 
  
  [Documentação MS - ServerMemory Configuration](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/server-memory-server-configuration-options?view=sql-server-ver17#max-server-memory)
  
  
  Colunas: 
  * **target_mb**: memória-alvo alocada.
  * **physical_mb**: memória física total da máquina.	
  
  ## Querie 3 
  * **% of Parent**: porcentagem de uso em relação ao pai na hierarquia.
  * **% of Target**: uso em relação à memória-alvo total do SQL Server.
  
  Linhas de informação 
  * **Target Server Memory** 
	  * Quantidade de memória alvo que o SQL Server deseja ter alocada.
			  Importância: Valor que o SQL Server "considera ideal" para manter seu desempenho. Ele pode aumentar ou diminuir conforme a pressão de memória do sistema operacional.
  * **Maximum Workspace Memory**
	  * Máximo de memória disponível para operações com uso intensivo de memória, como hash joins, sorts, windowing, etc. É um limite superior para Granted Workspace Memory.
	* **Granted Workspace Memory**
	  * Memória efetivamente concedida para execuções de consultas que precisam de memória extra (hash, sort...).
	  * **Used Workspace Memory**
		  * Parte da memória concedida que está sendo usada ativamente.
	  * **Reserved Server Memory**
		  * Memória reservada internamente para operações importantes (inicialização, conexões, etc.). É “protegida” contra pressão de memória.
  * **Total Server Memory**
	  * Memória atualmente alocada pelo SQL Server do sistema operacional. 
	  * Sempre ≤ Target Server Memory, a menos que o SO permita mais
	  * **Database Cache Memory**
		  * Também conhecido como Buffer Pool. Contém páginas de dados e índices em cache.
		  * Costuma ser o maior consumidor de memória.
	  * **Free Memory**
		  * Memória reservada pelo SQL Server, mas ainda não usada.
	  * **Stolen Server Memory**
		  * Memória tirada do buffer pool para outras finalidades: Execução de query, Caches auxiliares, Mecanismos internos
		  * **Used Workspace Memory**
			  * Repetido aqui porque também é classificado como "Stolen" — ou seja, consumido fora do buffer pool.
		  * **Other Memory Clerks**
			  * Memória usada por componentes diversos do SQL Server que não se encaixam nas categorias nomeadas (como CLR, extensões, replicação, etc.).
		  * **Cursor memory usage**
			  * Memória usada por cursores (principalmente cursores server-side).
		  * **SQL Cache Memory**
			  * Contém cache de estruturas SQL prontas para execução que não são planos completos (ex: preparações de statements, instruções parametrizadas).
		  * **Lock Memory**
			  * Definição: Memória usada pelo gerenciador de locks (controle de concorrência entre transações).
		  * **Optimizer Memory**
			  * Usada durante o processo de otimização de queries (etapa de geração do plano de execução).
		  * **Connection Memory**
			  * Memória usada para manter estado das conexões, buffers de rede, autenticação, etc.
		  * **Plan Cache**
			  * Definição: Armazena os planos de execução de queries para reuso (melhora desempenho). É parte da memória roubada (Stolen).
			  * **SQL Plans**
				  * Planos otimizados para T-SQL comuns (stored procedures, ad-hoc queries, etc).
			  * **Bound Trees**
				  * Representações intermediárias de expressões SQL, usados internamente para análise sintática e semântica.
			  * **Object Plans**
				  * Planos usados para triggers, funções definidas pelo usuário, etc.
			  * **Temporary Tables & Table Variables**
				  * Memória usada por objetos temporários armazenados em cache no plano.
			  * **Extended Stored Procedures**
				  * Memória usada por procedimentos armazenados em DLLs nativas (fora do T-SQL).
  
  
  ## Querie 4
  Retorna a quantidde e consumo das queries armazenadas em cache pelo SQL Server
  
  ## Como diagnosticar rapidamente (checklist prático)
  
  * **Grants Pending > 0 de forma contínua?**
	  * Pressão de memória para execução (tuning de planos/índices, reduzir cardinalidade intermediária, ou dar mais memória à instância). 
  
  * **PLE abaixo do mínimo recomendado (que a própria query calcula) por longos períodos?**
	  * Buffer pequeno / churn de páginas (muito I/O e pouco reaproveitamento). 
  
  * **Database Cache pequeno e Stolen muito alto?**
	  * Memória desviada do buffer para outros consumidores (plan cache gigante, otimizador, conexões, CLR…). Veja Plan Cache e Other Memory Clerks. 
  
  * **Free Memory ~0 e Grants Pending > 0 e PLE caindo**
	  * Memória insuficiente (ou max server memory muito baixo). 
  
  * **Plan Cache desproporcional (muito SQL Plans com pouco reaproveitamento)**
	  * Bloat por ad-hoc; considerar optimize for ad hoc workloads e/ ou parametrização. 
  
  * **Target muito abaixo do que você esperava (e Total acompanhando)**
	  * SO/host sinalizando pressão (ou outras instâncias famintas). Olhe também max_server_mb de cada instância. 
  
  
  ## Query` },
		{ type: 'sql', title: `Query`, sql: `
			  SET NOCOUNT ON;
			  SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
			  SET LOCK_TIMEOUT 10000;
  
			  DECLARE @ServiceName nvarchar(100);
			  SET @ServiceName =
							  CASE
								  WHEN @@SERVICENAME = 'MSSQLSERVER' THEN 'SQLServer:'
								  ELSE 'MSSQL$' + @@SERVICENAME + ':'
							  END;
  
			  DECLARE @Perf TABLE (
			  object_name nvarchar(20),
			  counter_name nvarchar(128),
			  instance_name nvarchar(128),
			  cntr_value bigint,
			  formatted_value numeric(20, 2),
			  shortname nvarchar(20)
			  );
			  INSERT INTO @Perf (object_name, counter_name, instance_name, cntr_value, formatted_value, shortname)
			  SELECT
				  CASE
				  WHEN CHARINDEX('Memory Manager', object_name) > 0 THEN 'Memory Manager'
				  WHEN CHARINDEX('Buffer Manager', object_name) > 0 THEN 'Buffer Manager'
				  WHEN CHARINDEX('Plan Cache', object_name) > 0 THEN 'Plan Cache'
				  WHEN CHARINDEX('Buffer Node', object_name) > 0 THEN 'Buffer Node' -- 2008
				  WHEN CHARINDEX('Memory Node', object_name) > 0 THEN 'Memory Node' -- 2012
				  WHEN CHARINDEX('Cursor', object_name) > 0 THEN 'Cursor'
				  ELSE NULL
				  END AS object_name,
				  CAST(RTRIM(counter_name) AS nvarchar(100)) AS counter_name,
				  RTRIM(instance_name) AS instance_name,
				  cntr_value,
				  CAST(NULL AS decimal(20, 2)) AS formatted_value,
				  SUBSTRING(counter_name, 1, PATINDEX('% %', counter_name)) shortname
			  FROM sys.dm_os_performance_counters
			  WHERE (object_name LIKE @ServiceName + 'Buffer Node%'     -- LIKE is faster than =. I have no idea why
			  OR object_name LIKE @ServiceName + 'Buffer Manager%'
			  OR object_name LIKE @ServiceName + 'Memory Node%'
			  OR object_name LIKE @ServiceName + 'Plan Cache%')
			  AND (counter_name LIKE '%pages %'
			  OR counter_name LIKE '%Node Memory (KB)%'
			  OR counter_name = 'Page life expectancy'
			  )
			  OR (object_name = @ServiceName + 'Memory Manager'
			  AND counter_name IN ('Granted Workspace Memory (KB)', 'Maximum Workspace Memory (KB)',
			  'Memory Grants Outstanding', 'Memory Grants Pending',
			  'Target Server Memory (KB)', 'Total Server Memory (KB)',
			  'Connection Memory (KB)', 'Lock Memory (KB)',
			  'Optimizer Memory (KB)', 'SQL Cache Memory (KB)',
			  -- for 2012
			  'Free Memory (KB)', 'Reserved Server Memory (KB)',
			  'Database Cache Memory (KB)', 'Stolen Server Memory (KB)')
			  )
			  OR (object_name LIKE @ServiceName + 'Cursor Manager by Type%'
			  AND counter_name = 'Cursor memory usage'
			  AND instance_name = '_Total'
			  );
  
			  -- Add unit to 'Cursor memory usage'
			  UPDATE @Perf
			  SET counter_name = counter_name + ' (KB)'
			  WHERE counter_name = 'Cursor memory usage';
  
			  -- Convert values from pages and KB to MB and rename counters accordingly
			  UPDATE @Perf
			  SET counter_name = REPLACE(REPLACE(REPLACE(counter_name, ' pages', ''), ' (KB)', ''), ' (MB)', ''),
				  formatted_value =
								  CASE
								  WHEN counter_name LIKE '%pages' THEN cntr_value / 128.
								  WHEN counter_name LIKE '%(KB)' THEN cntr_value / 1024.
								  ELSE cntr_value
								  END;
  
			  -- Delete some pre 2012 counters for 2012 in order to remove duplicates
			  DELETE P2008
			  FROM @Perf P2008
			  INNER JOIN @Perf P2012
				  ON REPLACE(P2008.object_name, 'Buffer', 'Memory') = P2012.object_name
				  AND P2008.shortname = P2012.shortname
			  WHERE P2008.object_name IN ('Buffer Manager', 'Buffer Node');
  
			  -- Update counter/object names so they look like in 2012
			  UPDATE PC
			  SET object_name = REPLACE(object_name, 'Buffer', 'Memory'),
				  counter_name = ISNULL(M.NewName, counter_name)
			  FROM @Perf PC
			  LEFT JOIN (SELECT
			  'Free' AS OldName,
			  'Free Memory' AS NewName
			  UNION ALL
			  SELECT
			  'Database',
			  'Database Cache Memory'
			  UNION ALL
			  SELECT
			  'Stolen',
			  'Stolen Server Memory'
			  UNION ALL
			  SELECT
			  'Reserved',
			  'Reserved Server Memory'
			  UNION ALL
			  SELECT
			  'Foreign',
			  'Foreign Node Memory') M
			  ON M.OldName = PC.counter_name
			  AND NewName NOT IN (SELECT
				  counter_name
			  FROM @Perf
			  WHERE object_name = 'Memory Manager')
			  WHERE object_name IN ('Buffer Manager', 'Buffer Node');
  
  
			  -- Build Memory Tree
			  DECLARE @MemTree TABLE (
			  Id int,
			  ParentId int,
			  counter_name nvarchar(128),
			  formatted_value numeric(20, 2),
			  shortname nvarchar(20)
			  );
  
			  -- Level 5
			  INSERT @MemTree (Id, ParentId, counter_name, formatted_value, shortname)
			  SELECT
				  Id = 1226,
				  ParentId = 1225,
				  instance_name AS counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Plan Cache'
			  AND counter_name IN ('Cache')
			  AND instance_name <> '_Total';
  
			  -- Level 4
			  INSERT @MemTree (Id, ParentId, counter_name, formatted_value, shortname)
			  SELECT
				  Id = 1225,
				  ParentId = 1220,
				  'Plan ' + counter_name AS counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Plan Cache'
			  AND counter_name IN ('Cache')
			  AND instance_name = '_Total'
  
			  UNION ALL
  
			  SELECT
				  Id = 1222,
				  ParentId = 1220,
				  counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Cursor'
			  OR (object_name = 'Memory Manager'
			  AND shortname IN ('Connection', 'Lock', 'Optimizer', 'SQL'))
  
			  UNION ALL
  
			  SELECT
				  Id = 1112,
				  ParentId = 1110,
				  counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Memory Manager'
			  AND shortname IN ('Reserved')
			  UNION ALL
			  SELECT
				  Id = P.ParentID + 1,
				  ParentID = P.ParentID,
				  'Used Workspace Memory' AS counter_name,
				  SUM(used_memory_kb) / 1024. AS formatted_value,
				  NULL AS shortname
			  FROM sys.dm_exec_query_resource_semaphores
			  CROSS JOIN (SELECT
				  1220 AS ParentID
			  UNION ALL
			  SELECT
				  1110) P
			  GROUP BY P.ParentID;
  
			  -- Level 3
			  INSERT @MemTree (Id, ParentId, counter_name, formatted_value, shortname)
			  SELECT
				  Id =
					  CASE counter_name
					  WHEN 'Granted Workspace Memory' THEN 1110
					  WHEN 'Stolen Server Memory' THEN 1220
					  ELSE 1210
					  END,
				  ParentId =
						  CASE counter_name
							  WHEN 'Granted Workspace Memory' THEN 1100
							  ELSE 1200
						  END,
				  counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Memory Manager'
			  AND counter_name IN ('Stolen Server Memory', 'Database Cache Memory', 'Free Memory', 'Granted Workspace Memory');
  
			  -- Level 2
			  INSERT @MemTree (Id, ParentId, counter_name, formatted_value, shortname)
			  SELECT
				  Id =
					  CASE
					  WHEN counter_name = 'Maximum Workspace Memory' THEN 1100
					  ELSE 1200
					  END,
				  ParentId = 1000,
				  counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Memory Manager'
			  AND counter_name IN ('Total Server Memory', 'Maximum Workspace Memory');
  
			  -- Level 1
			  INSERT @MemTree (Id, ParentId, counter_name, formatted_value, shortname)
			  SELECT
				  Id = 1000,
				  ParentId = NULL,
				  counter_name,
				  formatted_value,
				  shortname
			  FROM @Perf
			  WHERE object_name = 'Memory Manager'
			  AND counter_name IN ('Target Server Memory');
  
			  -- Level 4 -- 'Other Stolen Server Memory' = 'Stolen Server Memory' - SUM(Children of 'Stolen Server Memory')
			  INSERT @MemTree (Id, ParentId, counter_name, formatted_value, shortname)
			  SELECT
				  Id = 1222,
				  ParentId = 1220,
				  counter_name = '<Other Memory Clerks>',
				  formatted_value = (SELECT
				  SSM.formatted_value
				  FROM @MemTree SSM
				  WHERE Id = 1220)
				  - SUM(formatted_value),
				  shortname = 'Other Stolen'
			  FROM @MemTree
			  WHERE ParentId = 1220;
  
			  -- Results:
  
			  -- PLE and Memory Grants
			  SELECT
			  [Counter Name] = P.counter_name + ISNULL(' (Node: ' + NULLIF(P.instance_name, '') + ')', ''),
			  cntr_value AS Value,
			  RecommendedMinimum =
								  CASE
									  WHEN P.counter_name = 'Page life expectancy' AND
									  R.Value <= 300 -- no less than 300
									  THEN 300
									  WHEN P.counter_name = 'Page life expectancy' AND
									  R.Value > 300 THEN R.Value
									  ELSE NULL
								  END
			  FROM @Perf P
			  LEFT JOIN -- Recommended PLE calculations
			  (SELECT
			  object_name,
			  counter_name,
			  instance_name,
			  CEILING(formatted_value / 4096. * 5) * 60 AS Value -- 300 per every 4GB of Buffer Pool memory or around 60 seconds (1 minute) per every 819MB
			  FROM @Perf PD
			  WHERE counter_name = 'Database Cache Memory') R
			  ON R.object_name = P.object_name
			  AND R.instance_name = P.instance_name
			  WHERE (P.object_name = 'Memory Manager'
			  AND P.counter_name IN ('Memory Grants Outstanding', 'Memory Grants Pending', 'Page life expectancy')
			  )
			  OR -- For NUMA
			  (
			  P.object_name = 'Memory Node'
			  AND P.counter_name = 'Page life expectancy'
			  AND (SELECT
			  COUNT(DISTINCT instance_name)
			  FROM @Perf
			  WHERE object_name = 'Memory Node')
			  > 1
			  )
			  ORDER BY P.counter_name DESC, P.instance_name;
  
			  -- Get physical memory
			  -- You can also extract this information from sys.dm_os_sys_info but the column names have changed starting from 2012
			  IF OBJECT_ID('tempdb..#msver') IS NOT NULL
			  DROP TABLE #msver
			  CREATE TABLE #msver (
			  ID int,
			  Name sysname,
			  Internal_Value int,
			  Value nvarchar(512)
			  );
			  INSERT #msver EXEC master.dbo.xp_msver 'PhysicalMemory';
  
			  -- Physical memory, config parameters and Target memory
			  SELECT
			  min_server_mb = (SELECT
				  CAST(value_in_use AS decimal(20, 2))
			  FROM sys.configurations
			  WHERE name = 'min server memory (MB)'),
			  max_server_mb = (SELECT
				  CAST(value_in_use AS decimal(20, 2))
			  FROM sys.configurations
			  WHERE name = 'max server memory (MB)'),
			  target_mb = (SELECT
				  formatted_value
			  FROM @Perf
			  WHERE object_name = 'Memory Manager'
			  AND counter_name IN ('Target Server Memory')),
			  physical_mb = CAST(Internal_Value AS decimal(20, 2))
			  FROM #msver;
  
			  -- Memory tree
			  ;
			  WITH CTE
			  AS (SELECT
			  0 AS lvl,
			  counter_name,
			  formatted_value,
			  Id,
			  NULL AS ParentId,
			  shortname,
			  formatted_value AS TargetServerMemory,
			  CAST(NULL AS decimal(20, 4)) AS Perc,
			  CAST(NULL AS decimal(20, 4)) AS PercOfTarget
			  FROM @MemTree
			  WHERE ParentId IS NULL
			  UNION ALL
			  SELECT
			  CTE.lvl + 1,
			  CAST(REPLICATE(' ', 6 * (CTE.lvl)) + NCHAR(124) + REPLICATE(NCHAR(183), 3) + MT.counter_name AS nvarchar(128)),
			  MT.formatted_value,
			  MT.Id,
			  MT.ParentId,
			  MT.shortname,
			  CTE.TargetServerMemory,
			  CAST(ISNULL(1.0 * MT.formatted_value / NULLIF(CTE.formatted_value, 0), 0) AS decimal(20, 4)) AS Perc,
			  CAST(ISNULL(1.0 * MT.formatted_value / NULLIF(CTE.TargetServerMemory, 0), 0) AS decimal(20, 4)) AS PercOfTarget
			  FROM @MemTree MT
			  INNER JOIN CTE
			  ON MT.ParentId = CTE.Id)
			  SELECT
			  counter_name AS [Counter Name],
			  CASE
				  WHEN formatted_value > 0 THEN formatted_value
				  ELSE NULL
			  END AS [Memory MB],
			  Perc AS [% of Parent],
			  CASE
				  WHEN lvl >= 2 THEN PercOfTarget
				  ELSE NULL
			  END AS [% of Target]
			  FROM CTE
			  ORDER BY ISNULL(Id, 10000), formatted_value DESC;
  
  
			  SELECT
				  objtype,
				  COUNT(*) AS plans,
				  SUM(convert(bigint, size_in_bytes))/1024/1024 AS total_mb
			  FROM sys.dm_exec_cached_plans
			  GROUP BY objtype
			  ORDER BY total_mb DESC;` },
		{ type: 'md', content: `## Query de Correção do Max Memory` },
		{ type: 'sql', title: `Query de Correção do Max Memory`, sql: `
			  EXECUTE sp_configure 'show advanced options', 1;
			  GO
			  RECONFIGURE;
			  GO
			  Declare @memory int = 13 * 1024
			  EXECUTE sp_configure 'max server memory', @memory;
			  GO
			  RECONFIGURE;
			  GO` },
		{ type: 'md', content: `_________________________________________________________` }
	  ]
	};
  })(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
  