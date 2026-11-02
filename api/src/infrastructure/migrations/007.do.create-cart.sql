-- Cart module: guest/authenticated carts identified by an opaque token (only
-- its SHA-256 hash is persisted), plus their access procedures. Write
-- procedures do not open transactions: they run inside the caller's
-- transaction (the Node UnitOfWork). Read procedures never open transactions.
--
-- DECISIONS (documented only, not enforced here):
--   * Carts are keyed by IDPublico (GUID handed to the client) and by
--     HashToken (SHA-256 hex of the opaque bearer token). The raw token is
--     never stored; losing it means losing the cart.
--   * A cart is ACTIVE while it accumulates activity. It closes exactly once:
--     Estado moves from ACTIVE to EMPTIED (abandoned by decision) or
--     CONVERTED (checkout completed), stamping FechaCierre. Closed carts are
--     never reopened; activity updates ignore them so a close racing with an
--     activity write is surfaced by the affected-row count, not an error.
--   * IDUsuario is optional: guest carts own no user, authenticated carts
--     point to dbo.Usuarios.
--
-- THROW error codes (distinct per procedure):
--   50300  SP_Carritos_Crear   usuario indicado inexistente
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  -- One row per cart, guest or user-bound. Closed carts keep their closure
  -- instant so the abandoned-cart report and audits read them consistently.
  CREATE TABLE dbo.Carritos (
    IDCarrito INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Carritos PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Carritos_IDPublico UNIQUE,
    -- SHA-256 of the opaque cart token, hex-encoded; the token itself is never stored.
    HashToken CHAR(64) NOT NULL CONSTRAINT UQ_Carritos_HashToken UNIQUE,
    IDUsuario INT NULL CONSTRAINT FK_Carritos_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_Carritos_Estado DEFAULT 'ACTIVE',
    FechaCreacion DATETIME2(3) NOT NULL CONSTRAINT DF_Carritos_FechaCreacion DEFAULT SYSUTCDATETIME(),
    FechaUltimaActividad DATETIME2(3) NOT NULL CONSTRAINT DF_Carritos_FechaUltimaActividad DEFAULT SYSUTCDATETIME(),
    FechaCierre DATETIME2(3) NULL,

    CONSTRAINT CK_Carritos_Estado CHECK (Estado IN ('ACTIVE', 'EMPTIED', 'CONVERTED')),
    -- Coherence of the lifecycle timestamps.
    CONSTRAINT CK_Carritos_Fechas CHECK (FechaUltimaActividad >= FechaCreacion),
    -- ACTIVE carts are, by definition, still open; closed states always stamp
    -- exactly one closure instant.
    CONSTRAINT CK_Carritos_CierreEnActiva CHECK (
      (Estado = 'ACTIVE' AND FechaCierre IS NULL)
      OR (Estado IN ('EMPTIED', 'CONVERTED') AND FechaCierre IS NOT NULL)
    )
  );

  -- Serves the abandoned-cart sweep: filter on Estado = 'ACTIVE' plus the
  -- FechaUltimaActividad <= cutoff comparison, ordered by the same column.
  CREATE INDEX IX_Carritos_Estado_FechaUltimaActividad
    ON dbo.Carritos(Estado, FechaUltimaActividad);

  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

-- Creates one ACTIVE cart and returns the stored row. Runs INSIDE the
-- caller's transaction; the use case generated the public id and token hash.
CREATE OR ALTER PROCEDURE dbo.SP_Carritos_Crear
  @IDPublico UNIQUEIDENTIFIER, @HashToken CHAR(64), @IDUsuario INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDUsuario IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario)
    THROW 50300, 'El usuario indicado para el carrito no existe', 1;

  INSERT dbo.Carritos (IDPublico, HashToken, IDUsuario)
  VALUES (@IDPublico, @HashToken, @IDUsuario);

  DECLARE @IDCarrito INT = SCOPE_IDENTITY();

  SELECT c.IDCarrito, c.IDPublico, c.HashToken, c.IDUsuario,
         u.IDPublico AS IDPublicoUsuario,
         c.Estado, c.FechaCreacion, c.FechaUltimaActividad, c.FechaCierre
  FROM dbo.Carritos c
    LEFT JOIN dbo.Usuarios u ON u.IDUsuario = c.IDUsuario
  WHERE c.IDCarrito = @IDCarrito;
END;
GO

-- Plain read of the cart behind a token hash, but only while it is ACTIVE:
-- closed carts return no rows, so the use case treats a stale token as an
-- unknown cart without a state-coupled error.
CREATE OR ALTER PROCEDURE dbo.SP_Carritos_ObtenerActivoPorHashToken
  @HashToken CHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT c.IDCarrito, c.IDPublico, c.HashToken, c.IDUsuario,
         u.IDPublico AS IDPublicoUsuario,
         c.Estado, c.FechaCreacion, c.FechaUltimaActividad, c.FechaCierre
  FROM dbo.Carritos c
    LEFT JOIN dbo.Usuarios u ON u.IDUsuario = c.IDUsuario
  WHERE c.HashToken = @HashToken
    AND c.Estado = 'ACTIVE';
END;
GO

-- Stamps one activity instant on an ACTIVE cart. A cart closed concurrently
-- (or already closed) matches zero rows; the use case reads FilasAfectadas to
-- detect that race instead of treating it as an error, so no THROW here.
-- Runs INSIDE the caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Carritos_ActividadRegistrar
  @IDCarrito INT, @FechaHora DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Carritos
  SET FechaUltimaActividad = @FechaHora
  WHERE IDCarrito = @IDCarrito
    AND Estado = 'ACTIVE';

  SELECT @@ROWCOUNT AS FilasAfectadas;
END;
GO

-- Closes exactly once: only an ACTIVE cart can be transitioned, and only to
-- EMPTIED (abandonment) or CONVERTED (checkout). The WHERE clause enforces
-- both the source state and the target set, so wrong calls simply affect zero
-- rows (surfaced via FilasAfectadas) instead of raising constraint errors.
-- Stamps FechaCierre with the caller-provided instant. Runs INSIDE the
-- caller's transaction.
CREATE OR ALTER PROCEDURE dbo.SP_Carritos_EstadoActualizar
  @IDCarrito INT, @EstadoNuevo NVARCHAR(20), @FechaHora DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Carritos
  SET Estado = @EstadoNuevo,
      FechaCierre = @FechaHora
  WHERE IDCarrito = @IDCarrito
    AND Estado = 'ACTIVE'
    AND @EstadoNuevo IN ('EMPTIED', 'CONVERTED');

  SELECT @@ROWCOUNT AS FilasAfectadas;
END;
GO

-- Paginated listing of abandoned carts: ACTIVE ones whose last activity
-- happened at or before @FechaCorte. Pagination values are validated by the
-- application layer. Recordset 0: total count; recordset 1: page rows,
-- ordered by inactivity ascending (oldest first) with IDCarrito as tiebreak.
CREATE OR ALTER PROCEDURE dbo.SP_Carritos_AbandonadosListar
  @FechaCorte DATETIME2(3), @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*)
  FROM dbo.Carritos
  WHERE Estado = 'ACTIVE'
    AND FechaUltimaActividad <= @FechaCorte;

  SELECT c.IDPublico,
         u.IDPublico AS IDPublicoUsuario,
         c.Estado, c.FechaCreacion, c.FechaUltimaActividad, c.FechaCierre
  FROM dbo.Carritos c
    LEFT JOIN dbo.Usuarios u ON u.IDUsuario = c.IDUsuario
  WHERE c.Estado = 'ACTIVE'
    AND c.FechaUltimaActividad <= @FechaCorte
  ORDER BY c.FechaUltimaActividad ASC, c.IDCarrito ASC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO
