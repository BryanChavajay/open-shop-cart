-- Sustituye las relaciones internas de inventario basadas en UUID públicos
-- por identificadores internos. Los procedimientos ajustados se añaden al
-- final de este archivo, después de esta sección de esquema y datos.

ALTER TABLE dbo.InventarioMovimientos
  ADD IDPedido INT NULL,
      IDMovimientoVentaRelacionado BIGINT NULL;
GO

ALTER TABLE dbo.InventarioMovimientos
  ADD CONSTRAINT FK_InventarioMovimientos_Pedidos
        FOREIGN KEY (IDPedido) REFERENCES dbo.Pedidos(IDPedido),
      CONSTRAINT FK_InventarioMovimientos_MovimientoVentaRelacionado
        FOREIGN KEY (IDMovimientoVentaRelacionado)
        REFERENCES dbo.InventarioMovimientos(IDMovimiento);
GO

-- Relación histórica: en los movimientos de venta y reintegro el UUID
-- legado identifica el pedido. Se conserva el valor legado por
-- compatibilidad mientras se corrigen sus consumidores.
UPDATE m
SET m.IDPedido = p.IDPedido
FROM dbo.InventarioMovimientos AS m
INNER JOIN dbo.Pedidos AS p
  ON m.IDPublicoVentaRelacionada = p.IDPublico;
GO

-- La relación del reintegro se resuelve solamente cuando existe una venta
-- única para el pedido y variante. No se elige una venta arbitrariamente.
IF EXISTS (
  SELECT 1
  FROM dbo.InventarioMovimientos AS m
  WHERE m.TipoMovimiento IN ('SALE_CANCELLATION', 'CUSTOMER_RETURN')
    AND m.IDPedido IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.InventarioMovimientos AS sale
      WHERE sale.IDPedido = m.IDPedido
        AND sale.IDVariante = m.IDVariante
        AND sale.TipoMovimiento = 'SALE'
    )
)
  THROW 50700, N'Un reintegro existente no tiene movimiento SALE relacionado.', 1;

IF EXISTS (
  SELECT 1
  FROM dbo.InventarioMovimientos AS sale
  WHERE sale.IDPedido IS NOT NULL
    AND sale.TipoMovimiento = 'SALE'
  GROUP BY sale.IDPedido, sale.IDVariante
  HAVING COUNT(*) > 1
)
  THROW 50701, N'Existen ventas ambiguas para el mismo pedido y variante.', 1;

UPDATE m
SET m.IDMovimientoVentaRelacionado = sale.IDMovimiento
FROM dbo.InventarioMovimientos AS m
INNER JOIN dbo.InventarioMovimientos AS sale
  ON sale.IDPedido = m.IDPedido
  AND sale.IDVariante = m.IDVariante
  AND sale.TipoMovimiento = 'SALE'
WHERE m.TipoMovimiento IN ('SALE_CANCELLATION', 'CUSTOMER_RETURN')
  AND m.IDPedido IS NOT NULL;
GO

CREATE INDEX IX_InventarioMovimientos_IDPedido_IDVariante_Tipo
  ON dbo.InventarioMovimientos (IDPedido, IDVariante, TipoMovimiento)
  WHERE IDPedido IS NOT NULL;
CREATE INDEX IX_InventarioMovimientos_MovimientoVentaRelacionado
  ON dbo.InventarioMovimientos (IDMovimientoVentaRelacionado)
  WHERE IDMovimientoVentaRelacionado IS NOT NULL;
GO

-- Venta concreta de una variante dentro de un pedido ya resuelto. El UUID
-- público del movimiento continúa disponible en el SP histórico para usos
-- externos, pero no participa en esta relación interna.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientoVentaObtenerPorPedidoYVariante
  @IDPedido INT,
  @IDVariante INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT m.IDMovimiento, m.IDPublico AS IDPublicoMovimiento,
         v.IDPublico AS IDPublicoVariante, m.IDVariante,
         m.TipoMovimiento, m.CantidadDiferencial, m.SaldoAnterior,
         m.SaldoPosterior, m.IDUsuario, m.Motivo, m.ReferenciaOrigen,
         m.IDPedido, m.IDMovimientoVentaRelacionado,
         m.IDPublicoVentaRelacionada, m.FechaRegistro
  FROM dbo.InventarioMovimientos AS m
  JOIN dbo.ProductosVariantes AS v ON v.IDVariante = m.IDVariante
  WHERE m.IDPedido = @IDPedido
    AND m.IDVariante = @IDVariante
    AND m.TipoMovimiento = 'SALE';
END;
GO

-- A CTE is scoped to a single statement. Materialize the period aggregate so
-- the detail series and its global summary can consume the same calculation.
CREATE OR ALTER PROCEDURE dbo.SP_Reportes_VentasPorPeriodo
  @Agrupacion NVARCHAR(10),
  @FechaDesde DATETIME2(3) = NULL,
  @FechaHasta DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Agrupacion IS NULL OR @Agrupacion NOT IN ('DAY', 'WEEK', 'MONTH')
    THROW 50600, N'La agrupacion indicada es invalida (valores DAY, WEEK o MONTH)', 1;

  DECLARE @AgregadoPorPeriodo TABLE (
    FechaInicioPeriodo DATE NOT NULL,
    NumeroPedidos INT NOT NULL,
    UnidadesVendidas INT NOT NULL,
    SumaImporteEfectivo DECIMAL(38, 2) NOT NULL,
    SumaImporteDevuelto DECIMAL(38, 2) NOT NULL,
    SumaCostoEnvio DECIMAL(38, 2) NOT NULL
  );

  WITH
  CTE_PedidosCompletados AS (
    SELECT o.IDPedido, o.FechaCreacion, o.CostoEnvio
    FROM dbo.Pedidos o
    WHERE o.EstadoPedido = 'DELIVERED'
      AND o.EstadoPago = 'PAID'
      AND (@FechaDesde IS NULL OR o.FechaCreacion >= @FechaDesde)
      AND (@FechaHasta IS NULL OR o.FechaCreacion < @FechaHasta)
  ),
  CTE_LineasCalculadas AS (
    SELECT
      x.IDPedido,
      x.Cantidad - x.CantidadDevuelta AS UnidadesEfectivas,
      CAST(ROUND(x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2) AS DECIMAL(10, 2)) AS ImporteDevueltoLinea,
      x.TotalLineaBruto - CAST(ROUND(x.TotalLineaBruto * x.CantidadDevuelta
        / CAST(x.Cantidad AS DECIMAL(18, 6)), 2) AS DECIMAL(10, 2)) AS ImporteEfectivoLinea
    FROM dbo.PedidosDetalle x
    JOIN CTE_PedidosCompletados p ON p.IDPedido = x.IDPedido
  ),
  CTE_ResumenPorPedido AS (
    SELECT
      l.IDPedido, p.FechaCreacion, p.CostoEnvio,
      SUM(l.UnidadesEfectivas) AS UnidadesEfectivasPedido,
      SUM(l.ImporteEfectivoLinea) AS ImporteEfectivoPedido,
      SUM(l.ImporteDevueltoLinea) AS ImporteDevueltoPedido
    FROM CTE_LineasCalculadas l
    JOIN CTE_PedidosCompletados p ON p.IDPedido = l.IDPedido
    GROUP BY l.IDPedido, p.FechaCreacion, p.CostoEnvio
    HAVING SUM(l.UnidadesEfectivas) > 0
  ),
  CTE_PedidosConBucket AS (
    SELECT
      r.IDPedido, r.UnidadesEfectivasPedido, r.ImporteEfectivoPedido,
      r.ImporteDevueltoPedido, r.CostoEnvio,
      CASE
        WHEN @Agrupacion = 'DAY' THEN CAST(r.FechaCreacion AS DATE)
        WHEN @Agrupacion = 'WEEK' THEN DATEADD(DAY,
          -((DATEDIFF(DAY, CAST('19000101' AS DATE),
            CAST(r.FechaCreacion AS DATE)) % 7 + 7) % 7),
          CAST(r.FechaCreacion AS DATE))
        WHEN @Agrupacion = 'MONTH' THEN DATEFROMPARTS(
          YEAR(r.FechaCreacion), MONTH(r.FechaCreacion), 1)
      END AS FechaInicioPeriodo
    FROM CTE_ResumenPorPedido r
  ),
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
  INSERT INTO @AgregadoPorPeriodo (
    FechaInicioPeriodo, NumeroPedidos, UnidadesVendidas,
    SumaImporteEfectivo, SumaImporteDevuelto, SumaCostoEnvio
  )
  SELECT
    FechaInicioPeriodo, NumeroPedidos, UnidadesVendidas,
    SumaImporteEfectivo, SumaImporteDevuelto, SumaCostoEnvio
  FROM CTE_AgregadoPorPeriodo;

  SELECT
    a.FechaInicioPeriodo,
    a.NumeroPedidos,
    a.UnidadesVendidas,
    CAST(a.SumaImporteEfectivo AS DECIMAL(18, 2)) AS MontoVentasQuetzales,
    CAST(a.SumaImporteDevuelto AS DECIMAL(18, 2)) AS MontoDevueltoQuetzales,
    CAST(a.SumaCostoEnvio AS DECIMAL(18, 2)) AS MontoEnvioQuetzales,
    CAST(ROUND(a.SumaImporteEfectivo * 1.0 / a.NumeroPedidos, 2)
      AS DECIMAL(18, 2)) AS TicketPromedioQuetzales
  FROM @AgregadoPorPeriodo a
  ORDER BY a.FechaInicioPeriodo ASC;

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
  FROM @AgregadoPorPeriodo a;
END;
GO

-- El kardex conserva el UUID propio del movimiento como identificador
-- externo, mientras que sus relaciones con pedido y venta se almacenan por
-- las claves internas agregadas en esta migración.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientoAgregar
  @IDPublico UNIQUEIDENTIFIER,
  @IDVariante INT,
  @TipoMovimiento NVARCHAR(30),
  @CantidadDiferencial INT,
  @SaldoAnterior INT,
  @SaldoPosterior INT,
  @IDUsuario INT,
  @Motivo NVARCHAR(200),
  @ReferenciaOrigen NVARCHAR(100) = NULL,
  @IDPedido INT = NULL,
  @IDMovimientoVentaRelacionado BIGINT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  INSERT dbo.InventarioMovimientos (
    IDPublico, IDVariante, TipoMovimiento, CantidadDiferencial,
    SaldoAnterior, SaldoPosterior, IDUsuario, Motivo, ReferenciaOrigen,
    IDPedido, IDMovimientoVentaRelacionado
  )
  VALUES (
    @IDPublico, @IDVariante, @TipoMovimiento, @CantidadDiferencial,
    @SaldoAnterior, @SaldoPosterior, @IDUsuario, @Motivo, @ReferenciaOrigen,
    @IDPedido, @IDMovimientoVentaRelacionado
  );

  SELECT SCOPE_IDENTITY() AS IDMovimiento;
END;
GO

-- Total de reintegros vinculados a una venta concreta. La lectura permanece
-- bloqueada porque se usa para limitar compensaciones concurrentes.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientosSumarReintegrados
  @IDMovimientoVentaRelacionado BIGINT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COALESCE(SUM(m.CantidadDiferencial), 0) AS CantidadReintegrada
  FROM dbo.InventarioMovimientos AS m WITH (UPDLOCK, HOLDLOCK)
  WHERE m.IDMovimientoVentaRelacionado = @IDMovimientoVentaRelacionado
    AND m.TipoMovimiento IN ('CUSTOMER_RETURN', 'SALE_CANCELLATION');
END;
GO

-- Líneas congeladas de un pedido que el llamador ya resolvió dentro de su
-- transacción. El procedimiento histórico por UUID se mantiene para las
-- entradas externas que todavía lo requieran.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_DetalleListarPorID
  @IDPedido INT
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.Pedidos
    WHERE IDPedido = @IDPedido
  )
    THROW 50560, N'El pedido indicado no existe', 1;

  SELECT
    d.IDPublico,
    CONVERT(NVARCHAR(36), pv.IDPublico) AS IDPublicoVariante,
    d.IDVariante,
    d.SKU,
    d.NombreProducto,
    d.NombreVariante,
    d.Cantidad,
    d.CantidadDevuelta,
    d.PrecioUnitarioNeto,
    d.PrecioUnitarioBruto,
    d.SubtotalBruto,
    d.DescuentoLinea,
    d.TotalLineaBruto
  FROM dbo.PedidosDetalle AS d
  JOIN dbo.ProductosVariantes AS pv ON pv.IDVariante = d.IDVariante
  WHERE d.IDPedido = @IDPedido
  ORDER BY d.IDPedidoDetalle;
END;
GO

-- Líneas congeladas para las vistas de detalle cuando la cabecera ya se
-- resolvió. Se conserva la variante pública porque pertenece a la respuesta,
-- no a la relación interna del pedido.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarDetallePorID
  @IDPedido INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    d.IDPublico,
    CONVERT(NVARCHAR(36), pv.IDPublico) AS IDPublicoVariante,
    d.SKU,
    d.NombreProducto,
    d.NombreVariante,
    d.Cantidad,
    d.CantidadDevuelta,
    d.PrecioUnitarioNeto,
    d.PrecioUnitarioBruto,
    d.SubtotalBruto,
    d.DescuentoLinea,
    d.TotalLineaBruto
  FROM dbo.PedidosDetalle AS d
  JOIN dbo.ProductosVariantes AS pv ON pv.IDVariante = d.IDVariante
  WHERE d.IDPedido = @IDPedido
  ORDER BY d.IDPedidoDetalle;
END;
GO

-- Historial de un pedido cuya cabecera ya fue resuelta. Se conserva el SP
-- por UUID para las entradas externas que aún deben encontrar la orden.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_HistorialListarPorID
  @IDPedido INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    h.EstadoAnterior,
    h.EstadoNuevo,
    h.Motivo,
    h.FechaCambio,
    u.Correo AS CorreoUsuario,
    u.Rol AS RolUsuario
  FROM dbo.PedidosHistorialEstados AS h
  JOIN dbo.Usuarios AS u ON u.IDUsuario = h.IDUsuario
  WHERE h.IDPedido = @IDPedido
  ORDER BY h.FechaCambio ASC, h.IDHistorial ASC;
END;
GO

-- Cabecera para un pedido ya identificado internamente. La restricción por
-- usuario preserva la comprobación de propiedad del reintento idempotente.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerPorID
  @IDPedido INT,
  @IDUsuario INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    o.IDPedido,
    o.IDPublico,
    o.NumeroPedido,
    o.IDUsuario,
    o.IDDireccionOrigen,
    o.IDReservaInventario,
    o.IDCupon,
    o.CodigoCupon,
    o.NombresRecibe,
    o.ApellidosRecibe,
    o.TelefonoEntrega,
    o.DepartamentoEntrega,
    o.MunicipioEntrega,
    o.DireccionExactaEntrega,
    o.ReferenciaEntrega,
    o.SubtotalBruto,
    o.DescuentoTotal,
    o.CostoEnvio,
    o.TotalNeto,
    o.TotalIVA,
    o.TotalPagar,
    o.EstadoPedido,
    o.EstadoPago,
    o.MetodoPago,
    o.FechaCreacion,
    o.FechaActualizacion,
    pago.IDPublico AS IDPublicoPago,
    pago.NombreBanco,
    pago.NumeroReferencia,
    pago.DatosProveedor,
    pago.IDUsuarioVerificador,
    pago.MotivoVerificacion,
    pago.FechaVerificacion
  FROM dbo.Pedidos AS o
  LEFT JOIN dbo.PedidosPagos AS pago ON pago.IDPedido = o.IDPedido
  WHERE o.IDPedido = @IDPedido
    AND (@IDUsuario IS NULL OR o.IDUsuario = @IDUsuario);
END;
GO

-- Reserva ya resuelta en checkout: se bloquea directamente por su PK, sin
-- repetir la búsqueda por UUID público. Conserva los dos recordsets de la
-- variante pública para los flujos cuya entrada aún es externa.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasObtenerBloquearEstadoPorID
  @IDReserva INT
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDReservaBloqueada INT = (
    SELECT r.IDReserva
    FROM dbo.InventarioReservas AS r WITH (UPDLOCK, HOLDLOCK)
    WHERE r.IDReserva = @IDReserva
  );

  SELECT r.IDReserva, r.IDPublico AS IDPublicoReserva, r.ReferenciaOrigen, r.IDUsuario,
         r.Estado, r.FechaCreacion, r.FechaVencimiento, r.FechaCierre
  FROM dbo.InventarioReservas AS r
  WHERE r.IDReserva = @IDReservaBloqueada;

  SELECT d.IDDReservaDetalle, d.IDPublico AS IDPublicoDetalle,
         d.IDVariante, v.IDPublico AS IDPublicoVariante, d.Cantidad
  FROM dbo.InventarioReservasDetalle AS d
  JOIN dbo.ProductosVariantes AS v ON v.IDVariante = d.IDVariante
  WHERE d.IDReserva = @IDReservaBloqueada
  ORDER BY d.IDDReservaDetalle ASC;
END;
GO

-- Líneas del pedido por su PK interna. Incluye la PK de cada detalle para
-- que las actualizaciones posteriores de una devolución no tengan que volver
-- a localizar la línea por UUID.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarDetallePorID
  @IDPedido INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    d.IDPedidoDetalle,
    d.IDPublico,
    d.IDVariante,
    CONVERT(NVARCHAR(36), pv.IDPublico) AS IDPublicoVariante,
    d.SKU,
    d.NombreProducto,
    d.NombreVariante,
    d.Cantidad,
    d.CantidadDevuelta,
    d.PrecioUnitarioNeto,
    d.PrecioUnitarioBruto,
    d.SubtotalBruto,
    d.DescuentoLinea,
    d.TotalLineaBruto
  FROM dbo.PedidosDetalle AS d
  JOIN dbo.ProductosVariantes AS pv ON pv.IDVariante = d.IDVariante
  WHERE d.IDPedido = @IDPedido
  ORDER BY d.IDPedidoDetalle;
END;
GO

-- La línea ya fue localizada y validada dentro de su pedido; la devolución
-- actualiza directamente la PK interna y toca la cabecera correspondiente.
CREATE OR ALTER PROCEDURE dbo.SP_PedidosDetalle_RegistrarDevolucionPorID
  @IDPedidoDetalle INT,
  @NuevaCantidadDevuelta INT,
  @FechaActualizacion DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.PedidosDetalle
  SET CantidadDevuelta = @NuevaCantidadDevuelta
  WHERE IDPedidoDetalle = @IDPedidoDetalle;

  UPDATE o
  SET o.FechaActualizacion = @FechaActualizacion
  FROM dbo.Pedidos AS o
  JOIN dbo.PedidosDetalle AS d ON d.IDPedido = o.IDPedido
  WHERE d.IDPedidoDetalle = @IDPedidoDetalle;
END;
GO

-- The shared pagination mapper expects the first recordset's count under
-- this explicit alias.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_SaldosListar
  @SoloDisponible BIT = 0, @SoloActivas BIT = NULL, @Busqueda NVARCHAR(100) = NULL,
  @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.ProductosVariantes v
    JOIN dbo.Productos p ON p.IDProducto = v.IDProducto
    OUTER APPLY (
      SELECT SUM(rd.Cantidad) AS CantidadReservada
      FROM dbo.InventarioReservasDetalle rd
        JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
      WHERE rd.IDVariante = v.IDVariante AND r.Estado = 'ACTIVE'
        AND r.FechaVencimiento > SYSUTCDATETIME()
    ) AS R
  WHERE (@SoloActivas IS NULL OR (@SoloActivas = 1 AND v.Activo = 1 AND v.Eliminado = 0))
    AND (@SoloDisponible = 0 OR v.ExistenciaFisica - ISNULL(R.CantidadReservada, 0) > 0)
    AND (@Busqueda IS NULL OR v.SKU LIKE '%' + @Busqueda + '%' OR p.Nombre LIKE '%' + @Busqueda + '%');

  SELECT v.IDPublico AS IDPublicoVariante, v.SKU, p.Nombre AS NombreProducto,
         v.Activo, v.Eliminado, v.ExistenciaFisica,
         ISNULL(R.CantidadReservada, 0) AS ExistenciaReservada,
         v.ExistenciaFisica - ISNULL(R.CantidadReservada, 0) AS ExistenciaDisponible,
         v.FechaActualizacion
  FROM dbo.ProductosVariantes v
    JOIN dbo.Productos p ON p.IDProducto = v.IDProducto
    OUTER APPLY (
      SELECT SUM(rd.Cantidad) AS CantidadReservada
      FROM dbo.InventarioReservasDetalle rd
        JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
      WHERE rd.IDVariante = v.IDVariante AND r.Estado = 'ACTIVE'
        AND r.FechaVencimiento > SYSUTCDATETIME()
    ) AS R
  WHERE (@SoloActivas IS NULL OR (@SoloActivas = 1 AND v.Activo = 1 AND v.Eliminado = 0))
    AND (@SoloDisponible = 0 OR v.ExistenciaFisica - ISNULL(R.CantidadReservada, 0) > 0)
    AND (@Busqueda IS NULL OR v.SKU LIKE '%' + @Busqueda + '%' OR p.Nombre LIKE '%' + @Busqueda + '%')
  ORDER BY p.Nombre ASC, v.Orden ASC, v.IDVariante ASC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientosListarDeVariante
  @IDPublicoVariante UNIQUEIDENTIFIER, @TipoMovimiento NVARCHAR(30) = NULL,
  @FechaDesde DATETIME2(3) = NULL, @FechaHasta DATETIME2(3) = NULL,
  @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.InventarioMovimientos m
    JOIN dbo.ProductosVariantes v ON v.IDVariante = m.IDVariante
  WHERE v.IDPublico = @IDPublicoVariante
    AND (@TipoMovimiento IS NULL OR m.TipoMovimiento = @TipoMovimiento)
    AND (@FechaDesde IS NULL OR m.FechaRegistro >= @FechaDesde)
    AND (@FechaHasta IS NULL OR m.FechaRegistro <= @FechaHasta);

  SELECT m.IDMovimiento, m.IDPublico AS IDPublicoMovimiento,
         v.IDPublico AS IDPublicoVariante,
         m.TipoMovimiento, m.CantidadDiferencial, m.SaldoAnterior, m.SaldoPosterior,
         m.IDUsuario, u.IDPublico AS UsuarioIDPublico, u.Nombres, u.Apellidos,
         m.Motivo, m.ReferenciaOrigen, m.IDPublicoVentaRelacionada, m.FechaRegistro
  FROM dbo.InventarioMovimientos m
    JOIN dbo.ProductosVariantes v ON v.IDVariante = m.IDVariante
    JOIN dbo.Usuarios u ON u.IDUsuario = m.IDUsuario
  WHERE v.IDPublico = @IDPublicoVariante
    AND (@TipoMovimiento IS NULL OR m.TipoMovimiento = @TipoMovimiento)
    AND (@FechaDesde IS NULL OR m.FechaRegistro >= @FechaDesde)
    AND (@FechaHasta IS NULL OR m.FechaRegistro <= @FechaHasta)
  ORDER BY m.FechaRegistro DESC, m.IDMovimiento DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO
