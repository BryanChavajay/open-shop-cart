-- Inventory module: kardex movements, stock reservations (with details and
-- history), idempotency operations, plus their access procedures. Write
-- procedures do not open transactions: they run inside the caller's
-- transaction. Read procedures never open transactions.
--
-- DECISIONS (documented only, not enforced here):
--   * Every variant's stock starts at zero: new variants are created by the
--     catalog module with ExistenciaFisica = 0 (default) and inventory
--     movements (receipts, sales, adjustments) are the only way to change it.
--   * Variants that already hold a nonzero ExistenciaFisica are left intact:
--     this migration neither destroys nor resets any existing data. Only a
--     (corrupt) negative balance would fail the new CHECK constraint, since
--     a valid kardex can never produce a negative physical stock.
--
-- THROW error codes (distinct per procedure):
--   50100  SP_Inventario_VarianteActualizarExistencia   variante no encontrada
--   50101  SP_Inventario_SaldosBloquearDeVariantes      lista de variantes vacía
--   50102  SP_Inventario_SaldosBloquearDeVariantes      variante no encontrada en el lote
--   50103  SP_Inventario_VariantesConSaldoOReservas     lista de variantes vacía
--   50104  SP_Inventario_ReservasCrear                  variante desconocida o duplicada
--   50105  SP_Inventario_ReservasCrear                  vencimiento anterior a la creación
--   50106  SP_Inventario_ReservasCrear                  reserva sin líneas
--   50107  SP_Inventario_ReservasCrear                  línea con cantidad no positiva
--   50108  SP_Inventario_ReservasCrear                  línea incompleta en el JSON
--   50200  SP_Inventario_ReservasCrear                  referencia de origen duplicada (conflicto)
--   50109  SP_Inventario_HistoriaReservaAgregar         reserva no encontrada
--   50110  SP_Inventario_HistoriaReservaAgregar         falta el identificador de la reserva
--   50111  SP_Inventario_ReservasEstadoActualizar       reserva no encontrada
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  -- Append-only kardex ledger: one row per signed stock change of a variant.
  CREATE TABLE dbo.InventarioMovimientos (
    IDMovimiento BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_InventarioMovimientos PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_InventarioMovimientos_IDPublico UNIQUE,
    IDVariante INT NOT NULL CONSTRAINT FK_InventarioMovimientos_ProductosVariantes REFERENCES dbo.ProductosVariantes(IDVariante),
    TipoMovimiento NVARCHAR(30) NOT NULL,
    CantidadDiferencial INT NOT NULL,
    SaldoAnterior INT NOT NULL,
    SaldoPosterior INT NOT NULL,
    IDUsuario INT NOT NULL CONSTRAINT FK_InventarioMovimientos_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    Motivo NVARCHAR(200) NOT NULL,
    ReferenciaOrigen NVARCHAR(100) NULL,
    IDPublicoVentaRelacionada UNIQUEIDENTIFIER NULL,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_InventarioMovimientos_FechaRegistro DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_InventarioMvt_Tipo CHECK (TipoMovimiento IN ('PURCHASE_RECEIPT', 'SALE', 'MANUAL_ADJUSTMENT', 'CUSTOMER_RETURN', 'SALE_CANCELLATION')),
    CONSTRAINT CK_InventarioMovimientos_Diferencial CHECK (CantidadDiferencial <> 0),
    CONSTRAINT CK_InventarioMovimientos_SaldoAnterior CHECK (SaldoAnterior >= 0),
    CONSTRAINT CK_InventarioMovimientos_SaldoPosterior CHECK (SaldoPosterior >= 0),
    -- A related sale public id only makes sense for reintegrations and sales.
    CONSTRAINT CK_InventarioMovimientos_VentaRelacionada CHECK (IDPublicoVentaRelacionada IS NULL OR TipoMovimiento IN ('SALE', 'SALE_CANCELLATION', 'CUSTOMER_RETURN')),
    -- Per-type sign rules mirror the domain: receipts and reintegrations add
    -- units, sales remove them, manual adjustments carry any nonzero sign.
    CONSTRAINT CK_InventarioMovimientos_TipoDiferencial CHECK (
      (TipoMovimiento = 'PURCHASE_RECEIPT' AND CantidadDiferencial > 0)
      OR (TipoMovimiento = 'SALE' AND CantidadDiferencial < 0)
      OR (TipoMovimiento = 'MANUAL_ADJUSTMENT')
      OR (TipoMovimiento IN ('CUSTOMER_RETURN', 'SALE_CANCELLATION') AND CantidadDiferencial > 0)
    )
  );

  CREATE INDEX IX_InventarioMovimientos_IDVariante
    ON dbo.InventarioMovimientos(IDVariante, FechaRegistro DESC, IDMovimiento DESC);
  CREATE INDEX IX_InventarioMovimientos_VentaRelacionada
    ON dbo.InventarioMovimientos(IDPublicoVentaRelacionada)
    WHERE IDPublicoVentaRelacionada IS NOT NULL;
  CREATE INDEX IX_InventarioMovimientos_IDUsuario
    ON dbo.InventarioMovimientos(IDUsuario);

  -- Reservation header: holds availability without touching physical stock.
  CREATE TABLE dbo.InventarioReservas (
    IDReserva INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_InventarioReservas PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_InventarioReservas_IDPublico UNIQUE,
    ReferenciaOrigen NVARCHAR(100) NOT NULL,
    IDUsuario INT NOT NULL CONSTRAINT FK_InventarioReservas_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_InventarioReservas_Estado DEFAULT 'ACTIVE',
    FechaCreacion DATETIME2(3) NOT NULL CONSTRAINT DF_InventarioReservas_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaVencimiento DATETIME2(3) NOT NULL,
    FechaCierre DATETIME2(3) NULL,

    CONSTRAINT CK_InventarioReservas_Estado CHECK (Estado IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
    CONSTRAINT CK_InventarioReservas_Fechas CHECK (FechaVencimiento > FechaCreacion)
  );

  CREATE UNIQUE INDEX UX_InventarioReservas_ReferenciaOrigen
    ON dbo.InventarioReservas(ReferenciaOrigen);
  CREATE INDEX IX_InventarioReservas_Estado_FechaVencimiento
    ON dbo.InventarioReservas(Estado, FechaVencimiento);

  -- One line per reserved variant per reservation.
  CREATE TABLE dbo.InventarioReservasDetalle (
    IDDReservaDetalle INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_InventarioReservasDetalle PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_InventarioReservasDetalle_IDPublico UNIQUE,
    IDReserva INT NOT NULL CONSTRAINT FK_InventarioReservasDetalle_InventarioReservas REFERENCES dbo.InventarioReservas(IDReserva) ON DELETE CASCADE,
    IDVariante INT NOT NULL CONSTRAINT FK_InventarioReservasDetalle_ProductosVariantes REFERENCES dbo.ProductosVariantes(IDVariante),
    Cantidad INT NOT NULL,

    CONSTRAINT UQ_InventarioReservasDetalle UNIQUE (IDReserva, IDVariante),
    CONSTRAINT CK_InventarioReservasDetalle_Cantidad CHECK (Cantidad > 0)
  );

  CREATE INDEX IX_InventarioReservasDetalle_IDVariante
    ON dbo.InventarioReservasDetalle(IDVariante);

  -- Append-only reservation history ledger. Lifespan audit: who created,
  -- released or consumed the reservation, plus automatic expiries.
  CREATE TABLE dbo.InventarioReservasHistorial (
    IDHistoriaReserva BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_InventarioReservasHistorial PRIMARY KEY,
    IDReserva INT NOT NULL CONSTRAINT FK_InventarioReservasHistorial_InventarioReservas REFERENCES dbo.InventarioReservas(IDReserva),
    IDUsuario INT NULL CONSTRAINT FK_InventarioReservasHistorial_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    Accion NVARCHAR(20) NOT NULL,
    Motivo NVARCHAR(200) NULL,
    FechaHora DATETIME2(3) NOT NULL CONSTRAINT DF_InventarioReservasHistorial_FechaHora DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_InventarioReservasHistorial_Accion CHECK (Accion IN ('CREATED', 'RELEASED', 'CONSUMED', 'EXPIRED')),
    -- Human actions name the acting user; automatic expiries name nobody.
    CONSTRAINT CK_InventarioReservasHistorial_Usuario CHECK (
      NOT (Accion = 'EXPIRED' AND IDUsuario IS NOT NULL)
      AND NOT (Accion IN ('CREATED', 'RELEASED', 'CONSUMED') AND IDUsuario IS NULL)
    ),
    -- Human actions document a reason; automatic expiries carry none.
    CONSTRAINT CK_InventarioReservasHistorial_Motivo CHECK (
      NOT (Accion = 'EXPIRED' AND Motivo IS NOT NULL)
      AND NOT (Accion IN ('CREATED', 'RELEASED', 'CONSUMED') AND Motivo IS NULL)
    )
  );

  CREATE INDEX IX_InventarioReservasHistorial_IDReserva
    ON dbo.InventarioReservasHistorial(IDReserva);

  -- Idempotency receipts: one row per executed write operation, keyed by
  -- operation type + client idempotency key (global, not per user).
  CREATE TABLE dbo.InventarioOperaciones (
    IDOperacion BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_InventarioOperaciones PRIMARY KEY,
    TipoOperacion NVARCHAR(40) NOT NULL,
    ClaveIdempotencia NVARCHAR(100) NOT NULL,
    HuellaSolicitud NVARCHAR(512) NOT NULL,
    IDPublicoResultado UNIQUEIDENTIFIER NULL,
    -- Public identifier of the affected variant, when the operation targets one.
    IDPublicoVariante UNIQUEIDENTIFIER NULL,
    IDUsuario INT NOT NULL CONSTRAINT FK_InventarioOperaciones_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_InventarioOperaciones_FechaRegistro DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_InventarioOperaciones UNIQUE (TipoOperacion, ClaveIdempotencia)
  );

  CREATE INDEX IX_InventarioOperaciones_IDUsuario
    ON dbo.InventarioOperaciones(IDUsuario);

  -- Physical stock can never go negative under a valid kardex.
  ALTER TABLE dbo.ProductosVariantes
    ADD CONSTRAINT CK_ProductosVariantes_ExistenciaFisicaNoNegativa CHECK (ExistenciaFisica >= 0);

  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

-- Applies a signed change to the physical stock of one variant. Runs INSIDE
-- the caller's transaction; the use case validated the delta beforehand.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_VarianteActualizarExistencia
  @IDVariante INT, @CantidadDiferencial INT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.ProductosVariantes
  SET ExistenciaFisica = ExistenciaFisica + @CantidadDiferencial,
      FechaActualizacion = SYSUTCDATETIME()
  WHERE IDVariante = @IDVariante;

  IF @@ROWCOUNT = 0
    THROW 50100, 'Variante no encontrada', 1;

  SELECT IDVariante, IDPublico, ExistenciaFisica, FechaActualizacion
  FROM dbo.ProductosVariantes
  WHERE IDVariante = @IDVariante;
END;
GO

-- Appends one kardex entry. Runs INSIDE the caller's transaction so the
-- physical stock change and its kardex row commit together.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientoAgregar
  @IDPublico UNIQUEIDENTIFIER, @IDVariante INT, @TipoMovimiento NVARCHAR(30),
  @CantidadDiferencial INT, @SaldoAnterior INT, @SaldoPosterior INT,
  @IDUsuario INT, @Motivo NVARCHAR(200),
  @ReferenciaOrigen NVARCHAR(100) = NULL, @IDPublicoVentaRelacionada UNIQUEIDENTIFIER = NULL
AS
BEGIN
  SET NOCOUNT ON;

  INSERT dbo.InventarioMovimientos (IDPublico, IDVariante, TipoMovimiento, CantidadDiferencial, SaldoAnterior, SaldoPosterior, IDUsuario, Motivo, ReferenciaOrigen, IDPublicoVentaRelacionada)
  VALUES (@IDPublico, @IDVariante, @TipoMovimiento, @CantidadDiferencial, @SaldoAnterior, @SaldoPosterior, @IDUsuario, @Motivo, @ReferenciaOrigen, @IDPublicoVentaRelacionada);

  SELECT SCOPE_IDENTITY() AS IDMovimiento;
END;
GO

-- Plain read of one kardex movement by its public identifier.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientoObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT m.IDMovimiento, m.IDPublico AS IDPublicoMovimiento,
         v.IDPublico AS IDPublicoVariante, m.IDVariante,
         m.TipoMovimiento, m.CantidadDiferencial, m.SaldoAnterior, m.SaldoPosterior,
         m.IDUsuario, m.Motivo, m.ReferenciaOrigen, m.IDPublicoVentaRelacionada,
         m.FechaRegistro
  FROM dbo.InventarioMovimientos m
    JOIN dbo.ProductosVariantes v ON v.IDVariante = m.IDVariante
  WHERE m.IDPublico = @IDPublico;
END;
GO

-- Units already reintegrated against one sale by CUSTOMER_RETURN and
-- SALE_CANCELLATION movements that reference it. Locked read used inside the
-- reintegration transaction to cap cumulative compensations.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientosSumarReintegrados
  @IDPublicoVentaRelacionada UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COALESCE(SUM(m.CantidadDiferencial), 0) AS CantidadReintegrada
  FROM dbo.InventarioMovimientos m WITH (UPDLOCK, HOLDLOCK)
  WHERE m.IDPublicoVentaRelacionada = @IDPublicoVentaRelacionada
    AND m.TipoMovimiento IN ('CUSTOMER_RETURN', 'SALE_CANCELLATION');
END;
GO

-- Plain read of one variant's full balance. Reserved units are computed for
-- @FechaAsOf inside SQL, so expiry never depends on the cleanup worker.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_SaldoObtenerPorVariante
  @IDPublicoVariante UNIQUEIDENTIFIER, @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT v.IDVariante, v.IDPublico AS IDPublicoVariante, v.SKU,
         p.Nombre AS NombreProducto, v.IDProducto,
         v.Activo, v.Eliminado,
         v.ExistenciaFisica,
         ISNULL(R.CantidadReservada, 0) AS ExistenciaReservada,
         v.ExistenciaFisica - ISNULL(R.CantidadReservada, 0) AS ExistenciaDisponible,
         v.FechaActualizacion
  FROM dbo.ProductosVariantes v
    JOIN dbo.Productos p ON p.IDProducto = v.IDProducto
    OUTER APPLY (
      SELECT SUM(rd.Cantidad) AS CantidadReservada
      FROM dbo.InventarioReservasDetalle rd
        JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
      WHERE rd.IDVariante = v.IDVariante
        AND r.Estado = 'ACTIVE'
        AND r.FechaVencimiento > @FechaAsOf
    ) AS R
  WHERE v.IDPublico = @IDPublicoVariante;
END;
GO

-- Locked (UPDLOCK/HOLDLOCK) balance read of the given variants, used before
-- mutations to serialize concurrent stock changes. The list is a
-- comma-separated NVARCHAR (no table types in this codebase); rows are
-- returned and locked in ascending IDPublico order so every caller takes the
-- locks in one shared order. Reservations still open at @FechaAsOf count into
-- ExistenciaReservada.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_SaldosBloquearDeVariantes
  @IDPublicosVariante NVARCHAR(4000), @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDs TABLE (IDPublico UNIQUEIDENTIFIER PRIMARY KEY);

  INSERT INTO @IDs (IDPublico)
    SELECT DISTINCT CAST(value AS UNIQUEIDENTIFIER)
    FROM STRING_SPLIT(@IDPublicosVariante, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

  IF (SELECT COUNT(*) FROM @IDs) = 0
    THROW 50101, 'La lista de variantes está vacía', 1;

  IF (SELECT COUNT(*) FROM @IDs) <>
     (SELECT COUNT(*) FROM dbo.ProductosVariantes v WITH (UPDLOCK, HOLDLOCK)
       WHERE v.IDPublico IN (SELECT IDPublico FROM @IDs))
    THROW 50102, 'Una variante del lote no existe', 1;

  SELECT v.IDVariante, v.IDPublico AS IDPublicoVariante, v.SKU,
         p.Nombre AS NombreProducto, v.IDProducto,
         v.Activo, v.Eliminado,
         v.ExistenciaFisica,
         ISNULL(R.CantidadReservada, 0) AS ExistenciaReservada,
         v.ExistenciaFisica - ISNULL(R.CantidadReservada, 0) AS ExistenciaDisponible,
         v.FechaActualizacion
  FROM dbo.ProductosVariantes v WITH (UPDLOCK, HOLDLOCK)
    JOIN dbo.Productos p ON p.IDProducto = v.IDProducto
    OUTER APPLY (
      SELECT SUM(rd.Cantidad) AS CantidadReservada
      FROM dbo.InventarioReservasDetalle rd
        JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
      WHERE rd.IDVariante = v.IDVariante
        AND r.Estado = 'ACTIVE'
        AND r.FechaVencimiento > @FechaAsOf
    ) AS R
  WHERE v.IDPublico IN (SELECT IDPublico FROM @IDs)
  ORDER BY v.IDPublico ASC;
END;
GO

-- Units held per variant by ACTIVE, unexpired reservations at @FechaAsOf.
-- Only variants with at least one such line return a row; the repository maps
-- missing ids to zero. Same locking as the locked balances so callers share
-- the lock graph when combining calls.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasSumarActivasDeVariantes
  @IDPublicosVariante NVARCHAR(4000), @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDs TABLE (IDPublico UNIQUEIDENTIFIER PRIMARY KEY);

  INSERT INTO @IDs (IDPublico)
    SELECT DISTINCT CAST(value AS UNIQUEIDENTIFIER)
    FROM STRING_SPLIT(@IDPublicosVariante, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

  SELECT rd.IDVariante, v.IDPublico AS IDPublicoVariante, SUM(rd.Cantidad) AS CantidadReservada
  FROM dbo.InventarioReservasDetalle rd
    JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
    JOIN dbo.ProductosVariantes v WITH (UPDLOCK, HOLDLOCK) ON v.IDVariante = rd.IDVariante
  WHERE rd.IDVariante IN (SELECT IDVariante FROM @IDs)
    AND r.Estado = 'ACTIVE'
    AND r.FechaVencimiento > @FechaAsOf
  GROUP BY rd.IDVariante, v.IDPublico;
END;
GO

-- True when any of the given variants (by internal id) still holds physical
-- stock or ACTIVE, unexpired reservations at @FechaAsOf. Used to block
-- logical deletion of catalog entities.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_VariantesConSaldoOReservas
  @IDVariantesInternos NVARCHAR(4000), @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @Ids TABLE (IDVariante INT PRIMARY KEY);

  INSERT INTO @Ids (IDVariante)
    SELECT DISTINCT CAST(value AS INT)
    FROM STRING_SPLIT(@IDVariantesInternos, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

  IF (SELECT COUNT(*) FROM @Ids) = 0
    THROW 50103, 'La lista de variantes está vacía', 1;

  SELECT CAST(CASE WHEN EXISTS (
    SELECT 1
    FROM dbo.ProductosVariantes v
      JOIN @Ids i ON i.IDVariante = v.IDVariante
    WHERE v.ExistenciaFisica <> 0
  ) OR EXISTS (
    SELECT 1
    FROM dbo.InventarioReservasDetalle rd
      JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
      JOIN @Ids i ON i.IDVariante = rd.IDVariante
    WHERE r.Estado = 'ACTIVE'
      AND r.FechaVencimiento > @FechaAsOf
  ) THEN 1 ELSE 0 END AS BIT) AS TieneSaldoOReservas;
END;
GO

-- Creates a reservation atomically: header, lines and the CREATED history
-- entry. Runs INSIDE the caller's transaction (never opens its own).
-- @Detalles is a JSON array: [{"IDPublico":"...","IDPublicoVariante":"...","Cantidad":3}].
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasCrear
  @IDPublico UNIQUEIDENTIFIER, @ReferenciaOrigen NVARCHAR(100), @IDUsuario INT,
  @FechaCreacion DATETIME2(3), @FechaVencimiento DATETIME2(3),
  @Detalles NVARCHAR(MAX), @MotivoCreacion NVARCHAR(200) = 'Reserva creada'
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM dbo.InventarioReservas WHERE ReferenciaOrigen = @ReferenciaOrigen)
    THROW 50200, 'Ya existe una reserva con la referencia de origen indicada', 1;

  IF @FechaVencimiento <= @FechaCreacion
    THROW 50105, 'La fecha de vencimiento debe ser posterior a la de creación', 1;

  -- Raw staging keeps a NULL line present so the explicit completeness check
  -- (50108) can fire before any constraint error happens.
  DECLARE @LineasBrutas TABLE (
    IDPublico UNIQUEIDENTIFIER NULL,
    IDPublicoVariante UNIQUEIDENTIFIER NULL,
    Cantidad INT NULL
  );

  INSERT INTO @LineasBrutas (IDPublico, IDPublicoVariante, Cantidad)
    SELECT L.IDPublico, L.IDPublicoVariante, L.Cantidad
    FROM OPENJSON(@Detalles) WITH (
      IDPublico UNIQUEIDENTIFIER '$.IDPublico',
      IDPublicoVariante UNIQUEIDENTIFIER '$.IDPublicoVariante',
      Cantidad INT '$.Cantidad'
    ) AS L;

  IF (SELECT COUNT(*) FROM @LineasBrutas) = 0
    THROW 50106, 'La reserva requiere al menos una línea', 1;

  IF EXISTS (SELECT 1 FROM @LineasBrutas WHERE IDPublico IS NULL OR IDPublicoVariante IS NULL OR Cantidad IS NULL)
    THROW 50108, 'Una línea de la reserva llegó incompleta', 1;

  IF EXISTS (SELECT 1 FROM @LineasBrutas WHERE Cantidad <= 0)
    THROW 50107, 'Cada línea de la reserva debe reservar al menos una unidad', 1;

  DECLARE @Lineas TABLE (
    IDPublico UNIQUEIDENTIFIER PRIMARY KEY,
    IDPublicoVariante UNIQUEIDENTIFIER NOT NULL,
    Cantidad INT NOT NULL
  );

  INSERT INTO @Lineas (IDPublico, IDPublicoVariante, Cantidad)
    SELECT IDPublico, IDPublicoVariante, Cantidad FROM @LineasBrutas;

  DECLARE @Resueltas TABLE (
    IDPublico UNIQUEIDENTIFIER PRIMARY KEY,
    IDVariante INT NOT NULL UNIQUE
  );

  INSERT INTO @Resueltas (IDPublico, IDVariante)
    SELECT l.IDPublico, v.IDVariante
    FROM @Lineas l
      JOIN dbo.ProductosVariantes v ON v.IDPublico = l.IDPublicoVariante;

  -- Unknown and duplicated variants both lead here, mirrored by the domain
  -- rule of one line per variant per reservation.
  IF (SELECT COUNT(*) FROM @Resueltas) <> (SELECT COUNT(*) FROM @Lineas)
    THROW 50104, 'Una variante de la reserva no existe o está duplicada', 1;

  INSERT dbo.InventarioReservas (IDPublico, ReferenciaOrigen, IDUsuario, FechaCreacion, FechaVencimiento)
  VALUES (@IDPublico, @ReferenciaOrigen, @IDUsuario, @FechaCreacion, @FechaVencimiento);

  DECLARE @IDReserva INT = SCOPE_IDENTITY();

  INSERT dbo.InventarioReservasDetalle (IDPublico, IDReserva, IDVariante, Cantidad)
    SELECT l.IDPublico, @IDReserva, res.IDVariante, l.Cantidad
    FROM @Lineas l
      JOIN @Resueltas res ON res.IDPublico = l.IDPublico;

  EXEC dbo.SP_Inventario_HistoriaReservaAgregar
    @IDReserva = @IDReserva, @IDPublicoReserva = NULL,
    @Accion = 'CREATED', @IDUsuario = @IDUsuario, @Motivo = @MotivoCreacion;

  SELECT IDReserva = @IDReserva;
END;
GO

-- Reservation history ledger appender. Accepts the reservation by internal
-- id (used by the creation procedure) or by public id (used by the use cases).
-- Runs INSIDE the caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_HistoriaReservaAgregar
  @IDReserva INT = NULL, @IDPublicoReserva UNIQUEIDENTIFIER = NULL,
  @Accion NVARCHAR(20), @IDUsuario INT = NULL, @Motivo NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDReserva IS NULL AND @IDPublicoReserva IS NULL
    THROW 50110, 'Debe indicar la reserva por id interno o id público', 1;

  IF @IDReserva IS NULL
    SELECT @IDReserva = IDReserva
    FROM dbo.InventarioReservas
    WHERE IDPublico = @IDPublicoReserva;

  IF @IDReserva IS NULL
    THROW 50109, 'La reserva de la historia no existe', 1;

  INSERT dbo.InventarioReservasHistorial (IDReserva, IDUsuario, Accion, Motivo)
  VALUES (@IDReserva, @IDUsuario, @Accion, @Motivo);
END;
GO

-- Transitions the reservation status. When passed, sets the stored closure
-- instant; ACTIVE-to-closed transitions without an instant are stamped with
-- the current time. Runs INSIDE the caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasEstadoActualizar
  @IDReserva INT, @Estado NVARCHAR(20), @FechaCierre DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.InventarioReservas
  SET Estado = @Estado,
      FechaCierre = COALESCE(@FechaCierre, CASE WHEN @Estado <> 'ACTIVE' THEN SYSUTCDATETIME() END)
  WHERE IDReserva = @IDReserva;

  IF @@ROWCOUNT = 0
    THROW 50111, 'La reserva a actualizar no existe', 1;
END;
GO

-- Plain read of one reservation (any state) by public id: recordset 0 holds
-- the header, recordset 1 holds its lines.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDReserva INT = (SELECT IDReserva FROM dbo.InventarioReservas WHERE IDPublico = @IDPublico);

  SELECT r.IDReserva, r.IDPublico AS IDPublicoReserva, r.ReferenciaOrigen, r.IDUsuario,
         r.Estado, r.FechaCreacion, r.FechaVencimiento, r.FechaCierre
  FROM dbo.InventarioReservas r
  WHERE r.IDReserva = @IDReserva;

  SELECT d.IDDReservaDetalle, d.IDPublico AS IDPublicoDetalle,
         d.IDVariante, v.IDPublico AS IDPublicoVariante, d.Cantidad
  FROM dbo.InventarioReservasDetalle d
    JOIN dbo.ProductosVariantes v ON v.IDVariante = d.IDVariante
  WHERE d.IDReserva = @IDReserva
  ORDER BY d.IDDReservaDetalle ASC;
END;
GO

-- Locked read of one reservation only when it is ACTIVE and still unexpired
-- at @FechaAsOf. UPDLOCK serializes the mutation on the header row and
-- HOLDLOCK keeps it locked until commit; consumption flows use it to reject
-- expired reservations inside the transaction. Same two-recordset shape.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasObtenerBloquearActiva
  @IDPublico UNIQUEIDENTIFIER, @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDReserva INT = (
    SELECT r.IDReserva
    FROM dbo.InventarioReservas r WITH (UPDLOCK, HOLDLOCK)
    WHERE r.IDPublico = @IDPublico
      AND r.Estado = 'ACTIVE'
      AND r.FechaVencimiento > @FechaAsOf
  );

  SELECT r.IDReserva, r.IDPublico AS IDPublicoReserva, r.ReferenciaOrigen, r.IDUsuario,
         r.Estado, r.FechaCreacion, r.FechaVencimiento, r.FechaCierre
  FROM dbo.InventarioReservas r
  WHERE r.IDReserva = @IDReserva;

  SELECT d.IDDReservaDetalle, d.IDPublico AS IDPublicoDetalle,
         d.IDVariante, v.IDPublico AS IDPublicoVariante, d.Cantidad
  FROM dbo.InventarioReservasDetalle d
    JOIN dbo.ProductosVariantes v ON v.IDVariante = d.IDVariante
  WHERE d.IDReserva = @IDReserva
  ORDER BY d.IDDReservaDetalle ASC;
END;
GO

-- Locked (UPDLOCK) read of one reservation regardless of state, used by
-- release and expiry flows that must inspect the current state first.
-- Same two-recordset shape.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasObtenerBloquearEstado
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDReserva INT = (
    SELECT r.IDReserva
    FROM dbo.InventarioReservas r WITH (UPDLOCK, HOLDLOCK)
    WHERE r.IDPublico = @IDPublico
  );

  SELECT r.IDReserva, r.IDPublico AS IDPublicoReserva, r.ReferenciaOrigen, r.IDUsuario,
         r.Estado, r.FechaCreacion, r.FechaVencimiento, r.FechaCierre
  FROM dbo.InventarioReservas r
  WHERE r.IDReserva = @IDReserva;

  SELECT d.IDDReservaDetalle, d.IDPublico AS IDPublicoDetalle,
         d.IDVariante, v.IDPublico AS IDPublicoVariante, d.Cantidad
  FROM dbo.InventarioReservasDetalle d
    JOIN dbo.ProductosVariantes v ON v.IDVariante = d.IDVariante
  WHERE d.IDReserva = @IDReserva
  ORDER BY d.IDDReservaDetalle ASC;
END;
GO

-- Reservation (any state) holding a given source reference, read as the
-- duplicate pre-check and idempotent replay of the reservation use case.
-- @FechaAsOf is accepted for interface parity with the other reservation
-- reads; the reference is unique, so no branch by state happens here.
-- Same two-recordset shape.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasObtenerPorReferencia
  @ReferenciaOrigen NVARCHAR(100), @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDReserva INT = (SELECT IDReserva FROM dbo.InventarioReservas WHERE ReferenciaOrigen = @ReferenciaOrigen);

  SELECT r.IDReserva, r.IDPublico AS IDPublicoReserva, r.ReferenciaOrigen, r.IDUsuario,
         r.Estado, r.FechaCreacion, r.FechaVencimiento, r.FechaCierre
  FROM dbo.InventarioReservas r
  WHERE r.IDReserva = @IDReserva;

  SELECT d.IDDReservaDetalle, d.IDPublico AS IDPublicoDetalle,
         d.IDVariante, v.IDPublico AS IDPublicoVariante, d.Cantidad
  FROM dbo.InventarioReservasDetalle d
    JOIN dbo.ProductosVariantes v ON v.IDVariante = d.IDVariante
  WHERE d.IDReserva = @IDReserva
  ORDER BY d.IDDReservaDetalle ASC;
END;
GO

-- Up to @Limite ACTIVE reservations already expired at @FechaAsOf, in
-- IDReserva order. UPDLOCK claims the rows for the worker's transaction and
-- READPAST makes concurrent workers skip already-claimed ones (no lock waits).
-- Recordset 0: headers; recordset 1: lines of those reservations.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_ReservasListarVencidas
  @Limite INT, @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @Vencidas TABLE (IDReserva INT PRIMARY KEY);

  INSERT INTO @Vencidas (IDReserva)
    SELECT TOP (@Limite) r.IDReserva
    FROM dbo.InventarioReservas r WITH (UPDLOCK, READPAST)
    WHERE r.Estado = 'ACTIVE'
      AND r.FechaVencimiento <= @FechaAsOf
    ORDER BY r.IDReserva ASC;

  SELECT r.IDReserva, r.IDPublico AS IDPublicoReserva, r.ReferenciaOrigen, r.IDUsuario,
         r.Estado, r.FechaCreacion, r.FechaVencimiento, r.FechaCierre
  FROM dbo.InventarioReservas r
    JOIN @Vencidas v ON v.IDReserva = r.IDReserva
  ORDER BY r.IDReserva ASC;

  SELECT d.IDDReservaDetalle, d.IDPublico AS IDPublicoDetalle, d.IDReserva,
         d.IDVariante, v.IDPublico AS IDPublicoVariante, d.Cantidad
  FROM dbo.InventarioReservasDetalle d
    JOIN dbo.ProductosVariantes v ON v.IDVariante = d.IDVariante
    JOIN @Vencidas c ON c.IDReserva = d.IDReserva
  ORDER BY d.IDReserva ASC, d.IDDReservaDetalle ASC;
END;
GO

-- Paginated inventory balance listing. @SoloActivas NULL/0 lists every
-- variant including inactive and deleted ones; @Busqueda matches SKU or
-- product name. Reserved units are computed at the evaluation instant
-- (SYSUTCDATETIME of the call). Orders by product name then variant order.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_SaldosListar
  @SoloDisponible BIT = 0, @SoloActivas BIT = NULL, @Busqueda NVARCHAR(100) = NULL,
  @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*)
  FROM dbo.ProductosVariantes v
    JOIN dbo.Productos p ON p.IDProducto = v.IDProducto
    OUTER APPLY (
      SELECT SUM(rd.Cantidad) AS CantidadReservada
      FROM dbo.InventarioReservasDetalle rd
        JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
      WHERE rd.IDVariante = v.IDVariante
        AND r.Estado = 'ACTIVE'
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
      WHERE rd.IDVariante = v.IDVariante
        AND r.Estado = 'ACTIVE'
        AND r.FechaVencimiento > SYSUTCDATETIME()
    ) AS R
  WHERE (@SoloActivas IS NULL OR (@SoloActivas = 1 AND v.Activo = 1 AND v.Eliminado = 0))
    AND (@SoloDisponible = 0 OR v.ExistenciaFisica - ISNULL(R.CantidadReservada, 0) > 0)
    AND (@Busqueda IS NULL OR v.SKU LIKE '%' + @Busqueda + '%' OR p.Nombre LIKE '%' + @Busqueda + '%')
  ORDER BY p.Nombre ASC, v.Orden ASC, v.IDVariante ASC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

-- Paginated kardex of one variant. @TipoMovimiento, @FechaDesde and
-- @FechaHasta are optional filters. Orders newest first. Recordset 0: total
-- count; recordset 1: page rows with the acting user denormalized.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_MovimientosListarDeVariante
  @IDPublicoVariante UNIQUEIDENTIFIER, @TipoMovimiento NVARCHAR(30) = NULL,
  @FechaDesde DATETIME2(3) = NULL, @FechaHasta DATETIME2(3) = NULL,
  @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*)
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

-- Records the idempotency receipt of one write operation. Runs INSIDE the
-- same transaction as the operation itself; replays collide with the unique
-- (TipoOperacion, ClaveIdempotencia) key and surface as a unique violation.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_OperacionesGuardar
  @TipoOperacion NVARCHAR(40), @ClaveIdempotencia NVARCHAR(100),
  @HuellaSolicitud NVARCHAR(512), @IDPublicoResultado UNIQUEIDENTIFIER = NULL,
  @IDPublicoVariante UNIQUEIDENTIFIER = NULL, @IDUsuario INT
AS
BEGIN
  SET NOCOUNT ON;

  INSERT dbo.InventarioOperaciones (TipoOperacion, ClaveIdempotencia, HuellaSolicitud, IDPublicoResultado, IDPublicoVariante, IDUsuario)
  VALUES (@TipoOperacion, @ClaveIdempotencia, @HuellaSolicitud, @IDPublicoResultado, @IDPublicoVariante, @IDUsuario);
END;
GO

-- Stored idempotency receipt for one operation type and key, or no rows.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_OperacionesObtener
  @TipoOperacion NVARCHAR(40), @ClaveIdempotencia NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TipoOperacion, ClaveIdempotencia, HuellaSolicitud,
         IDPublicoResultado, IDPublicoVariante, IDUsuario, FechaRegistro
  FROM dbo.InventarioOperaciones
  WHERE TipoOperacion = @TipoOperacion
    AND ClaveIdempotencia = @ClaveIdempotencia;
END;
GO
