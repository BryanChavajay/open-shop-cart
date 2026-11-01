-- Audit module: Bitacora table plus its access procedures.
-- Each write procedure does not open transactions: SP_Bitacora_Agregar runs
-- inside the caller's transaction. Read procedures never open transactions.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  CREATE TABLE dbo.Bitacora (
    IDBitacora BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Bitacora PRIMARY KEY,
    IDUsuario INT NOT NULL CONSTRAINT FK_Bitacora_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    IDModulo SMALLINT NOT NULL,
    TipoEntidad NVARCHAR(50) NOT NULL,
    IdentificadorEntidad NVARCHAR(50) NOT NULL,
    Accion NVARCHAR(20) NOT NULL,
    ValoresAnteriores NVARCHAR(MAX) NULL,
    ValoresNuevos NVARCHAR(MAX) NULL,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_Bitacora_FechaRegistro DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_Bitacora_Modulo CHECK (IDModulo IN (10, 20, 30, 40)),
    CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN ('CREATE', 'UPDATE', 'DEACTIVATE', 'DELETE'))
  );

  CREATE INDEX IX_Bitacora_Modulo_FechaRegistro
    ON dbo.Bitacora(IDModulo, FechaRegistro DESC, IDBitacora DESC);
  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Agregar
  @IDUsuario INT, @IDModulo SMALLINT,
  @TipoEntidad NVARCHAR(50), @IdentificadorEntidad NVARCHAR(50), @Accion NVARCHAR(20),
  @ValoresAnteriores NVARCHAR(MAX), @ValoresNuevos NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  -- This procedure runs INSIDE the caller's transaction so that the business
  -- change and its audit entry commit or roll back together.
  INSERT dbo.Bitacora (IDUsuario, IDModulo, TipoEntidad, IdentificadorEntidad, Accion, ValoresAnteriores, ValoresNuevos)
  VALUES (@IDUsuario, @IDModulo, @TipoEntidad, @IdentificadorEntidad, @Accion, @ValoresAnteriores, @ValoresNuevos);
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_Listar @IDModulo SMALLINT = NULL, @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(*) AS TotalFilas FROM dbo.Bitacora WHERE (@IDModulo IS NULL OR IDModulo = @IDModulo);
  SELECT b.IDBitacora, b.IDModulo, b.TipoEntidad, b.IdentificadorEntidad, b.Accion,
         u.IDPublico AS UsuarioIDPublico, u.Nombres, u.Apellidos, b.FechaRegistro
  FROM dbo.Bitacora b JOIN dbo.Usuarios u ON u.IDUsuario = b.IDUsuario
  WHERE (@IDModulo IS NULL OR b.IDModulo = @IDModulo)
  ORDER BY b.IDBitacora DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Bitacora_ObtenerDetalle @IDBitacora BIGINT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT b.IDBitacora, b.IDModulo, b.TipoEntidad, b.IdentificadorEntidad, b.Accion,
         b.ValoresAnteriores, b.ValoresNuevos, b.FechaRegistro,
         u.IDPublico AS UsuarioIDPublico, u.Nombres, u.Apellidos
  FROM dbo.Bitacora b JOIN dbo.Usuarios u ON u.IDUsuario = b.IDUsuario
  WHERE b.IDBitacora = @IDBitacora;
END;
GO
