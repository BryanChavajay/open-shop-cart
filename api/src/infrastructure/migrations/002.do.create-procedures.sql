-- Each write commits independently. Procedures only read/write their own data.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Guardar
  @IDPublico UNIQUEIDENTIFIER, @Nombres NVARCHAR(100), @Apellidos NVARCHAR(100),
  @Correo NVARCHAR(254), @ContrasenaHash NVARCHAR(255), @Rol NVARCHAR(20),
  @Activo BIT, @Eliminado BIT, @VersionSesion UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRANSACTION;
    INSERT dbo.Usuarios (IDPublico, Nombres, Apellidos, Correo, ContrasenaHash, Rol, Activo, Eliminado, VersionSesion)
    VALUES (@IDPublico, @Nombres, @Apellidos, @Correo, @ContrasenaHash, @Rol, @Activo, @Eliminado, @VersionSesion);
    DECLARE @IDUsuario INT = CONVERT(INT, SCOPE_IDENTITY());
    SELECT IDUsuario, IDPublico, Nombres, Apellidos, Correo, ContrasenaHash, Rol, Activo, Eliminado, VersionSesion
    FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario AND IDPublico = @IDPublico;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Actualizar
  @IDUsuario INT, @IDPublico UNIQUEIDENTIFIER, @Nombres NVARCHAR(100), @Apellidos NVARCHAR(100),
  @Correo NVARCHAR(254), @ContrasenaHash NVARCHAR(255), @Rol NVARCHAR(20),
  @Activo BIT, @Eliminado BIT, @VersionSesion UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRANSACTION;
    UPDATE dbo.Usuarios SET Nombres = @Nombres, Apellidos = @Apellidos, Correo = @Correo,
      ContrasenaHash = @ContrasenaHash, Rol = @Rol, Activo = @Activo, Eliminado = @Eliminado, VersionSesion = @VersionSesion
    WHERE IDUsuario = @IDUsuario AND IDPublico = @IDPublico;
    SELECT IDUsuario, IDPublico, Nombres, Apellidos, Correo, ContrasenaHash, Rol, Activo, Eliminado, VersionSesion
    FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario AND IDPublico = @IDPublico;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_BuscarPorIdentificadorPublico @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT IDUsuario, IDPublico, Nombres, Apellidos, Correo, ContrasenaHash, Rol, Activo, Eliminado, VersionSesion
  FROM dbo.Usuarios WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_BuscarPorCorreo @Correo NVARCHAR(254)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT IDUsuario, IDPublico, Nombres, Apellidos, Correo, ContrasenaHash, Rol, Activo, Eliminado, VersionSesion
  FROM dbo.Usuarios WHERE Correo = @Correo;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerActual @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT IDUsuario, IDPublico, Nombres, Apellidos, Correo, Rol, Activo, Eliminado, VersionSesion
  FROM dbo.Usuarios WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerDetalle @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT IDPublico, Nombres, Apellidos, Correo, Rol, Activo, Eliminado
  FROM dbo.Usuarios WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Contar @Rol NVARCHAR(20), @Activo BIT, @Eliminado BIT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(*) AS TotalFilas FROM dbo.Usuarios WHERE Rol = @Rol AND Activo = @Activo AND Eliminado = @Eliminado;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Listar @Correo NVARCHAR(254) = NULL, @Pagina INT, @TamanoPagina INT, @Eliminado BIT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(*) AS TotalFilas FROM dbo.Usuarios
  WHERE Eliminado = @Eliminado AND (@Correo IS NULL OR Correo LIKE '%' + @Correo + '%' ESCAPE '\');
  SELECT IDPublico, Nombres, Apellidos, Correo, Rol, Activo FROM dbo.Usuarios
  WHERE Eliminado = @Eliminado AND (@Correo IS NULL OR Correo LIKE '%' + @Correo + '%' ESCAPE '\')
  ORDER BY IDUsuario OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Autorizaciones_Guardar
  @IDUsuario INT, @Proposito NVARCHAR(50), @HashToken NVARCHAR(128), @CorreoPendiente NVARCHAR(254),
  @ExpiraEn DATETIME2(3), @UtilizadaEn DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT dbo.AutorizacionesTemporales (IDUsuario, Proposito, HashToken, CorreoPendiente, ExpiraEn, UtilizadaEn)
  VALUES (@IDUsuario, @Proposito, @HashToken, @CorreoPendiente, @ExpiraEn, @UtilizadaEn);
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Autorizaciones_Buscar @Proposito NVARCHAR(50), @HashToken NVARCHAR(128)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT a.IDAutorizacion, a.IDUsuario, u.IDPublico, a.Proposito, a.HashToken, a.CorreoPendiente, a.ExpiraEn, a.UtilizadaEn
  FROM dbo.AutorizacionesTemporales a JOIN dbo.Usuarios u ON u.IDUsuario = a.IDUsuario
  WHERE a.Proposito = @Proposito AND a.HashToken = @HashToken;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Autorizaciones_Listar @IDUsuario INT, @Proposito NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT a.IDAutorizacion, a.IDUsuario, u.IDPublico, a.Proposito, a.HashToken, a.CorreoPendiente, a.ExpiraEn, a.UtilizadaEn
  FROM dbo.AutorizacionesTemporales a JOIN dbo.Usuarios u ON u.IDUsuario = a.IDUsuario
  WHERE a.IDUsuario = @IDUsuario AND a.Proposito = @Proposito;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Autorizaciones_ActualizarUso @IDAutorizacion INT, @UtilizadaEn DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.AutorizacionesTemporales SET UtilizadaEn = @UtilizadaEn WHERE IDAutorizacion = @IDAutorizacion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_RefreshTokens_Buscar @Jti UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT Jti FROM dbo.TokensRefresco WHERE Jti = @Jti;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_RefreshTokens_Guardar @Jti UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  INSERT dbo.TokensRefresco (Jti) VALUES (@Jti);
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_BandejaCorreos_Guardar
  @Proposito NVARCHAR(50), @Destinatario NVARCHAR(254), @PayloadCifrado NVARCHAR(MAX), @Estado NVARCHAR(20),
  @Intentos INT, @ProximoIntentoEn DATETIME2(3), @UltimoError NVARCHAR(2000), @EnviadoEn DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT dbo.BandejaCorreos (Proposito, Destinatario, PayloadCifrado, Estado, Intentos, ProximoIntentoEn, UltimoError, EnviadoEn)
  VALUES (@Proposito, @Destinatario, @PayloadCifrado, @Estado, @Intentos, @ProximoIntentoEn, @UltimoError, @EnviadoEn);
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_BandejaCorreos_Listar @Estado NVARCHAR(20), @AntesDe DATETIME2(3), @Limite INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (@Limite) IDCorreo, Proposito, Destinatario, PayloadCifrado, Estado, Intentos, ProximoIntentoEn, UltimoError, EnviadoEn
  FROM dbo.BandejaCorreos WHERE Estado = @Estado AND ProximoIntentoEn <= @AntesDe
  ORDER BY ProximoIntentoEn, IDCorreo;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_BandejaCorreos_Actualizar
  @IDCorreo INT, @Proposito NVARCHAR(50), @Destinatario NVARCHAR(254), @PayloadCifrado NVARCHAR(MAX), @Estado NVARCHAR(20),
  @Intentos INT, @ProximoIntentoEn DATETIME2(3), @UltimoError NVARCHAR(2000), @EnviadoEn DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.BandejaCorreos SET Proposito = @Proposito, Destinatario = @Destinatario, PayloadCifrado = @PayloadCifrado,
    Estado = @Estado, Intentos = @Intentos, ProximoIntentoEn = @ProximoIntentoEn, UltimoError = @UltimoError, EnviadoEn = @EnviadoEn
  WHERE IDCorreo = @IDCorreo;
END;
