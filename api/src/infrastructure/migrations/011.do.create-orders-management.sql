-- Módulo de gestión de pedidos: vista de resumen de pedidos + procedures de
-- consulta paginada (cliente / administración), detalle, historial y
-- actualizaciones puras de estado y devoluciones. Solo acceso a datos: las
-- validaciones de negocio residen en la capa de aplicación/dominio.
--
-- Los lotes (GO) se ejecutan dentro de una única transacción gestionada por
-- el runner (postgrator), por eso no se abre transacción explícita aquí.
--
-- No se usa THROW (rango 50570..50579 reservado y libre): los procedures de
-- lectura no lanzan errores cuando el pedido no existe (la capa aplicación
-- decide el 404) y los de escritura son UPDATE puros sin validaciones.
-- No se otorgan permisos: el resto del esquema tampoco lo hace.

-- Vista de resumen: cabecera de pedido + datos básicos del cliente + fila
-- de pago (una por pedido) + total de líneas y unidades solicitadas.
CREATE OR ALTER VIEW dbo.VW_Pedidos_Resumen
AS
SELECT
  o.IDPedido,
  o.IDPublico,
  o.NumeroPedido,
  o.IDUsuario,
  u.IDPublico AS IDPublicoUsuario,
  u.Correo AS CorreoUsuario,
  u.Nombres AS NombresUsuario,
  u.Apellidos AS ApellidosUsuario,
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
  pago.Monto AS MontoPago,
  pago.NombreBanco,
  pago.NumeroReferencia,
  COALESCE(d.TotalLineas, 0) AS TotalLineas,
  COALESCE(d.TotalUnidades, 0) AS TotalUnidades
FROM dbo.Pedidos o
JOIN dbo.Usuarios u ON u.IDUsuario = o.IDUsuario
LEFT JOIN dbo.PedidosPagos pago ON pago.IDPedido = o.IDPedido
LEFT JOIN (
  SELECT
    IDPedido,
    COUNT(*) AS TotalLineas,
    SUM(Cantidad) AS TotalUnidades
  FROM dbo.PedidosDetalle
  GROUP BY IDPedido
) d ON d.IDPedido = o.IDPedido;
GO

-- Listado paginado de pedidos de un cliente (RF-01), ordenado del más
-- reciente al más antiguo. Segundo rowset: TotalRegistros para paginar.
-- La paginación y el filtro de estado se validan en la capa aplicación.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarPorCliente
  @IDUsuario INT,
  @EstadoPedido NVARCHAR(40) = NULL,
  @Pagina INT,
  @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    r.IDPedido,
    r.IDPublico,
    r.NumeroPedido,
    r.IDUsuario,
    r.IDPublicoUsuario,
    r.CorreoUsuario,
    r.NombresUsuario,
    r.ApellidosUsuario,
    r.SubtotalBruto,
    r.DescuentoTotal,
    r.CostoEnvio,
    r.TotalNeto,
    r.TotalIVA,
    r.TotalPagar,
    r.EstadoPedido,
    r.EstadoPago,
    r.MetodoPago,
    r.FechaCreacion,
    r.FechaActualizacion,
    r.IDPublicoPago,
    r.MontoPago,
    r.NombreBanco,
    r.NumeroReferencia,
    r.TotalLineas,
    r.TotalUnidades
  FROM dbo.VW_Pedidos_Resumen r
  WHERE r.IDUsuario = @IDUsuario
    AND (@EstadoPedido IS NULL OR r.EstadoPedido = @EstadoPedido)
  ORDER BY r.FechaCreacion DESC, r.IDPedido DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;

  SELECT COUNT(1) AS TotalRegistros
  FROM dbo.VW_Pedidos_Resumen r
  WHERE r.IDUsuario = @IDUsuario
    AND (@EstadoPedido IS NULL OR r.EstadoPedido = @EstadoPedido);
END;
GO

-- Listado paginado para el staff (operadores/administradores), con filtros
-- opcionales. Segundo rowset: TotalRegistros para paginar. @FechaHasta es
-- excluyente para permitir rangos [desde, hasta).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarAdmin
  @EstadoPedido NVARCHAR(40) = NULL,
  @EstadoPago NVARCHAR(40) = NULL,
  @IDPublicoUsuario UNIQUEIDENTIFIER = NULL,
  @Busqueda NVARCHAR(254) = NULL,
  @FechaDesde DATETIME2(3) = NULL,
  @FechaHasta DATETIME2(3) = NULL,
  @Pagina INT,
  @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    r.IDPedido,
    r.IDPublico,
    r.NumeroPedido,
    r.IDUsuario,
    r.IDPublicoUsuario,
    r.CorreoUsuario,
    r.NombresUsuario,
    r.ApellidosUsuario,
    r.SubtotalBruto,
    r.DescuentoTotal,
    r.CostoEnvio,
    r.TotalNeto,
    r.TotalIVA,
    r.TotalPagar,
    r.EstadoPedido,
    r.EstadoPago,
    r.MetodoPago,
    r.FechaCreacion,
    r.FechaActualizacion,
    r.IDPublicoPago,
    r.MontoPago,
    r.NombreBanco,
    r.NumeroReferencia,
    r.TotalLineas,
    r.TotalUnidades
  FROM dbo.VW_Pedidos_Resumen r
  WHERE (@EstadoPedido IS NULL OR r.EstadoPedido = @EstadoPedido)
    AND (@EstadoPago IS NULL OR r.EstadoPago = @EstadoPago)
    AND (@IDPublicoUsuario IS NULL OR r.IDPublicoUsuario = @IDPublicoUsuario)
    AND (@Busqueda IS NULL
      OR r.NumeroPedido LIKE N'%' + @Busqueda + N'%'
      OR r.CorreoUsuario LIKE N'%' + @Busqueda + N'%')
    AND (@FechaDesde IS NULL OR r.FechaCreacion >= @FechaDesde)
    AND (@FechaHasta IS NULL OR r.FechaCreacion < @FechaHasta)
  ORDER BY r.FechaCreacion DESC, r.IDPedido DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;

  SELECT COUNT(1) AS TotalRegistros
  FROM dbo.VW_Pedidos_Resumen r
  WHERE (@EstadoPedido IS NULL OR r.EstadoPedido = @EstadoPedido)
    AND (@EstadoPago IS NULL OR r.EstadoPago = @EstadoPago)
    AND (@IDPublicoUsuario IS NULL OR r.IDPublicoUsuario = @IDPublicoUsuario)
    AND (@Busqueda IS NULL
      OR r.NumeroPedido LIKE N'%' + @Busqueda + N'%'
      OR r.CorreoUsuario LIKE N'%' + @Busqueda + N'%')
    AND (@FechaDesde IS NULL OR r.FechaCreacion >= @FechaDesde)
    AND (@FechaHasta IS NULL OR r.FechaCreacion < @FechaHasta);
END;
GO

-- Cabecera completa de un pedido por id público: todas las columnas para
-- reconstruir el snapshot de la entidad Order, más el pago y el cliente.
-- Si no existe NO lanza error: devuelve cero filas (la capa aplicación
-- decide el 404).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerDetallePorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    o.IDPedido,
    o.IDPublico,
    o.NumeroPedido,
    o.IDUsuario,
    CONVERT(NVARCHAR(36), dc.IDPublico) AS IDDireccionOrigenPublico,
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
    pago.Monto AS MontoPago,
    pago.NombreBanco,
    pago.NumeroReferencia,
    pago.EstadoPago AS EstadoPagoPago,
    pago.IDUsuarioVerificador,
    pago.MotivoVerificacion,
    pago.FechaVerificacion,
    u.IDPublico AS IDPublicoUsuario,
    u.Correo AS CorreoUsuario,
    u.Nombres AS NombresUsuario,
    u.Apellidos AS ApellidosUsuario
  FROM dbo.Pedidos o
  LEFT JOIN dbo.PedidosPagos pago ON pago.IDPedido = o.IDPedido
  LEFT JOIN dbo.DireccionesClientes dc ON dc.IDDireccion = o.IDDireccionOrigen
  LEFT JOIN dbo.Usuarios u ON u.IDUsuario = o.IDUsuario
  WHERE o.IDPublico = @IDPublico;
END;
GO

-- Líneas del pedido por id público. Si el pedido no existe devuelve cero
-- filas (sin error: la capa aplicación decide el 404).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ListarDetallePorIDPublico
  @IDPublicoPedido UNIQUEIDENTIFIER
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
  FROM dbo.PedidosDetalle d
  JOIN dbo.Pedidos o ON o.IDPedido = d.IDPedido
  JOIN dbo.ProductosVariantes pv ON pv.IDVariante = d.IDVariante
  WHERE o.IDPublico = @IDPublicoPedido
  ORDER BY d.IDPedidoDetalle;
END;
GO

-- Historial cronológico del estado del pedido por id público. Si el pedido
-- no existe devuelve cero filas (sin error).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_HistorialListarPorIDPublico
  @IDPublicoPedido UNIQUEIDENTIFIER
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
  FROM dbo.PedidosHistorialEstados h
  JOIN dbo.Pedidos o ON o.IDPedido = h.IDPedido
  JOIN dbo.Usuarios u ON u.IDUsuario = h.IDUsuario
  WHERE o.IDPublico = @IDPublicoPedido
  ORDER BY h.FechaCambio ASC, h.IDHistorial ASC;
END;
GO

-- Actualiza los estados del pedido. UPDATE puro: sin validaciones de
-- negocio (las transiciones legales las define la entidad de dominio).
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ActualizarEstado
  @IDPedido INT,
  @EstadoPedido NVARCHAR(40),
  @EstadoPago NVARCHAR(40),
  @FechaActualizacion DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Pedidos
  SET EstadoPedido = @EstadoPedido,
      EstadoPago = @EstadoPago,
      FechaActualizacion = @FechaActualizacion
  WHERE IDPedido = @IDPedido;
END;
GO

-- Registra la cantidad devuelta de una línea y toca la marca de
-- actualización de la cabecera. UPDATE puro: el dominio valida reglas
-- (cuotas parciales, límites). El CHECK existente
-- CK_PedidosDetalle_Devuelto (0 <= CantidadDevuelta <= Cantidad) sigue
-- protegiendo la integridad y su violación aborta la transacción del
-- llamado (UnitOfWork) vía XACT_ABORT.
CREATE OR ALTER PROCEDURE dbo.SP_PedidosDetalle_RegistrarDevolucion
  @IDPublicoDetalle UNIQUEIDENTIFIER,
  @NuevaCantidadDevuelta INT,
  @FechaActualizacion DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.PedidosDetalle
  SET CantidadDevuelta = @NuevaCantidadDevuelta
  WHERE IDPublico = @IDPublicoDetalle;

  UPDATE o
  SET o.FechaActualizacion = @FechaActualizacion
  FROM dbo.Pedidos o
  JOIN dbo.PedidosDetalle d ON d.IDPedido = o.IDPedido
  WHERE d.IDPublico = @IDPublicoDetalle;
END;
GO
