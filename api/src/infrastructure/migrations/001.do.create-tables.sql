SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  CREATE TABLE dbo.Usuarios (
    IDUsuario INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Usuarios PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Usuarios_IDPublico UNIQUE,
    Nombres NVARCHAR(100) NOT NULL,
    Apellidos NVARCHAR(100) NULL,
    Correo NVARCHAR(254) NOT NULL CONSTRAINT UQ_Usuarios_Correo UNIQUE,
    ContrasenaHash NVARCHAR(255) NOT NULL,
    Rol NVARCHAR(20) NOT NULL,
    Activo BIT NOT NULL,
    Eliminado BIT NOT NULL,
    VersionSesion UNIQUEIDENTIFIER NOT NULL,
    FechaCreacion DATETIME2(3) NOT NULL CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_Usuarios_Rol CHECK (Rol IN ('CLIENTE', 'OPERADOR', 'ADMINISTRADOR'))
  );

  CREATE TABLE dbo.AutorizacionesTemporales (
    IDAutorizacion INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AutorizacionesTemporales PRIMARY KEY,
    IDUsuario INT NOT NULL CONSTRAINT FK_AutorizacionesTemporales_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    Proposito NVARCHAR(50) NOT NULL,
    HashToken NVARCHAR(128) NOT NULL,
    CorreoPendiente NVARCHAR(254) NULL,
    ExpiraEn DATETIME2(3) NOT NULL,
    UtilizadaEn DATETIME2(3) NULL,
    CONSTRAINT CK_AutorizacionesTemporales_Proposito CHECK (Proposito IN ('ACCOUNT_CONFIRMATION', 'PASSWORD_RECOVERY', 'EMAIL_CHANGE')),
    CONSTRAINT CK_AutorizacionesTemporales_CorreoPendiente CHECK (CorreoPendiente IS NULL OR Proposito = 'EMAIL_CHANGE')
  );

  CREATE INDEX IX_AutorizacionesTemporales_HashToken
    ON dbo.AutorizacionesTemporales(Proposito, HashToken)
    INCLUDE (IDAutorizacion, IDUsuario, CorreoPendiente, ExpiraEn) WHERE UtilizadaEn IS NULL;

  CREATE INDEX IX_AutorizacionesTemporales_Pendientes
    ON dbo.AutorizacionesTemporales(IDUsuario, Proposito) WHERE UtilizadaEn IS NULL;

  CREATE TABLE dbo.TokensRefresco (
    IDToken INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_TokensRefresco PRIMARY KEY,
    Jti UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_TokensRefresco_Jti UNIQUE
  );

  CREATE TABLE dbo.BandejaCorreos (
    IDCorreo INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_BandejaCorreos PRIMARY KEY,
    Proposito NVARCHAR(50) NOT NULL,
    Destinatario NVARCHAR(254) NOT NULL,
    PayloadCifrado NVARCHAR(MAX) NULL,
    Estado NVARCHAR(20) NOT NULL,
    Intentos INT NOT NULL CONSTRAINT DF_BandejaCorreos_Intentos DEFAULT 0,
    ProximoIntentoEn DATETIME2(3) NOT NULL,
    UltimoError NVARCHAR(2000) NULL,
    CreadoEn DATETIME2(3) NOT NULL CONSTRAINT DF_BandejaCorreos_CreadoEn DEFAULT SYSUTCDATETIME(),
    EnviadoEn DATETIME2(3) NULL,
    CONSTRAINT CK_BandejaCorreos_Proposito CHECK (Proposito IN ('ACCOUNT_CONFIRMATION', 'PASSWORD_RECOVERY', 'EMAIL_CHANGE')),
    CONSTRAINT CK_BandejaCorreos_Estado CHECK (Estado IN ('PENDIENTE', 'ENVIADO')),
    CONSTRAINT CK_BandejaCorreos_Intentos CHECK (Intentos >= 0)
  );
  CREATE INDEX IX_BandejaCorreos_Estado_ProximoIntentoEn ON dbo.BandejaCorreos(Estado, ProximoIntentoEn);
  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
