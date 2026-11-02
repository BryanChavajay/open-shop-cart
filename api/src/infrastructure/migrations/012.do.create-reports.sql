-- Módulo de reportes (RF-08): índice de apoyo sobre Pedidos, vista de líneas
-- de venta efectivas por categoría para el dashboard, y procedures de
-- consulta de ventas (por período, por categoría y productos más vendidos).
-- Solo acceso a datos de lectura: no se modifican tablas existentes.
--
-- Los lotes (GO) se ejecutan dentro de una única transacción gestionada por
-- el runner (postgrator), por eso no se abre transacción explícita aquí.
--
-- Los importes de línea ya están congelados en PedidosDetalle (brutos con
-- IVA 12% incluido): la parte devuelta se prorratea por unidad sobre
-- TotalLineaBruto a escala 2, de modo que las sumas cuadran al centavo.
--
-- Rango de THROW 50600..50699 reservado para reportes (el resto del esquema
-- ya usa 50000..50579 y 51000):
--   50600  SP_Reportes_VentasPorPeriodo      agrupación inválida
--   50601  SP_Reportes_ProductosMasVendidos  límite fuera de rango (1..100)
-- No se otorgan permisos: el resto del esquema tampoco lo hace.

-- Índice de apoyo al dashboard y a las consultas de ventas: cubre el filtro
-- por ambos estados con la fecha, y el INCLUDE lo que agregan los reportes.
CREATE NONCLUSTERED INDEX IX_Pedidos_EstadoPedido_FechaCreacion
  ON dbo.Pedidos (EstadoPedido, EstadoPago, FechaCreacion DESC)
  INCLUDE (IDUsuario, CostoEnvio, TotalPagar);
GO

-- Vista de líneas de venta efectivas del dashboard: una fila por línea de
-- pedido entregado y pagado, con la categoría resuelta vía variante/producto
-- y la parte devuelta prorrateada por unidad sobre el bruto de la línea.
CREATE OR ALTER VIEW dbo.VW_Dashboard_VentasPorCategoria
AS
SELECT
  o.FechaCreacion,
  o.IDPedido,
  c.IDCategoria,
  c.IDPublico AS IDPublicoCategoria,
  c.Nombre AS NombreCategoria,
  p.IDProducto,
  p.IDPublico AS IDPublicoProducto,
  p.Nombre AS NombreProducto,
  d.Cantidad AS CantidadVendida,
  d.CantidadDevuelta,
  d.Cantidad - d.CantidadDevuelta AS UnidadesEfectivas,
  d.TotalLineaBruto AS ImporteBrutoLinea,
  -- Parte devuelta: bruto de la línea × fracción de unidades devueltas.
  CAST(ROUND(
    d.TotalLineaBruto * d.CantidadDevuelta
    / CAST(d.Cantidad AS DECIMAL(18, 6)), 2
  ) AS DECIMAL(10, 2)) AS ImporteDevueltoLinea,
  -- Parte efectiva: bruto de la línea menos la parte devuelta.
  d.TotalLineaBruto - CAST(ROUND(
    d.TotalLineaBruto * d.CantidadDevuelta
    / CAST(d.Cantidad AS DECIMAL(18, 6)), 2
  ) AS DECIMAL(10, 2)) AS ImporteEfectivoLinea
FROM dbo.Pedidos o
JOIN dbo.PedidosDetalle d ON d.IDPedido = o.IDPedido
JOIN dbo.ProductosVariantes pv ON pv.IDVariante = d.IDVariante
JOIN dbo.Productos p ON p.IDProducto = pv.IDProducto
JOIN dbo.Categorias c ON c.IDCategoria = p.IDCategoria
WHERE o.EstadoPedido = 'DELIVERED'
  AND o.EstadoPago = 'PAID';
GO

-- Ventas resumidas por período (día / semana ISO / mes). El rango es
-- [desde, hasta), con ambos extremos opcionales. Los pedidos totalmente
-- devueltos no cuentan: sin unidades efectivas no aportan ventas ni ticket.
-- Dos rowsets: 0) serie por período; 1) resumen global (siempre una fila,
-- con ceros cuando no hay pedidos).
-- 50600: agrupación distinta de DAY/WEEK/MONTH.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorPeriodo
  @Agrupacion NVARCHAR(10),
  @FechaDesde DATETIME2(3) = NULL,
  @FechaHasta DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Agrupacion IS NULL OR @Agrupacion NOT IN ('DAY', 'WEEK', 'MONTH')
    THROW 50600, N'La agrupacion indicada es invalida (valores DAY, WEEK o MONTH)', 1;

  WITH
  -- 1) Pedidos entregados y pagados dentro del rango [desde, hasta).
  CTE_PedidosCompletados AS (
    SELECT
      o.IDPedido,
      o.FechaCreacion,
      o.CostoEnvio
    FROM dbo.Pedidos o
    WHERE o.EstadoPedido = 'DELIVERED'
      AND o.EstadoPago = 'PAID'
      AND (@FechaDesde IS NULL OR o.FechaCreacion >= @FechaDesde)
      AND (@FechaHasta IS NULL OR o.FechaCreacion < @FechaHasta)
  ),
  -- 2) Líneas con unidades e importes efectivos (prorrateo por unidad).
  CTE_LineasCalculadas AS (
    SELECT
      x.IDPedido,
      x.Cantidad - x.CantidadDevuelta AS UnidadesEfectivas,
      CAST(ROUND(
        x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2
      ) AS DECIMAL(10, 2)) AS ImporteDevueltoLinea,
      x.TotalLineaBruto - CAST(ROUND(
        x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2
      ) AS DECIMAL(10, 2)) AS ImporteEfectivoLinea
    FROM dbo.PedidosDetalle x
    JOIN CTE_PedidosCompletados p ON p.IDPedido = x.IDPedido
  ),
  -- 3) Resumen por pedido: descarta los pedidos sin unidades efectivas.
  CTE_ResumenPorPedido AS (
    SELECT
      l.IDPedido,
      p.FechaCreacion,
      p.CostoEnvio,
      SUM(l.UnidadesEfectivas) AS UnidadesEfectivasPedido,
      SUM(l.ImporteEfectivoLinea) AS ImporteEfectivoPedido,
      SUM(l.ImporteDevueltoLinea) AS ImporteDevueltoPedido
    FROM CTE_LineasCalculadas l
    JOIN CTE_PedidosCompletados p ON p.IDPedido = l.IDPedido
    GROUP BY l.IDPedido, p.FechaCreacion, p.CostoEnvio
    HAVING SUM(l.UnidadesEfectivas) > 0
  ),
  -- 4) Bucketing del período: DAY = día calendario, WEEK = lunes de la
  --    semana ISO (19000101 es lunes), MONTH = primer día del mes.
  CTE_PedidosConBucket AS (
    SELECT
      r.IDPedido,
      r.UnidadesEfectivasPedido,
      r.ImporteEfectivoPedido,
      r.ImporteDevueltoPedido,
      r.CostoEnvio,
      CASE
        WHEN @Agrupacion = 'DAY'
          THEN CAST(r.FechaCreacion AS DATE)
        WHEN @Agrupacion = 'WEEK'
          THEN DATEADD(DAY,
            -((DATEDIFF(DAY, CAST('19000101' AS DATE),
              CAST(r.FechaCreacion AS DATE)) % 7 + 7) % 7),
            CAST(r.FechaCreacion AS DATE))
        WHEN @Agrupacion = 'MONTH'
          THEN DATEFROMPARTS(
            YEAR(r.FechaCreacion), MONTH(r.FechaCreacion), 1)
      END AS FechaInicioPeriodo
    FROM CTE_ResumenPorPedido r
  ),
  -- 5) Agregado por período con sumas sin redondear: el redondeo y el CAST
  --    de presentación se aplican solo en las proyecciones finales.
  CTE_AgregadoPorPeriodo AS (
    SELECT
      b.FechaInicioPeriodo,
      COUNT(b.IDPedido) AS NumeroPedidos,
      SUM(b.UnidadesEfectivasPedido) AS UnidadesVendidas,
      SUM(b.ImporteEfectivoPedido) AS SumaImporteEfectivo,
      SUM(b.ImporteDevueltoPedido) AS SumaImporteDevuelto,
      SUM(b.CostoEnvio) AS SumaCostoEnvio
    FROM CTE_PedidosConBucket b
    GROUP BY b.FechaInicioPeriodo
  )
  -- Rowset 0: serie temporal ascendente.
  SELECT
    a.FechaInicioPeriodo,
    a.NumeroPedidos,
    a.UnidadesVendidas,
    CAST(a.SumaImporteEfectivo AS DECIMAL(18, 2)) AS MontoVentasQuetzales,
    CAST(a.SumaImporteDevuelto AS DECIMAL(18, 2)) AS MontoDevueltoQuetzales,
    CAST(a.SumaCostoEnvio AS DECIMAL(18, 2)) AS MontoEnvioQuetzales,
    CAST(ROUND(a.SumaImporteEfectivo * 1.0 / a.NumeroPedidos, 2)
      AS DECIMAL(18, 2)) AS TicketPromedioQuetzales
  FROM CTE_AgregadoPorPeriodo a
  ORDER BY a.FechaInicioPeriodo ASC;

  -- Rowset 1: resumen global (una fila siempre; el ticket global pondera
  -- con los importes sin redondear para evitar deriva del redondeo).
  SELECT
    COALESCE(SUM(a.NumeroPedidos), 0) AS TotalPedidos,
    COALESCE(SUM(a.UnidadesVendidas), 0) AS TotalUnidades,
    COALESCE(CAST(SUM(a.SumaImporteEfectivo) AS DECIMAL(18, 2)),
      CAST(0 AS DECIMAL(18, 2))) AS MontoTotalVentasQuetzales,
    COALESCE(CAST(SUM(a.SumaImporteDevuelto) AS DECIMAL(18, 2)),
      CAST(0 AS DECIMAL(18, 2))) AS MontoTotalDevueltoQuetzales,
    COALESCE(CAST(SUM(a.SumaCostoEnvio) AS DECIMAL(18, 2)),
      CAST(0 AS DECIMAL(18, 2))) AS MontoTotalEnvioQuetzales,
    COALESCE(CAST(ROUND(SUM(a.SumaImporteEfectivo) * 1.0
      / NULLIF(SUM(a.NumeroPedidos), 0), 2) AS DECIMAL(18, 2)),
      CAST(0 AS DECIMAL(18, 2))) AS TicketPromedioGlobalQuetzales
  FROM CTE_AgregadoPorPeriodo a;
END;
GO

-- Ventas por categoría de los pedidos entregados y pagados; las líneas
-- totalmente devueltas no se consideran. Rango [desde, hasta) opcional.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorCategoria
  @FechaDesde DATETIME2(3) = NULL,
  @FechaHasta DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  WITH
  CTE_PedidosCompletados AS (
    SELECT
      o.IDPedido,
      o.FechaCreacion
    FROM dbo.Pedidos o
    WHERE o.EstadoPedido = 'DELIVERED'
      AND o.EstadoPago = 'PAID'
      AND (@FechaDesde IS NULL OR o.FechaCreacion >= @FechaDesde)
      AND (@FechaHasta IS NULL OR o.FechaCreacion < @FechaHasta)
  ),
  -- Solo líneas con unidades efectivas: un pedido devuelto por completo no
  -- aporta unidades ni ventas.
  CTE_LineasEfectivas AS (
    SELECT
      x.IDPedido,
      x.IDVariante,
      x.Cantidad - x.CantidadDevuelta AS UnidadesEfectivas,
      CAST(ROUND(
        x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2
      ) AS DECIMAL(10, 2)) AS ImporteDevueltoLinea,
      x.TotalLineaBruto - CAST(ROUND(
        x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2
      ) AS DECIMAL(10, 2)) AS ImporteEfectivoLinea
    FROM dbo.PedidosDetalle x
    JOIN CTE_PedidosCompletados p ON p.IDPedido = x.IDPedido
    WHERE x.Cantidad - x.CantidadDevuelta > 0
  ),
  -- Resolución variante → producto → categoría.
  CTE_LineasConCategoria AS (
    SELECT
      l.IDPedido,
      l.UnidadesEfectivas,
      l.ImporteEfectivoLinea,
      l.ImporteDevueltoLinea,
      pv.IDProducto,
      p.IDPublico AS IDPublicoProducto,
      p.Nombre AS NombreProducto,
      c.IDCategoria,
      c.IDPublico AS IDPublicoCategoria,
      c.Nombre AS NombreCategoria
    FROM CTE_LineasEfectivas l
    JOIN dbo.ProductosVariantes pv ON pv.IDVariante = l.IDVariante
    JOIN dbo.Productos p ON p.IDProducto = pv.IDProducto
    JOIN dbo.Categorias c ON c.IDCategoria = p.IDCategoria
  ),
  CTE_AgregadoPorCategoria AS (
    SELECT
      l.IDCategoria,
      l.IDPublicoCategoria,
      l.NombreCategoria,
      COUNT(DISTINCT l.IDPedido) AS NumeroPedidos,
      SUM(l.UnidadesEfectivas) AS UnidadesVendidas,
      SUM(l.ImporteEfectivoLinea) AS SumaImporteEfectivo,
      SUM(l.ImporteDevueltoLinea) AS SumaImporteDevuelto
    FROM CTE_LineasConCategoria l
    GROUP BY l.IDCategoria, l.IDPublicoCategoria, l.NombreCategoria
  )
  SELECT
    a.IDCategoria,
    a.IDPublicoCategoria,
    a.NombreCategoria,
    a.NumeroPedidos,
    a.UnidadesVendidas,
    CAST(a.SumaImporteEfectivo AS DECIMAL(18, 2)) AS MontoVentasQuetzales,
    CAST(a.SumaImporteDevuelto AS DECIMAL(18, 2)) AS MontoDevueltoQuetzales
  FROM CTE_AgregadoPorCategoria a
  ORDER BY MontoVentasQuetzales DESC, UnidadesVendidas DESC,
    NombreCategoria ASC;
END;
GO

-- Productos más vendidos del período (todas las variantes se consolidan en
-- el producto padre). Rango [desde, hasta) opcional y tope de filas.
-- 50601: límite fuera del rango 1..100.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_ProductosMasVendidos
  @FechaDesde DATETIME2(3) = NULL,
  @FechaHasta DATETIME2(3) = NULL,
  @Limite INT = 10
AS
BEGIN
  SET NOCOUNT ON;

  IF @Limite IS NULL OR @Limite < 1 OR @Limite > 100
    THROW 50601, N'El limite indicado debe estar entre 1 y 100', 1;

  WITH
  CTE_PedidosCompletados AS (
    SELECT
      o.IDPedido,
      o.FechaCreacion
    FROM dbo.Pedidos o
    WHERE o.EstadoPedido = 'DELIVERED'
      AND o.EstadoPago = 'PAID'
      AND (@FechaDesde IS NULL OR o.FechaCreacion >= @FechaDesde)
      AND (@FechaHasta IS NULL OR o.FechaCreacion < @FechaHasta)
  ),
  CTE_LineasEfectivas AS (
    SELECT
      x.IDPedido,
      x.IDVariante,
      x.Cantidad - x.CantidadDevuelta AS UnidadesEfectivas,
      CAST(ROUND(
        x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2
      ) AS DECIMAL(10, 2)) AS ImporteDevueltoLinea,
      x.TotalLineaBruto - CAST(ROUND(
        x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2
      ) AS DECIMAL(10, 2)) AS ImporteEfectivoLinea
    FROM dbo.PedidosDetalle x
    JOIN CTE_PedidosCompletados p ON p.IDPedido = x.IDPedido
    WHERE x.Cantidad - x.CantidadDevuelta > 0
  ),
  -- Variante → producto padre → categoría, con ids y nombres para la fila.
  CTE_LineasConProducto AS (
    SELECT
      l.IDPedido,
      l.UnidadesEfectivas,
      l.ImporteEfectivoLinea,
      l.ImporteDevueltoLinea,
      p.IDProducto,
      p.IDPublico AS IDPublicoProducto,
      p.Nombre AS NombreProducto,
      c.IDPublico AS IDPublicoCategoria,
      c.Nombre AS NombreCategoria
    FROM CTE_LineasEfectivas l
    JOIN dbo.ProductosVariantes pv ON pv.IDVariante = l.IDVariante
    JOIN dbo.Productos p ON p.IDProducto = pv.IDProducto
    JOIN dbo.Categorias c ON c.IDCategoria = p.IDCategoria
  ),
  CTE_AgregadoPorProducto AS (
    SELECT
      l.IDProducto,
      l.IDPublicoProducto,
      l.NombreProducto,
      l.IDPublicoCategoria,
      l.NombreCategoria,
      COUNT(DISTINCT l.IDPedido) AS NumeroPedidos,
      SUM(l.UnidadesEfectivas) AS UnidadesVendidas,
      SUM(l.ImporteEfectivoLinea) AS SumaImporteEfectivo,
      SUM(l.ImporteDevueltoLinea) AS SumaImporteDevuelto
    FROM CTE_LineasConProducto l
    GROUP BY l.IDProducto, l.IDPublicoProducto, l.NombreProducto,
      l.IDPublicoCategoria, l.NombreCategoria
  )
  SELECT TOP (@Limite)
    a.IDProducto,
    a.IDPublicoProducto,
    a.NombreProducto,
    a.IDPublicoCategoria,
    a.NombreCategoria,
    a.NumeroPedidos,
    a.UnidadesVendidas,
    CAST(a.SumaImporteEfectivo AS DECIMAL(18, 2)) AS MontoVentasQuetzales,
    CAST(a.SumaImporteDevuelto AS DECIMAL(18, 2)) AS MontoDevueltoQuetzales
  FROM CTE_AgregadoPorProducto a
  ORDER BY UnidadesVendidas DESC, MontoVentasQuetzales DESC, IDProducto ASC;
END;
GO
