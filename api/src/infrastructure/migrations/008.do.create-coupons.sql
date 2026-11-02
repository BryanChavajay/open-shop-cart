-- Coupons module: discount coupons (percentage or fixed amount, cart-wide or
-- category-scoped) plus their redemption log and access procedures. Write
-- procedures do not open transactions: they run inside the caller's
-- transaction (the Node UnitOfWork). Read procedures never open transactions.
--
-- DECISIONS (documented only, not enforced here):
--   * A coupon is identified by Codigo (what the storefront applies) and by
--     IDPublico (GUID handed to the admin API). The backend normalizes the
--     code to uppercase and trims it before calling the procedures; the
--     database only guarantees uniqueness, not normalization.
--   * Logical delete (Eliminado) frees the code for future reuse via the
--     filtered unique index; a deleted coupon never participates in reads.
--   * The redemption record (CuponesUsos) is append-only: it is the audit of
--     every discount granted. One coupon use per order reference, and one use
--     per (coupon, customer, order) tuple, both enforced by unique keys.
--   * SP_Cupones_ObtenerParaRedimir takes UPDLOCK so the validation + usage
--     increment inside the caller's checkout transaction is race-free against
--     concurrent redemptions of the same coupon.
--
-- THROW error codes (distinct per condition), range 50400..50499:
--   50400  SP_Cupones_Crear / SP_Cupones_Actualizar    categoria indicada inexistente (o eliminada)
--   50401  SP_Cupones_Crear / SP_Cupones_Actualizar    codigo del cupon ya en uso
--   50402  SP_Cupones_Crear / SP_Cupones_Actualizar    categoria inactiva o eliminada para cupon de categoria
--   50405  SP_Cupones_Actualizar / EstadoActualizar / Eliminar   cupon no existe (o ya eliminado)
--   50406  SP_Cupones_Actualizar    limites nuevos invalidan los usos registrados
--   50410  SP_Cupones_RegistrarUso  limite total de usos agotado
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  -- One row per coupon. Alcance decides whether IDCategoria participates:
  -- CART coupons carry no category; CATEGORY coupons must point at one.
  CREATE TABLE dbo.Cupones (
    IDCupon INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Cupones PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Cupones_IDPublico UNIQUE,
    Codigo NVARCHAR(64) NOT NULL,
    TipoDescuento NVARCHAR(20) NOT NULL,
    ValorDescuento DECIMAL(10, 2) NOT NULL,
    Alcance NVARCHAR(20) NOT NULL,
    IDCategoria INT NULL CONSTRAINT FK_Cupones_Categorias REFERENCES dbo.Categorias(IDCategoria),
    MontoMinimoCompra DECIMAL(10, 2) NOT NULL,
    LimiteTotalUsos INT NOT NULL,
    LimiteUsosPorCliente INT NOT NULL,
    UsosActuales INT NOT NULL CONSTRAINT DF_Cupones_UsosActuales DEFAULT 0,
    FechaInicioVigencia DATETIME2(3) NOT NULL,
    FechaFinVigencia DATETIME2(3) NOT NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Cupones_Activo DEFAULT 1,
    Eliminado BIT NOT NULL CONSTRAINT DF_Cupones_Eliminado DEFAULT 0,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_Cupones_FechaRegistro DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_Cupones_FechaActualizacion DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_Cupones_TipoDescuento CHECK (TipoDescuento IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    CONSTRAINT CK_Cupones_Alcance CHECK (Alcance IN ('CART', 'CATEGORY')),
    -- A PERCENTAGE coupon cannot exceed 100; FIXED_AMOUNT only needs > 0.
    CONSTRAINT CK_Cupones_ValorDescuento CHECK (ValorDescuento > 0 AND (TipoDescuento <> 'PERCENTAGE' OR ValorDescuento <= 100)),
    CONSTRAINT CK_Cupones_MontoMinimoCompra CHECK (MontoMinimoCompra >= 0),
    CONSTRAINT CK_Cupones_LimiteTotalUsos CHECK (LimiteTotalUsos >= 1),
    CONSTRAINT CK_Cupones_LimiteUsosPorCliente CHECK (LimiteUsosPorCliente >= 1),
    CONSTRAINT CK_Cupones_UsosActuales CHECK (UsosActuales >= 0 AND UsosActuales <= LimiteTotalUsos),
    CONSTRAINT CK_Cupones_Vigencia CHECK (FechaFinVigencia > FechaInicioVigencia),
    -- Coherence of the scope: CART has no category, CATEGORY requires one.
    CONSTRAINT CK_Cupones_AlcanceCategoria CHECK (
      (Alcance = 'CART' AND IDCategoria IS NULL)
      OR (Alcance = 'CATEGORY' AND IDCategoria IS NOT NULL)
    )
  );

  -- Logical delete frees the code for reuse by a future coupon.
  CREATE UNIQUE INDEX UX_Cupones_Codigo
    ON dbo.Cupones(Codigo) WHERE Eliminado = 0;

  CREATE INDEX IX_Cupones_Activo_Eliminado
    ON dbo.Cupones(Activo, Eliminado);

  CREATE INDEX IX_Cupones_IDCategoria
    ON dbo.Cupones(IDCategoria);

  -- One row per redemption: the append-only audit of every granted discount.
  CREATE TABLE dbo.CuponesUsos (
    IDCuponUso INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CuponesUsos PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_CuponesUsos_IDPublico UNIQUE,
    IDCupon INT NOT NULL CONSTRAINT FK_CuponesUsos_Cupones REFERENCES dbo.Cupones(IDCupon),
    IDUsuario INT NOT NULL CONSTRAINT FK_CuponesUsos_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    -- Public id of the order that consumed the coupon.
    ReferenciaPedido NVARCHAR(100) NOT NULL,
    MontoDescuento DECIMAL(10, 2) NOT NULL,
    FechaUso DATETIME2(3) NOT NULL CONSTRAINT DF_CuponesUsos_FechaUso DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_CuponesUsos_Monto CHECK (MontoDescuento >= 0),
    -- One redemption per (coupon, customer, order) tuple.
    CONSTRAINT UQ_CuponesUsos_Uso UNIQUE (IDCupon, IDUsuario, ReferenciaPedido),
    -- One single coupon per order reference: an order already discounted by a
    -- coupon cannot carry a second one, whatever the customer.
    CONSTRAINT UQ_CuponesUsos_ReferenciaPedido UNIQUE (ReferenciaPedido)
  );

  CREATE INDEX IX_CuponesUsos_IDCupon_IDUsuario
    ON dbo.CuponesUsos(IDCupon, IDUsuario);

  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

-- Creates one coupon and returns the stored row, including the public id of
-- its target category (NULL for CART coupons). Runs INSIDE the caller's
-- transaction; the use case generated the public id and normalized the code.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Crear
  @IDPublico UNIQUEIDENTIFIER, @Codigo NVARCHAR(64),
  @TipoDescuento NVARCHAR(20), @ValorDescuento DECIMAL(10, 2),
  @Alcance NVARCHAR(20), @IDCategoria INT = NULL,
  @MontoMinimoCompra DECIMAL(10, 2),
  @LimiteTotalUsos INT, @LimiteUsosPorCliente INT,
  @FechaInicioVigencia DATETIME2(3), @FechaFinVigencia DATETIME2(3),
  @Activo BIT = 1
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDCategoria IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE IDCategoria = @IDCategoria AND Eliminado = 0)
    THROW 50400, 'La categoria indicada no existe', 1;

  -- Defensive pre-check: the filtered unique index UX_Cupones_Codigo remains
  -- the real guard against races within the caller's transaction.
  IF EXISTS (SELECT 1 FROM dbo.Cupones WHERE Codigo = @Codigo AND Eliminado = 0)
    THROW 50401, 'El codigo del cupon ya esta en uso', 1;

  -- A CATEGORY coupon must target a live category, not an inactive or
  -- deleted one (an inactive category silently dead-ends its coupons).
  IF @Alcance = 'CATEGORY'
     AND EXISTS (
       SELECT 1 FROM dbo.Categorias
       WHERE IDCategoria = @IDCategoria AND (Activo = 0 OR Eliminado = 1)
     )
    THROW 50402, 'La categoria no puede estar inactiva para un cupon de categoria', 1;

  INSERT dbo.Cupones (IDPublico, Codigo, TipoDescuento, ValorDescuento, Alcance, IDCategoria,
                      MontoMinimoCompra, LimiteTotalUsos, LimiteUsosPorCliente,
                      FechaInicioVigencia, FechaFinVigencia, Activo)
  VALUES (@IDPublico, @Codigo, @TipoDescuento, @ValorDescuento, @Alcance, @IDCategoria,
          @MontoMinimoCompra, @LimiteTotalUsos, @LimiteUsosPorCliente,
          @FechaInicioVigencia, @FechaFinVigencia, @Activo);

  DECLARE @IDCupon INT = SCOPE_IDENTITY();

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion
  FROM dbo.Cupones c
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.IDCupon = @IDCupon;
END;
GO

-- Updates every editable field of a coupon and returns the stored row.
-- Edits may not retroactively invalidate usage already recorded: the total
-- limit cannot drop below UsosActuales and the per-customer limit cannot
-- drop below the count of any single customer. Runs INSIDE the caller's
-- transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Actualizar
  @IDCupon INT, @Codigo NVARCHAR(64),
  @TipoDescuento NVARCHAR(20), @ValorDescuento DECIMAL(10, 2),
  @Alcance NVARCHAR(20), @IDCategoria INT = NULL,
  @MontoMinimoCompra DECIMAL(10, 2),
  @LimiteTotalUsos INT, @LimiteUsosPorCliente INT,
  @FechaInicioVigencia DATETIME2(3), @FechaFinVigencia DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Cupones WHERE IDCupon = @IDCupon AND Eliminado = 0)
    THROW 50405, 'El cupon no existe', 1;

  IF @IDCategoria IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE IDCategoria = @IDCategoria AND Eliminado = 0)
    THROW 50400, 'La categoria indicada no existe', 1;

  IF EXISTS (SELECT 1 FROM dbo.Cupones WHERE Codigo = @Codigo AND IDCupon <> @IDCupon AND Eliminado = 0)
    THROW 50401, 'El codigo del cupon ya esta en uso', 1;

  IF @Alcance = 'CATEGORY'
     AND EXISTS (
       SELECT 1 FROM dbo.Categorias
       WHERE IDCategoria = @IDCategoria AND (Activo = 0 OR Eliminado = 1)
     )
    THROW 50402, 'La categoria no puede estar inactiva para un cupon de categoria', 1;

  IF EXISTS (
    SELECT 1 FROM dbo.Cupones
    WHERE IDCupon = @IDCupon AND UsosActuales > @LimiteTotalUsos
  )
  OR EXISTS (
    SELECT 1 FROM dbo.CuponesUsos
    WHERE IDCupon = @IDCupon
    GROUP BY IDUsuario
    HAVING COUNT(*) > @LimiteUsosPorCliente
  )
    THROW 50406, 'Las modificaciones de limites no pueden invalidar los usos registrados', 1;

  UPDATE dbo.Cupones
  SET Codigo = @Codigo, TipoDescuento = @TipoDescuento, ValorDescuento = @ValorDescuento,
      Alcance = @Alcance, IDCategoria = @IDCategoria,
      MontoMinimoCompra = @MontoMinimoCompra,
      LimiteTotalUsos = @LimiteTotalUsos, LimiteUsosPorCliente = @LimiteUsosPorCliente,
      FechaInicioVigencia = @FechaInicioVigencia, FechaFinVigencia = @FechaFinVigencia,
      FechaActualizacion = SYSUTCDATETIME()
  WHERE IDCupon = @IDCupon;

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion
  FROM dbo.Cupones c
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.IDCupon = @IDCupon;
END;
GO

-- Enables or disables a coupon and returns the stored row. Runs INSIDE the
-- caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_EstadoActualizar
  @IDCupon INT, @Activo BIT
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Cupones WHERE IDCupon = @IDCupon AND Eliminado = 0)
    THROW 50405, 'El cupon no existe', 1;

  UPDATE dbo.Cupones
  SET Activo = @Activo, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDCupon = @IDCupon;

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion
  FROM dbo.Cupones c
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.IDCupon = @IDCupon;
END;
GO

-- Logically deletes a coupon: not idempotent, re-deleting (or deleting an
-- unknown id) raises. Deleting also deactivates it so a deleted coupon can
-- never be re-enabled without an explicit update. Runs INSIDE the caller's
-- transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_Eliminar
  @IDCupon INT
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Cupones WHERE IDCupon = @IDCupon AND Eliminado = 0)
    THROW 50405, 'El cupon no existe o ya fue eliminado', 1;

  UPDATE dbo.Cupones
  SET Eliminado = 1, Activo = 0, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDCupon = @IDCupon;
END;
GO

-- Read of the coupon behind a public id (admin API). Deleted coupons return
-- no rows, so the use case maps the empty result to NotFound without a
-- state-coupled error.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion
  FROM dbo.Cupones c
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.IDPublico = @IDPublico
    AND c.Eliminado = 0;
END;
GO

-- Read of the coupon behind its code (unique among live coupons by the
-- filtered index). Deleted coupons return no rows.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ObtenerPorCodigo
  @Codigo NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion
  FROM dbo.Cupones c
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.Codigo = @Codigo
    AND c.Eliminado = 0;
END;
GO

-- Redemption-time read: returns the coupon row under UPDLOCK so the caller's
-- checkout transaction serializes validations and the usage increment against
-- concurrent redemptions of the same code. UsosPorCliente reports how many
-- times @IDUsuario already consumed this coupon, so the use case can enforce
-- LimiteUsosPorCliente. A missing code returns no rows (NotFound upstream),
-- it never throws. Runs INSIDE the caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ObtenerParaRedimir
  @Codigo NVARCHAR(64), @IDUsuario INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion,
         (SELECT COUNT(*)
          FROM dbo.CuponesUsos u
          WHERE u.IDCupon = c.IDCupon AND u.IDUsuario = @IDUsuario) AS UsosPorCliente
  FROM dbo.Cupones c WITH (UPDLOCK, ROWLOCK)
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.Codigo = @Codigo
    AND c.Eliminado = 0;
END;
GO

-- Paginated admin listing. Recordset 0: total count; recordset 1: page rows,
-- ordered by FechaRegistro descending (newest first) with IDCupon as
-- tiebreak. Deleted coupons are always excluded; @SoloActivos = 1 filters on
-- Activo as well.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ListarAdmin
  @Pagina INT, @TamanoPagina INT, @SoloActivos BIT = 0
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Cupones
  WHERE Eliminado = 0
    AND (@SoloActivos = 0 OR Activo = 1);

  SELECT c.IDCupon, c.IDPublico, c.Codigo, c.TipoDescuento, c.ValorDescuento,
         c.Alcance, c.IDCategoria, cat.IDPublico AS IDPublicoCategoria,
         cat.Nombre AS NombreCategoria,
         c.MontoMinimoCompra, c.LimiteTotalUsos, c.LimiteUsosPorCliente, c.UsosActuales,
         c.FechaInicioVigencia, c.FechaFinVigencia,
         c.Activo, c.Eliminado, c.FechaRegistro, c.FechaActualizacion
  FROM dbo.Cupones c
    LEFT JOIN dbo.Categorias cat ON cat.IDCategoria = c.IDCategoria
  WHERE c.Eliminado = 0
    AND (@SoloActivos = 0 OR c.Activo = 1)
  ORDER BY c.FechaRegistro DESC, c.IDCupon DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

-- Read: how many times a customer has consumed a specific coupon. Single-row
-- answer with one column, consumed by the per-customer limit validation.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_ConteoUsosCliente
  @IDCupon INT, @IDUsuario INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS UsosPorCliente
  FROM dbo.CuponesUsos
  WHERE IDCupon = @IDCupon AND IDUsuario = @IDUsuario;
END;
GO

-- Records one redemption atomically: the increment of UsosActuales is
-- guarded by its own WHERE clause, so a coupon already at its total limit
-- matches zero rows (surfaced as code 50410 instead of a CHECK violation).
-- Duplicate redemptions (same order or same coupon/customer/order tuple) are
-- rejected by the unique constraints and map to DuplicateKeyError upstream —
-- no precheck, the caller's transaction makes both statements atomic.
-- Runs INSIDE the caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Cupones_RegistrarUso
  @IDCupon INT, @IDPublicoUso UNIQUEIDENTIFIER, @IDUsuario INT,
  @ReferenciaPedido NVARCHAR(100), @MontoDescuento DECIMAL(10, 2),
  @FechaUso DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Cupones
  SET UsosActuales = UsosActuales + 1, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDCupon = @IDCupon
    AND UsosActuales < LimiteTotalUsos;

  IF @@ROWCOUNT = 0
    THROW 50410, 'El limite total de usos del cupon fue agotado', 1;

  INSERT dbo.CuponesUsos (IDPublico, IDCupon, IDUsuario, ReferenciaPedido, MontoDescuento, FechaUso)
  VALUES (@IDPublicoUso, @IDCupon, @IDUsuario, @ReferenciaPedido, @MontoDescuento, @FechaUso);

  SELECT IDPublico, IDCupon, IDUsuario, ReferenciaPedido, MontoDescuento, FechaUso
  FROM dbo.CuponesUsos
  WHERE IDPublico = @IDPublicoUso
    AND IDCupon = @IDCupon
    AND IDUsuario = @IDUsuario
    AND ReferenciaPedido = @ReferenciaPedido;
END;
GO
