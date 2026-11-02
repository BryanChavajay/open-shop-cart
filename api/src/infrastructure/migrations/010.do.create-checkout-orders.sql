-- Checkout / orders module: sales orders with a frozen delivery-address
-- snapshot, frozen per-line pricing (incl. IVA 12%), the payment record and
-- its operator verification, the order state-transition history, and the
-- checkout idempotency ledger, plus the access procedures.
-- Write procedures do not open transactions: they run inside the caller's
-- transaction (the Node UnitOfWork). Read procedures never open transactions.
--
-- DECISIONS (documented only, not enforced here):
--   * The order freezes the delivery address (denormalized copy) and the
--     per-line prices/discounts at confirmation time: later catalog, coupon
--     or address changes never alter a registered order.
--   * Amounts are gross (IVA 12% included) in quetzales; TotalNeto/TotalIVA
--     carry the document-level tax split the app computes (half-up, scale 2).
--   * One payment row per order (UQ on IDPedido): the lifecycle moves the
--     payment STATUS instead of adding rows (rejected/transferred flows
--     document evidence in MotivoVerificacion / DatosProveedor).
--   * Address shortage: Pedidos keeps IDDireccionOrigen FK plus the frozen
--     snapshot, so a logically deleted address never break reads.
--   * The idempotency ledger (CheckoutOperaciones) serializes repeated
--     confirmation attempts: (IDUsuario, ClaveIdempotencia) is unique and the
--     obtain procedure takes UPDLOCK so concurrent retries queue up.
--
-- THROW error codes (distinct per condition), range 50550..50599:
--   50550  SP_Checkout_VariantesObtenerParaCotizar    JSON mal formado, lineas vacias o con id publico invalido
--   50551  SP_Checkout_VariantesObtenerParaCotizar    linea con cantidad invalida (no entera o <= 0)
--   50552  SP_Pedidos_Crear                           usuario inexistente
--   50553  SP_Pedidos_Crear                           direccion inexistente, eliminada o de otro usuario
--   50554  SP_Pedidos_Crear                           NumeroPedido ya registrado
--   50555  SP_Pedidos_DetalleAgregar                  pedido inexistente
--   50556  SP_Pedidos_PagoRegistrar                   pedido inexistente
--   50557  SP_Pedidos_HistorialAgregar                pedido inexistente
--   50558  SP_Pedidos_ActualizarVerificacionPago      pedido inexistente
--   50559  SP_Checkout_OperacionGuardar               pedido inexistente
--   50560  SP_Pedidos_DetalleListar                   pedido inexistente o de otro usuario
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  -- One row per order. Estados describe intent; verification moves both.
  CREATE TABLE dbo.Pedidos (
    IDPedido INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Pedidos PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Pedidos_IDPublico UNIQUE,
    NumeroPedido NVARCHAR(30) NOT NULL CONSTRAINT UQ_Pedidos_NumeroPedido UNIQUE,
    IDUsuario INT NOT NULL CONSTRAINT FK_Pedidos_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    IDDireccionOrigen INT NOT NULL CONSTRAINT FK_Pedidos_DireccionesClientes REFERENCES dbo.DireccionesClientes(IDDireccion),
    IDReservaInventario INT NULL CONSTRAINT FK_Pedidos_InventarioReservas REFERENCES dbo.InventarioReservas(IDReserva),
    IDCupon INT NULL CONSTRAINT FK_Pedidos_Cupones REFERENCES dbo.Cupones(IDCupon),
    CodigoCupon NVARCHAR(64) NULL,

    -- Frozen delivery snapshot (owner + address copy at confirmation time).
    NombresRecibe NVARCHAR(100) NOT NULL,
    ApellidosRecibe NVARCHAR(100) NOT NULL,
    TelefonoEntrega NVARCHAR(20) NOT NULL,
    DepartamentoEntrega NVARCHAR(100) NOT NULL,
    MunicipioEntrega NVARCHAR(100) NOT NULL,
    DireccionExactaEntrega NVARCHAR(300) NOT NULL,
    ReferenciaEntrega NVARCHAR(300) NOT NULL,

    -- Frozen gross amounts (IVA 12% included, quetzales, scale 2).
    SubtotalBruto DECIMAL(10, 2) NOT NULL,
    DescuentoTotal DECIMAL(10, 2) NOT NULL CONSTRAINT DF_Pedidos_DescuentoTotal DEFAULT 0,
    CostoEnvio DECIMAL(10, 2) NOT NULL,
    -- Document-level tax split: gross minus tax and the tax portion itself.
    TotalNeto DECIMAL(10, 2) NOT NULL,
    TotalIVA DECIMAL(10, 2) NOT NULL,
    TotalPagar DECIMAL(10, 2) NOT NULL,

    EstadoPedido NVARCHAR(40) NOT NULL,
    EstadoPago NVARCHAR(40) NOT NULL,
    MetodoPago NVARCHAR(30) NOT NULL,

    FechaCreacion DATETIME2(3) NOT NULL CONSTRAINT DF_Pedidos_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_Pedidos_FechaActualizacion DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_Pedidos_EstadoPedido CHECK (EstadoPedido IN
      ('PENDING_PAYMENT_VERIFICATION', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    CONSTRAINT CK_Pedidos_EstadoPago CHECK (EstadoPago IN
      ('PENDING_VERIFICATION', 'PENDING_ON_DELIVERY', 'PAID', 'REJECTED', 'REFUNDED')),
    CONSTRAINT CK_Pedidos_MetodoPago CHECK (MetodoPago IN
      ('BANK_TRANSFER', 'CASH_ON_DELIVERY', 'CARD')),
    CONSTRAINT CK_Pedidos_Cupon CHECK (
      (IDCupon IS NULL AND CodigoCupon IS NULL)
      OR (IDCupon IS NOT NULL AND CodigoCupon IS NOT NULL)
    ),
    CONSTRAINT CK_Pedidos_Importes CHECK (
      SubtotalBruto >= 0 AND DescuentoTotal >= 0 AND CostoEnvio >= 0
      AND TotalNeto >= 0 AND TotalIVA >= 0 AND TotalPagar >= 0
    ),
    CONSTRAINT CK_Pedidos_EntradaEntrega CHECK (
      NombresRecibe <> N'' AND ApellidosRecibe <> N''
      AND DireccionExactaEntrega <> N'' AND ReferenciaEntrega <> N''
    ),
    CONSTRAINT CK_Pedidos_TelefonoEntrega CHECK (
      LEN(TelefonoEntrega) = 8 AND TelefonoEntrega NOT LIKE '%[^0-9]%'
    )
  );

  CREATE INDEX IX_Pedidos_IDUsuario_EstadoPedido
    ON dbo.Pedidos(IDUsuario, EstadoPedido, FechaCreacion DESC);

  CREATE INDEX IX_Pedidos_IDDireccionOrigen
    ON dbo.Pedidos(IDDireccionOrigen);

  CREATE INDEX IX_Pedidos_IDCupon
    ON dbo.Pedidos(IDCupon) WHERE IDCupon IS NOT NULL;

  -- One row per ordered variant, prices frozen per line (support for partial
  -- per-line returns that square to the cent).
  CREATE TABLE dbo.PedidosDetalle (
    IDPedidoDetalle INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PedidosDetalle PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_PedidosDetalle_IDPublico UNIQUE,
    IDPedido INT NOT NULL CONSTRAINT FK_PedidosDetalle_Pedidos REFERENCES dbo.Pedidos(IDPedido),
    IDVariante INT NOT NULL CONSTRAINT FK_PedidosDetalle_ProductosVariantes REFERENCES dbo.ProductosVariantes(IDVariante),
    SKU NVARCHAR(64) NOT NULL,
    NombreProducto NVARCHAR(200) NOT NULL,
    NombreVariante NVARCHAR(100) NOT NULL,
    Cantidad INT NOT NULL,
    CantidadDevuelta INT NOT NULL CONSTRAINT DF_PedidosDetalle_CantidadDevuelta DEFAULT 0,
    PrecioUnitarioNeto DECIMAL(10, 2) NOT NULL,
    PrecioUnitarioBruto DECIMAL(10, 2) NOT NULL,
    SubtotalBruto DECIMAL(10, 2) NOT NULL,
    DescuentoLinea DECIMAL(10, 2) NOT NULL CONSTRAINT DF_PedidosDetalle_DescuentoLinea DEFAULT 0,
    TotalLineaBruto DECIMAL(10, 2) NOT NULL,

    CONSTRAINT CK_PedidosDetalle_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_PedidosDetalle_Devuelto CHECK (
      CantidadDevuelta >= 0 AND CantidadDevuelta <= Cantidad
    ),
    CONSTRAINT CK_PedidosDetalle_Importes CHECK (
      PrecioUnitarioNeto >= 0 AND PrecioUnitarioBruto >= 0
      AND SubtotalBruto >= 0 AND DescuentoLinea >= 0 AND TotalLineaBruto >= 0
    ),
    CONSTRAINT UQ_PedidosDetalle_Pedido_Variante UNIQUE (IDPedido, IDVariante)
  );

  CREATE INDEX IX_PedidosDetalle_IDPedido
    ON dbo.PedidosDetalle(IDPedido);

  -- One row per order (UQ IDPedido): the payment lifecycle moves states.
  CREATE TABLE dbo.PedidosPagos (
    IDPedidoPago INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PedidosPagos PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_PedidosPagos_IDPublico UNIQUE,
    IDPedido INT NOT NULL CONSTRAINT UQ_PedidosPagos_IDPedido UNIQUE
      CONSTRAINT FK_PedidosPagos_Pedidos REFERENCES dbo.Pedidos(IDPedido),
    MetodoPago NVARCHAR(30) NOT NULL,
    EstadoPago NVARCHAR(40) NOT NULL,
    Monto DECIMAL(10, 2) NOT NULL,
    -- BANK_TRANSFER: bank the customer transferred through + receipt/boleta no.
    NombreBanco NVARCHAR(100) NULL,
    NumeroReferencia NVARCHAR(100) NULL,
    -- CARD/Estrategy provider metadata (e.g. Stripe PaymentIntent JSON).
    DatosProveedor NVARCHAR(MAX) NULL,
    IDUsuarioVerificador INT NULL CONSTRAINT FK_PedidosPagos_Verificador REFERENCES dbo.Usuarios(IDUsuario),
    MotivoVerificacion NVARCHAR(300) NULL,
    FechaVerificacion DATETIME2(3) NULL,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_PedidosPagos_FechaRegistro DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_PedidosPagos_MetodoPago CHECK (MetodoPago IN
      ('BANK_TRANSFER', 'CASH_ON_DELIVERY', 'CARD')),
    CONSTRAINT CK_PedidosPagos_EstadoPago CHECK (EstadoPago IN
      ('PENDING_VERIFICATION', 'PENDING_ON_DELIVERY', 'PAID', 'REJECTED', 'REFUNDED')),
    CONSTRAINT CK_PedidosPagos_Monto CHECK (Monto >= 0)
  );

  CREATE INDEX IX_PedidosPagos_EstadoPago_MetodoPago
    ON dbo.PedidosPagos(MetodoPago, EstadoPago);

  -- Every order state transition, append-only (user, reason, both states).
  CREATE TABLE dbo.PedidosHistorialEstados (
    IDHistorial INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PedidosHistorialEstados PRIMARY KEY,
    IDPedido INT NOT NULL CONSTRAINT FK_PedidosHistorialEstados_Pedidos REFERENCES dbo.Pedidos(IDPedido),
    EstadoAnterior NVARCHAR(40) NULL,
    EstadoNuevo NVARCHAR(40) NOT NULL,
    IDUsuario INT NOT NULL CONSTRAINT FK_PedidosHistorialEstados_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    Motivo NVARCHAR(300) NULL,
    FechaCambio DATETIME2(3) NOT NULL CONSTRAINT DF_PedidosHistorialEstados_FechaCambio DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_PedidosHistorialEstados_IDPedido
    ON dbo.PedidosHistorialEstados(IDPedido, FechaCambio DESC);

  -- Checkout idempotency ledger: one confirmation per (customer, key).
  CREATE TABLE dbo.CheckoutOperaciones (
    IDOperacion INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CheckoutOperaciones PRIMARY KEY,
    IDUsuario INT NOT NULL CONSTRAINT FK_CheckoutOperaciones_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    ClaveIdempotencia NVARCHAR(100) NOT NULL,
    HuellaCanonica NVARCHAR(64) NOT NULL,
    IDPedido INT NOT NULL CONSTRAINT FK_CheckoutOperaciones_Pedidos REFERENCES dbo.Pedidos(IDPedido),
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_CheckoutOperaciones_FechaRegistro DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_CheckoutOperaciones_Usuario_Clave UNIQUE (IDUsuario, ClaveIdempotencia)
  );

  CREATE INDEX IX_CheckoutOperaciones_IDPedido
    ON dbo.CheckoutOperaciones(IDPedido);

  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

-- Quotes the cart lines for checkout: resolves each variant and returns its
-- commercially relevant state (active flags, net price, category, stock).
-- The application performs every money computation (gross with IVA, coupon
-- allocations) with scale-2 BigInt math; this procedure only resolves data.
-- @JSONLineas: JSON array like [{"idPublico":"<uuid>","cantidad":2}].
-- 50550: malformed JSON, empty lines or an invalid variant public id.
-- 50551: a line carries an invalid quantity (non-integer or <= 0).
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_VariantesObtenerParaCotizar
  @JSONLineas NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;

  IF @JSONLineas IS NULL
    OR TRY_CONVERT(json, @JSONLineas) IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM OPENJSON(@JSONLineas) WITH (
        idPublico NVARCHAR(64) '$.idPublico',
        cantidad INT '$.cantidad'
      )
    )
    THROW 50550, N'Las lineas de cotizacion llegaron vacias, mal formadas o con id invalido', 1;

  IF EXISTS (
    SELECT 1
    FROM OPENJSON(@JSONLineas) WITH (
      idPublico NVARCHAR(64) '$.idPublico',
      cantidad INT '$.cantidad'
    )
    WHERE TRY_CAST(idPublico AS UNIQUEIDENTIFIER) IS NULL
      OR cantidad IS NULL OR cantidad <= 0
  )
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM OPENJSON(@JSONLineas) WITH (
        idPublico NVARCHAR(64) '$.idPublico',
        cantidad INT '$.cantidad'
      )
      WHERE cantidad IS NULL OR cantidad <= 0
    )
      THROW 50550, N'Las lineas de cotizacion llegaron con un id publico invalido', 1;
    THROW 50551, N'Las lineas de cotizacion deben llevar cantidades enteras mayores que cero', 1;
  END;

  SELECT
    pv.IDVariante,
    pv.IDPublico,
    pv.SKU,
    p.Nombre AS NombreProducto,
    pv.NombreVariante,
    pv.PrecioUnitario,
    -- Existence/activation copied out for the use case to decide.
    CASE WHEN p.Activo = 1 AND p.Eliminado = 0 THEN 1 ELSE 0 END AS ActivoProducto,
    pv.Activo AS ActivoVariante,
    pv.Eliminado AS EliminadoVariante,
    pv.ExistenciaFisica,
    -- Category scope for coupon evaluation.
    c.IDPublico AS IDPublicoCategoria,
    c.Nombre AS NombreCategoria,
    -- Requested quantity travels back so the use case can echo its own
    -- validated lines without re-parsing JSON.
    l.Cantidad AS CantidadSolicitada
  FROM (
    SELECT
      TRY_CAST(idPublico AS UNIQUEIDENTIFIER) AS IDPublicoVariante,
      cantidad AS Cantidad
    FROM OPENJSON(@JSONLineas) WITH (
      idPublico NVARCHAR(64) '$.idPublico',
      cantidad INT '$.cantidad'
    )
  ) l
  JOIN dbo.ProductosVariantes pv ON pv.IDPublico = l.IDPublicoVariante
  JOIN dbo.Productos p ON p.IDProducto = pv.IDProducto
  JOIN dbo.Categorias c ON c.IDCategoria = p.IDCategoria;
END;
GO

-- Reads the idempotency report for a (customer, key) confirmation attempt,
-- serialized against writers with UPDLOCK so two concurrent retries queue:
-- the loser re-reads the winner's row instead of racing its insert.
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_OperacionObtener
  @IDUsuario INT,
  @ClaveIdempotencia NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (1)
    o.IDOperacion,
    o.HuellaCanonica,
    o.IDPedido,
    p.IDPublico AS IDPublicoPedido
  FROM dbo.CheckoutOperaciones o WITH (UPDLOCK, HOLDLOCK)
  JOIN dbo.Pedidos p ON p.IDPedido = o.IDPedido
  WHERE o.IDUsuario = @IDUsuario
    AND o.ClaveIdempotencia = @ClaveIdempotencia;
END;
GO

-- Persists the confirmation receipt; the (IDUsuario, ClaveIdempotencia)
-- unique key backs the serialization in case the pre-check missed.
-- 50559: order not found.
CREATE OR ALTER PROCEDURE dbo.SP_Checkout_OperacionGuardar
  @IDUsuario INT,
  @ClaveIdempotencia NVARCHAR(100),
  @HuellaCanonica NVARCHAR(64),
  @IDPedido INT
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Pedidos WHERE IDPedido = @IDPedido)
    THROW 50559, N'El pedido a vincular con la operacion no existe', 1;

  INSERT INTO dbo.CheckoutOperaciones (
    IDUsuario, ClaveIdempotencia, HuellaCanonica, IDPedido
  )
  VALUES (
    @IDUsuario, @ClaveIdempotencia, @HuellaCanonica, @IDPedido
  );
END;
GO

-- Creates the order header. The use case generated IDPublico/NumeroPedido,
-- froze the amounts and passes the reservation/coupon/an address-public-id
-- wiring ids. The address is resolved by public id and ownership.
-- 50552: user not found.
-- 50553: address not found, deleted or owned by another user.
-- 50554: NumeroPedido already registered.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_Crear
  @IDPublico UNIQUEIDENTIFIER,
  @NumeroPedido NVARCHAR(30),
  @IDUsuario INT,
  @IDPublicoDireccion UNIQUEIDENTIFIER,
  @IDReservaInventario INT = NULL,
  @IDCupon INT = NULL,
  @CodigoCupon NVARCHAR(64) = NULL,
  @NombresRecibe NVARCHAR(100),
  @ApellidosRecibe NVARCHAR(100),
  @TelefonoEntrega NVARCHAR(20),
  @DepartamentoEntrega NVARCHAR(100),
  @MunicipioEntrega NVARCHAR(100),
  @DireccionExactaEntrega NVARCHAR(300),
  @ReferenciaEntrega NVARCHAR(300),
  @SubtotalBruto DECIMAL(10, 2),
  @DescuentoTotal DECIMAL(10, 2),
  @CostoEnvio DECIMAL(10, 2),
  @TotalNeto DECIMAL(10, 2),
  @TotalIVA DECIMAL(10, 2),
  @TotalPagar DECIMAL(10, 2),
  @EstadoPedido NVARCHAR(40),
  @EstadoPago NVARCHAR(40),
  @MetodoPago NVARCHAR(30)
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario)
    THROW 50552, N'El usuario indicado no existe', 1;

  DECLARE @IDDireccionOrigen INT = (
    SELECT IDDireccion
    FROM dbo.DireccionesClientes
    WHERE IDPublico = @IDPublicoDireccion
      AND IDUsuario = @IDUsuario
      AND Eliminado = 0
  );
  IF @IDDireccionOrigen IS NULL
    THROW 50553, N'La direccion de entrega no existe, fue eliminada o pertenece a otro cliente', 1;

  IF EXISTS (SELECT 1 FROM dbo.Pedidos WHERE NumeroPedido = @NumeroPedido)
    THROW 50554, N'El numero de pedido ya fue registrado', 1;

  INSERT INTO dbo.Pedidos (
    IDPublico, NumeroPedido, IDUsuario, IDDireccionOrigen, IDReservaInventario,
    IDCupon, CodigoCupon,
    NombresRecibe, ApellidosRecibe, TelefonoEntrega, DepartamentoEntrega,
    MunicipioEntrega, DireccionExactaEntrega, ReferenciaEntrega,
    SubtotalBruto, DescuentoTotal, CostoEnvio, TotalNeto, TotalIVA, TotalPagar,
    EstadoPedido, EstadoPago, MetodoPago
  )
  VALUES (
    @IDPublico, @NumeroPedido, @IDUsuario, @IDDireccionOrigen, @IDReservaInventario,
    @IDCupon, @CodigoCupon,
    @NombresRecibe, @ApellidosRecibe, @TelefonoEntrega, @DepartamentoEntrega,
    @MunicipioEntrega, @DireccionExactaEntrega, @ReferenciaEntrega,
    @SubtotalBruto, @DescuentoTotal, @CostoEnvio, @TotalNeto, @TotalIVA, @TotalPagar,
    @EstadoPedido, @EstadoPago, @MetodoPago
  );

  SELECT IDPedido, IDPublico, NumeroPedido
  FROM dbo.Pedidos
  WHERE IDPublico = @IDPublico;
END;
GO

-- Adds one frozen line to an order.
-- 50555: order not found.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_DetalleAgregar
  @IDPublicoDetalle UNIQUEIDENTIFIER,
  @IDPedido INT,
  @IDVariante INT,
  @SKU NVARCHAR(64),
  @NombreProducto NVARCHAR(200),
  @NombreVariante NVARCHAR(100),
  @Cantidad INT,
  @PrecioUnitarioNeto DECIMAL(10, 2),
  @PrecioUnitarioBruto DECIMAL(10, 2),
  @SubtotalBruto DECIMAL(10, 2),
  @DescuentoLinea DECIMAL(10, 2),
  @TotalLineaBruto DECIMAL(10, 2)
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Pedidos WHERE IDPedido = @IDPedido)
    THROW 50555, N'El pedido indicado no existe', 1;

  INSERT INTO dbo.PedidosDetalle (
    IDPublico, IDPedido, IDVariante, SKU, NombreProducto, NombreVariante,
    Cantidad, PrecioUnitarioNeto, PrecioUnitarioBruto, SubtotalBruto,
    DescuentoLinea, TotalLineaBruto
  )
  VALUES (
    @IDPublicoDetalle, @IDPedido, @IDVariante, @SKU, @NombreProducto,
    @NombreVariante, @Cantidad, @PrecioUnitarioNeto, @PrecioUnitarioBruto,
    @SubtotalBruto, @DescuentoLinea, @TotalLineaBruto
  );

  SELECT IDPedidoDetalle, IDPublico
  FROM dbo.PedidosDetalle
  WHERE IDPublico = @IDPublicoDetalle;
END;
GO

-- Registers the order payment with its method-specific evidence.
-- 50556: order not found. A second registration hits the UQ on IDPedido.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_PagoRegistrar
  @IDPublico UNIQUEIDENTIFIER,
  @IDPedido INT,
  @MetodoPago NVARCHAR(30),
  @EstadoPago NVARCHAR(40),
  @Monto DECIMAL(10, 2),
  @NombreBanco NVARCHAR(100) = NULL,
  @NumeroReferencia NVARCHAR(100) = NULL,
  @DatosProveedor NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Pedidos WHERE IDPedido = @IDPedido)
    THROW 50556, N'El pedido indicado no existe', 1;

  INSERT INTO dbo.PedidosPagos (
    IDPublico, IDPedido, MetodoPago, EstadoPago, Monto, NombreBanco,
    NumeroReferencia, DatosProveedor
  )
  VALUES (
    @IDPublico, @IDPedido, @MetodoPago, @EstadoPago, @Monto, @NombreBanco,
    @NumeroReferencia, @DatosProveedor
  );
END;
GO

-- Appends one order state transition to the history. Input validation of the
-- allowed transitions lives in the domain entity, not here.
-- 50557: order not found.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_HistorialAgregar
  @IDPedido INT,
  @EstadoAnterior NVARCHAR(40) = NULL,
  @EstadoNuevo NVARCHAR(40),
  @IDUsuario INT,
  @Motivo NVARCHAR(300) = NULL,
  @FechaCambio DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Pedidos WHERE IDPedido = @IDPedido)
    THROW 50557, N'El pedido indicado no existe', 1;

  INSERT INTO dbo.PedidosHistorialEstados (
    IDPedido, EstadoAnterior, EstadoNuevo, IDUsuario, Motivo, FechaCambio
  )
  VALUES (
    @IDPedido, @EstadoAnterior, @EstadoNuevo, @IDUsuario, @Motivo, @FechaCambio
  );
END;
GO

-- Reads an order header joined with its payment row. The optional user id
-- restricts to the owner (RF-01: a customer never reads foreign orders);
-- internal callers leave @IDUsuario NULL.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER,
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
  FROM dbo.Pedidos o
  LEFT JOIN dbo.PedidosPagos pago ON pago.IDPedido = o.IDPedido
  WHERE o.IDPublico = @IDPublico
    AND (@IDUsuario IS NULL OR o.IDUsuario = @IDUsuario);
END;
GO

-- Lists the frozen lines of an order; the optional user id restricts to the
-- owner (RF-01). 50560: order not found or owned by another user.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_DetalleListar
  @IDPublicoPedido UNIQUEIDENTIFIER,
  @IDUsuario INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.Pedidos o
    WHERE o.IDPublico = @IDPublicoPedido
      AND (@IDUsuario IS NULL OR o.IDUsuario = @IDUsuario)
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
  FROM dbo.PedidosDetalle d
  JOIN dbo.Pedidos o ON o.IDPedido = d.IDPedido
  JOIN dbo.ProductosVariantes pv ON pv.IDVariante = d.IDVariante
  WHERE o.IDPublico = @IDPublicoPedido
    AND (@IDUsuario IS NULL OR o.IDUsuario = @IDUsuario)
  ORDER BY d.IDPedidoDetalle;
END;
GO

-- Locks an order (and its payment row) for sequential payment verification:
-- the reader empty result set never lets a foreign order through, and the
-- app validates state before moving it.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ObtenerBloquearParaVerificarPago
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
    pago.IDPedidoPago,
    pago.IDPublico AS IDPublicoPago,
    pago.NombreBanco,
    pago.NumeroReferencia,
    pago.DatosProveedor,
    pago.IDUsuarioVerificador,
    pago.MotivoVerificacion,
    pago.FechaVerificacion
  FROM dbo.Pedidos o WITH (UPDLOCK, ROWLOCK)
  LEFT JOIN dbo.PedidosPagos pago WITH (UPDLOCK, ROWLOCK)
    ON pago.IDPedido = o.IDPedido
  LEFT JOIN dbo.DireccionesClientes dc ON dc.IDDireccion = o.IDDireccionOrigen
  WHERE o.IDPublico = @IDPublico;
END;
GO

-- Moves order + payment states after operator verification (approval or
-- rejection), stamping who verified, why and when.
-- 50558: order not found.
CREATE OR ALTER PROCEDURE dbo.SP_Pedidos_ActualizarVerificacionPago
  @IDPedido INT,
  @EstadoPedido NVARCHAR(40),
  @EstadoPago NVARCHAR(40),
  @IDUsuarioVerificador INT,
  @MotivoVerificacion NVARCHAR(300) = NULL,
  @FechaVerificacion DATETIME2(3) = NULL,
  @NumeroReferencia NVARCHAR(100) = NULL,
  @DatosProveedor NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Pedidos WHERE IDPedido = @IDPedido)
    THROW 50558, N'El pedido indicado no existe', 1;

  UPDATE dbo.Pedidos
  SET EstadoPedido = @EstadoPedido,
      EstadoPago = @EstadoPago,
      FechaActualizacion = SYSUTCDATETIME()
  WHERE IDPedido = @IDPedido;

  UPDATE dbo.PedidosPagos
  SET EstadoPago = @EstadoPago,
      IDUsuarioVerificador = @IDUsuarioVerificador,
      MotivoVerificacion = @MotivoVerificacion,
      FechaVerificacion = @FechaVerificacion,
      NumeroReferencia = COALESCE(@NumeroReferencia, NumeroReferencia),
      DatosProveedor = COALESCE(@DatosProveedor, DatosProveedor)
  WHERE IDPedido = @IDPedido;
END;
GO
