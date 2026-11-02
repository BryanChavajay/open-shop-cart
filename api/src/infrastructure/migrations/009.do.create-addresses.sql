-- Addresses module: geographic catalog of Guatemala (departments and
-- municipalities), customer delivery addresses, plus the access procedures.
-- Write procedures do not open transactions: they run inside the caller's
-- transaction (the Node UnitOfWork). Read procedures never open transactions.
--
-- DECISIONS (documented only, not enforced here):
--   * The geographic catalog carries IDPublico (GUID) as well as the internal
--     identity: clients address departments and municipalities by public id,
--     consistent with every other module. Catalog seeds are generated with
--     NEWID() at insert time (server-side, migration data, not app-generated
--     UUIDv7) since they are internal reference data, not business entities.
--   * Ownership of an address is ENFORCED IN THE DATABASE for every
--     single-address access: SP_Direcciones_ObtenerPorIDPublico receives the
--     requesting user's internal id and only returns the row when the owner
--     matches (unknown or foreign address = empty result set, mapped by the
--     application to NotFoundError/ADDRESS_NOT_FOUND -> HTTP 404, so a
--     foreign address is indistinguishable from a missing one).
--   * Addresses never store a plain free text department: they hold the
--     IDMunicipio FK and the procedures return department + municipality
--     names joined for the frozen order snapshot.
--   * Addresses are logically deleted (Eliminado = 1): referenced orders keep
--     their origin pointer intact.
--
-- THROW error codes (distinct per condition), range 50500..50509:
--   50500  SP_Direcciones_MunicipiosListarPorDepartamento    departamento indicado inexistente
--   50501  SP_Direcciones_Crear / SP_Direcciones_Actualizar  municipio indicado inexistente
--   50502  SP_Direcciones_Crear                              usuario indicado inexistente
--   50505  SP_Direcciones_Actualizar / SP_Direcciones_Eliminar  direccion inexistente, eliminada o de otro usuario
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  -- Geografic catalog: the 22 departments of Guatemala.
  CREATE TABLE dbo.Departamentos (
    IDDepartamento INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Departamentos PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Departamentos_IDPublico UNIQUE,
    Codigo NVARCHAR(10) NOT NULL CONSTRAINT UQ_Departamentos_Codigo UNIQUE,
    Nombre NVARCHAR(100) NOT NULL CONSTRAINT UQ_Departamentos_Nombre UNIQUE
  );

  CREATE TABLE dbo.Municipios (
    IDMunicipio INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Municipios PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Municipios_IDPublico UNIQUE,
    IDDepartamento INT NOT NULL CONSTRAINT FK_Municipios_Departamentos REFERENCES dbo.Departamentos(IDDepartamento),
    Nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Municipios_Departamento_Nombre UNIQUE (IDDepartamento, Nombre)
  );

  CREATE INDEX IX_Municipios_IDDepartamento
    ON dbo.Municipios(IDDepartamento);

  -- One row per customer delivery address. The municipality carries the
  -- department implicitly; joined names are returned by the procedures.
  CREATE TABLE dbo.DireccionesClientes (
    IDDireccion INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_DireccionesClientes PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_DireccionesClientes_IDPublico UNIQUE,
    IDUsuario INT NOT NULL CONSTRAINT FK_DireccionesClientes_Usuarios REFERENCES dbo.Usuarios(IDUsuario),
    IDMunicipio INT NOT NULL CONSTRAINT FK_DireccionesClientes_Municipios REFERENCES dbo.Municipios(IDMunicipio),
    NombresRecibe NVARCHAR(100) NOT NULL,
    ApellidosRecibe NVARCHAR(100) NOT NULL,
    Telefono NVARCHAR(20) NOT NULL,
    -- Exact street address (zone, colonia, calle/avenida, number, building).
    DireccionExacta NVARCHAR(300) NOT NULL,
    -- Delivery hint from the customer (door color, landmark, etc.).
    Referencia NVARCHAR(300) NOT NULL,
    Eliminado BIT NOT NULL CONSTRAINT DF_DireccionesClientes_Eliminado DEFAULT 0,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_DireccionesClientes_FechaRegistro DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_DireccionesClientes_FechaActualizacion DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_DireccionesClientes_Texto CHECK (
      NombresRecibe <> N'' AND ApellidosRecibe <> N''
      AND DireccionExacta <> N'' AND Referencia <> N''
    ),
    -- Guatemalan local numbers are 8 plain digits; the API normalizes the
    -- optional +502 prefix away before persisting.
    CONSTRAINT CK_DireccionesClientes_Telefono CHECK (
      LEN(Telefono) = 8 AND Telefono NOT LIKE '%[^0-9]%'
    )
  );

  CREATE INDEX IX_DireccionesClientes_IDUsuario
    ON dbo.DireccionesClientes(IDUsuario, FechaRegistro DESC) WHERE Eliminado = 0;

  CREATE INDEX IX_DireccionesClientes_IDMunicipio
    ON dbo.DireccionesClientes(IDMunicipio);

  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

-- Seeds the 22 departments with their official two-digit codes ("01".."22").
INSERT INTO dbo.Departamentos (IDPublico, Codigo, Nombre)
VALUES
  (NEWID(), N'01', N'Guatemala'),
  (NEWID(), N'02', N'El Progreso'),
  (NEWID(), N'03', N'Sacatepéquez'),
  (NEWID(), N'04', N'Chimaltenango'),
  (NEWID(), N'05', N'Escuintla'),
  (NEWID(), N'06', N'Santa Rosa'),
  (NEWID(), N'07', N'Sololá'),
  (NEWID(), N'08', N'Totonicapán'),
  (NEWID(), N'09', N'Quetzaltenango'),
  (NEWID(), N'10', N'Suchitepéquez'),
  (NEWID(), N'11', N'Retalhuleu'),
  (NEWID(), N'12', N'San Marcos'),
  (NEWID(), N'13', N'Huehuetenango'),
  (NEWID(), N'14', N'Quiché'),
  (NEWID(), N'15', N'Baja Verapaz'),
  (NEWID(), N'16', N'Alta Verapaz'),
  (NEWID(), N'17', N'Petén'),
  (NEWID(), N'18', N'Izabal'),
  (NEWID(), N'19', N'Zacapa'),
  (NEWID(), N'20', N'Chiquimula'),
  (NEWID(), N'21', N'Jalapa'),
  (NEWID(), N'22', N'Jutiapa');
GO

-- Seeds the 340 official municipalities. Each block resolves the department
-- by its code; NEWID() fires per row so every municipality gets its own GUID.
INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'01', N'Amatitlán'),
  (N'01', N'Chinautla'),
  (N'01', N'Chuarrancho'),
  (N'01', N'Ciudad de Guatemala'),
  (N'01', N'Fraijanes'),
  (N'01', N'Mixco'),
  (N'01', N'Palencia'),
  (N'01', N'San José del Golfo'),
  (N'01', N'San José Pinula'),
  (N'01', N'San Juan Sacatepéquez'),
  (N'01', N'San Miguel Petapa'),
  (N'01', N'San Pedro Ayampuc'),
  (N'01', N'San Pedro Sacatepéquez'),
  (N'01', N'San Raymundo'),
  (N'01', N'Santa Catarina Pinula'),
  (N'01', N'Villa Canales'),
  (N'01', N'Villa Nueva')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'02', N'El Jícaro'),
  (N'02', N'Guastatoya'),
  (N'02', N'Morazán'),
  (N'02', N'San Agustín Acasaguastlán'),
  (N'02', N'San Antonio La Paz'),
  (N'02', N'San Cristóbal Acasaguastlán'),
  (N'02', N'Sanarate'),
  (N'02', N'Sansare')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'03', N'Alotenango'),
  (N'03', N'Antigua Guatemala'),
  (N'03', N'Ciudad Vieja'),
  (N'03', N'Jocotenango'),
  (N'03', N'Magdalena Milpas Altas'),
  (N'03', N'Pastores'),
  (N'03', N'San Antonio Aguas Calientes'),
  (N'03', N'San Bartolomé Milpas Altas'),
  (N'03', N'San Lucas Sacatepéquez'),
  (N'03', N'San Miguel Dueñas'),
  (N'03', N'Santa Catarina Barahona'),
  (N'03', N'Santa Lucía Milpas Altas'),
  (N'03', N'Santa María de Jesús'),
  (N'03', N'Santiago Sacatepéquez'),
  (N'03', N'Santo Domingo Xenacoj'),
  (N'03', N'Sumpango')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'04', N'Acatenango'),
  (N'04', N'Chimaltenango'),
  (N'04', N'El Tejar'),
  (N'04', N'Parramos'),
  (N'04', N'Patzicía'),
  (N'04', N'Patzún'),
  (N'04', N'Pochuta'),
  (N'04', N'San Andrés Itzapa'),
  (N'04', N'San José Poaquil'),
  (N'04', N'San Juan Comalapa'),
  (N'04', N'San Martín Jilotepeque'),
  (N'04', N'Santa Apolonia'),
  (N'04', N'Santa Cruz Balanyá'),
  (N'04', N'Tecpán'),
  (N'04', N'Yepocapa'),
  (N'04', N'Zaragoza')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'05', N'Escuintla'),
  (N'05', N'Guanagazapa'),
  (N'05', N'Iztapa'),
  (N'05', N'La Democracia'),
  (N'05', N'La Gomera'),
  (N'05', N'Masagua'),
  (N'05', N'Nueva Concepción'),
  (N'05', N'Palín'),
  (N'05', N'Puerto San José'),
  (N'05', N'San José'),
  (N'05', N'San Vicente Pacaya'),
  (N'05', N'Santa Lucía Cotzumalguapa'),
  (N'05', N'Siquinalá'),
  (N'05', N'Tiquisate')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'06', N'Barberena'),
  (N'06', N'Casillas'),
  (N'06', N'Chiquimulilla'),
  (N'06', N'Cuilapa'),
  (N'06', N'Guazacapán'),
  (N'06', N'Nueva Santa Rosa'),
  (N'06', N'Oratorio'),
  (N'06', N'Pueblo Nuevo Viñas'),
  (N'06', N'San Juan Tecuaco'),
  (N'06', N'San Rafael las Flores'),
  (N'06', N'Santa Cruz Naranjo'),
  (N'06', N'Santa María Ixhuatán'),
  (N'06', N'Santa Rosa de Lima'),
  (N'06', N'Taxisco')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'07', N'Concepción'),
  (N'07', N'Nahualá'),
  (N'07', N'Panajachel'),
  (N'07', N'San Andrés Semetabaj'),
  (N'07', N'San Antonio Palopó'),
  (N'07', N'San José Chacayá'),
  (N'07', N'San Juan La Laguna'),
  (N'07', N'San Lucas Tolimán'),
  (N'07', N'San Marcos La Laguna'),
  (N'07', N'San Pablo La Laguna'),
  (N'07', N'San Pedro La Laguna'),
  (N'07', N'Santa Catarina Ixtahuacán'),
  (N'07', N'Santa Catarina Palopó'),
  (N'07', N'Santa Clara La Laguna'),
  (N'07', N'Santa Cruz La Laguna'),
  (N'07', N'Santa Lucía Utatlán'),
  (N'07', N'Santa María Visitación'),
  (N'07', N'Santiago Atitlán'),
  (N'07', N'Sololá')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'08', N'Momostenango'),
  (N'08', N'San Andrés Xecul'),
  (N'08', N'San Bartolo'),
  (N'08', N'San Cristóbal Totonicapán'),
  (N'08', N'San Francisco El Alto'),
  (N'08', N'Santa Lucía La Reforma'),
  (N'08', N'Santa María Chiquimula'),
  (N'08', N'Totonicapán')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'09', N'Almolonga'),
  (N'09', N'Cabricán'),
  (N'09', N'Cajolá'),
  (N'09', N'Cantel'),
  (N'09', N'Coatepeque'),
  (N'09', N'Colomba Costa Cuca'),
  (N'09', N'Concepción Chiquirichapa'),
  (N'09', N'El Palmar'),
  (N'09', N'Flores Costa Cuca'),
  (N'09', N'Génova'),
  (N'09', N'Huitán'),
  (N'09', N'La Esperanza'),
  (N'09', N'Olintepeque'),
  (N'09', N'Palestina de Los Altos'),
  (N'09', N'Quetzaltenango'),
  (N'09', N'Salcajá'),
  (N'09', N'San Carlos Sija'),
  (N'09', N'San Francisco La Unión'),
  (N'09', N'San Juan Ostuncalco'),
  (N'09', N'San Martín Sacatepéquez'),
  (N'09', N'San Mateo'),
  (N'09', N'San Miguel Sigüilá'),
  (N'09', N'Sibilia'),
  (N'09', N'Zunil')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'10', N'Chicacao'),
  (N'10', N'Cuyotenango'),
  (N'10', N'Mazatenango'),
  (N'10', N'Patulul'),
  (N'10', N'Pueblo Nuevo'),
  (N'10', N'Río Bravo'),
  (N'10', N'Samayac'),
  (N'10', N'San Antonio Suchitepéquez'),
  (N'10', N'San Bernardino'),
  (N'10', N'San Francisco Zapotitlán'),
  (N'10', N'San Gabriel'),
  (N'10', N'San José El Ídolo'),
  (N'10', N'San José La Máquina'),
  (N'10', N'San Juan Bautista'),
  (N'10', N'San Lorenzo'),
  (N'10', N'San Miguel Panán'),
  (N'10', N'San Pablo Jocopilas'),
  (N'10', N'Santa Bárbara'),
  (N'10', N'Santo Domingo Suchitepéquez'),
  (N'10', N'Santo Tomás La Unión'),
  (N'10', N'Zunilito')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'11', N'Champerico'),
  (N'11', N'El Asintal'),
  (N'11', N'Nuevo San Carlos'),
  (N'11', N'Retalhuleu'),
  (N'11', N'San Andrés Villa Seca'),
  (N'11', N'San Felipe'),
  (N'11', N'San Martín Zapotitlán'),
  (N'11', N'San Sebastián'),
  (N'11', N'Santa Cruz Muluá')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'12', N'Ayutla'),
  (N'12', N'Catarina'),
  (N'12', N'Comitancillo'),
  (N'12', N'Concepción Tutuapa'),
  (N'12', N'El Quetzal'),
  (N'12', N'El Tumbador'),
  (N'12', N'Esquipulas Palo Gordo'),
  (N'12', N'Ixchiguán'),
  (N'12', N'La Blanca'),
  (N'12', N'La Reforma'),
  (N'12', N'Malacatán'),
  (N'12', N'Nuevo Progreso'),
  (N'12', N'Ocós'),
  (N'12', N'Pajapita'),
  (N'12', N'Río Blanco'),
  (N'12', N'San Antonio Sacatepéquez'),
  (N'12', N'San Cristóbal Cucho'),
  (N'12', N'San José El Rodeo'),
  (N'12', N'San José Ojetenam'),
  (N'12', N'San Lorenzo'),
  (N'12', N'San Marcos'),
  (N'12', N'San Miguel Ixtahuacán'),
  (N'12', N'San Pablo'),
  (N'12', N'San Pedro Sacatepéquez'),
  (N'12', N'San Rafael Pie de la Cuesta'),
  (N'12', N'Sibinal'),
  (N'12', N'Sipacapa'),
  (N'12', N'Tacaná'),
  (N'12', N'Tajumulco'),
  (N'12', N'Tejutla')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'13', N'Aguacatán'),
  (N'13', N'Chiantla'),
  (N'13', N'Colotenango'),
  (N'13', N'Concepción Huista'),
  (N'13', N'Cuilco'),
  (N'13', N'Huehuetenango'),
  (N'13', N'Jacaltenango'),
  (N'13', N'La Democracia'),
  (N'13', N'La Libertad, Huehuetenango'),
  (N'13', N'Malacatancito'),
  (N'13', N'Nentón'),
  (N'13', N'Petatán'),
  (N'13', N'San Antonio Huista'),
  (N'13', N'San Gaspar Ixchil'),
  (N'13', N'San Ildefonso Ixtahuacán'),
  (N'13', N'San Juan Atitán'),
  (N'13', N'San Juan Ixcoy'),
  (N'13', N'San Mateo Ixtatán'),
  (N'13', N'San Miguel Acatán'),
  (N'13', N'San Pedro Nectá'),
  (N'13', N'San Pedro Soloma'),
  (N'13', N'San Rafael La Independencia'),
  (N'13', N'San Rafael Pétzal'),
  (N'13', N'San Sebastián Coatán'),
  (N'13', N'San Sebastián Huehuetenango'),
  (N'13', N'Santa Ana Huista'),
  (N'13', N'Santa Bárbara, Huehuetenango'),
  (N'13', N'Santa Cruz Barillas'),
  (N'13', N'Santa Eulalia'),
  (N'13', N'Santiago Chimaltenango'),
  (N'13', N'Tectitán'),
  (N'13', N'Todos Santos Cuchumatán'),
  (N'13', N'Unión Cantinil')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'14', N'Canillá'),
  (N'14', N'Chajul'),
  (N'14', N'Chicamán'),
  (N'14', N'Chiché'),
  (N'14', N'Chinique'),
  (N'14', N'Cunén'),
  (N'14', N'Ixcán'),
  (N'14', N'Joyabaj'),
  (N'14', N'Nebaj'),
  (N'14', N'Pachalum'),
  (N'14', N'Patzité'),
  (N'14', N'Sacapulas'),
  (N'14', N'San Andrés Sajcabajá'),
  (N'14', N'San Antonio Ilotenango'),
  (N'14', N'San Bartolomé Jocotenango'),
  (N'14', N'San Juan Cotzal'),
  (N'14', N'San Pedro Jocopilas'),
  (N'14', N'Santa Cruz del Quiché'),
  (N'14', N'Santo Tomás Chichicastenango'),
  (N'14', N'Uspantán'),
  (N'14', N'Zacualpa')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'15', N'Cubulco'),
  (N'15', N'Granados'),
  (N'15', N'Purulhá'),
  (N'15', N'Rabinal'),
  (N'15', N'Salamá'),
  (N'15', N'San Jerónimo'),
  (N'15', N'San Miguel Chicaj'),
  (N'15', N'Santa Cruz el Chol')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'16', N'Cahabón'),
  (N'16', N'Chahal'),
  (N'16', N'Chisec'),
  (N'16', N'Cobán'),
  (N'16', N'Fray Bartolomé de las Casas'),
  (N'16', N'Lanquín'),
  (N'16', N'Panzós'),
  (N'16', N'Raxruhá'),
  (N'16', N'San Cristóbal Verapaz'),
  (N'16', N'San Juan Chamelco'),
  (N'16', N'San Pedro Carchá'),
  (N'16', N'Santa Catalina La Tinta'),
  (N'16', N'Santa Cruz Verapaz'),
  (N'16', N'Senahú'),
  (N'16', N'Tamahú'),
  (N'16', N'Tactic'),
  (N'16', N'Tucurú')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'17', N'Dolores'),
  (N'17', N'El Chal'),
  (N'17', N'Flores'),
  (N'17', N'La Libertad, Petén'),
  (N'17', N'Las Cruces'),
  (N'17', N'Melchor de Mencos'),
  (N'17', N'Poptún'),
  (N'17', N'San Andrés, Petén'),
  (N'17', N'San Benito'),
  (N'17', N'San Francisco, Petén'),
  (N'17', N'San José, Petén'),
  (N'17', N'San Luis, Petén'),
  (N'17', N'Santa Ana, Petén'),
  (N'17', N'Sayaxché')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'18', N'El Estor'),
  (N'18', N'Livingston'),
  (N'18', N'Los Amates'),
  (N'18', N'Morales'),
  (N'18', N'Puerto Barrios')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'19', N'Cabañas'),
  (N'19', N'Estanzuela'),
  (N'19', N'Gualán'),
  (N'19', N'Huité'),
  (N'19', N'La Unión, Zacapa'),
  (N'19', N'Río Hondo'),
  (N'19', N'San Diego, Zacapa'),
  (N'19', N'San Jorge, Zacapa'),
  (N'19', N'Teculután'),
  (N'19', N'Usumatlán'),
  (N'19', N'Zacapa')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'20', N'Camotán'),
  (N'20', N'Chiquimula'),
  (N'20', N'Concepción Las Minas'),
  (N'20', N'Esquipulas'),
  (N'20', N'Ipala'),
  (N'20', N'Jocotán'),
  (N'20', N'Olopa'),
  (N'20', N'Quetzaltepeque'),
  (N'20', N'San Jacinto'),
  (N'20', N'San José la Arada'),
  (N'20', N'San Juan Ermita')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'21', N'Jalapa'),
  (N'21', N'Mataquescuintla'),
  (N'21', N'Monjas'),
  (N'21', N'San Carlos Alzatate'),
  (N'21', N'San Luis Jilotepeque'),
  (N'21', N'San Manuel Chaparrón'),
  (N'21', N'San Pedro Pinula')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

INSERT INTO dbo.Municipios (IDPublico, IDDepartamento, Nombre)
SELECT NEWID(), d.IDDepartamento, v.Nombre
FROM dbo.Departamentos d
JOIN (VALUES
  (N'22', N'Agua Blanca'),
  (N'22', N'Asunción Mita'),
  (N'22', N'Atescatempa'),
  (N'22', N'Comapa'),
  (N'22', N'Conguaco'),
  (N'22', N'El Adelanto'),
  (N'22', N'El Progreso, Jutiapa'),
  (N'22', N'Jalpatagua'),
  (N'22', N'Jerez'),
  (N'22', N'Jutiapa'),
  (N'22', N'Moyuta'),
  (N'22', N'Pasaco'),
  (N'22', N'Quesada'),
  (N'22', N'San José Acatempa'),
  (N'22', N'Santa Catarina Mita'),
  (N'22', N'Yupiltepeque'),
  (N'22', N'Zapotitlán')
) AS v(Codigo, Nombre) ON v.Codigo = d.Codigo;
GO

-- Lists every department (administrative read; small table, no pagination).
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_DepartamentosListar
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    IDPublico,
    Codigo,
    Nombre
  FROM dbo.Departamentos
  ORDER BY Codigo;
END;
GO

-- Lists the municipalities of a department (addressed by its public id).
-- 50500: department not found.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_MunicipiosListarPorDepartamento
  @IDPublicoDepartamento UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Departamentos WHERE IDPublico = @IDPublicoDepartamento)
    THROW 50500, N'El departamento indicado no existe', 1;

  SELECT
    m.IDPublico,
    m.Nombre
  FROM dbo.Municipios m
  JOIN dbo.Departamentos d ON d.IDDepartamento = m.IDDepartamento
  WHERE d.IDPublico = @IDPublicoDepartamento
  ORDER BY m.Nombre;
END;
GO

-- Creates one address for a customer and returns it with the joined
-- department and municipality names. The use case generated IDPublico and
-- normalized the fields (trimmed texts, 8-digit phone). INSERT happens INSIDE
-- the caller's transaction.
-- 50501: municipality not found. 50502: user not found.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Crear
  @IDPublico UNIQUEIDENTIFIER,
  @IDUsuario INT,
  @NombresRecibe NVARCHAR(100),
  @ApellidosRecibe NVARCHAR(100),
  @Telefono NVARCHAR(20),
  @IDPublicoMunicipio UNIQUEIDENTIFIER,
  @DireccionExacta NVARCHAR(300),
  @Referencia NVARCHAR(300)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDMunicipio INT = (
    SELECT IDMunicipio FROM dbo.Municipios WHERE IDPublico = @IDPublicoMunicipio
  );
  IF @IDMunicipio IS NULL
    THROW 50501, N'El municipio indicado no existe', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE IDUsuario = @IDUsuario)
    THROW 50502, N'El usuario indicado no existe', 1;

  INSERT INTO dbo.DireccionesClientes (
    IDPublico, IDUsuario, IDMunicipio, NombresRecibe, ApellidosRecibe,
    Telefono, DireccionExacta, Referencia
  )
  VALUES (
    @IDPublico, @IDUsuario, @IDMunicipio, @NombresRecibe, @ApellidosRecibe,
    @Telefono, @DireccionExacta, @Referencia
  );

  SELECT
    a.IDDireccion,
    a.IDPublico,
    a.NombresRecibe,
    a.ApellidosRecibe,
    a.Telefono,
    a.DireccionExacta,
    a.Referencia,
    a.FechaRegistro,
    a.FechaActualizacion,
    CONVERT(NVARCHAR(36), m.IDPublico) AS IDPublicoMunicipio,
    m.Nombre AS NombreMunicipio,
    d.Nombre AS NombreDepartamento
  FROM dbo.DireccionesClientes a
  JOIN dbo.Municipios m ON m.IDMunicipio = a.IDMunicipio
  JOIN dbo.Departamentos d ON d.IDDepartamento = m.IDDepartamento
  WHERE a.IDPublico = @IDPublico;
END;
GO

-- Lists the non-deleted addresses of one customer, most recent first.
-- Recordset 0: { TotalFilas }. Recordset 1: page rows with joined names.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ListarPorUsuario
  @IDUsuario INT,
  @Pagina INT,
  @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;
  IF @Pagina < 1 OR @TamanoPagina < 1 OR @TamanoPagina > 100
    THROW 50504, N'Paginación inválida (1..100)', 1;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.DireccionesClientes
  WHERE IDUsuario = @IDUsuario AND Eliminado = 0;

  SELECT
    a.IDPublico,
    a.NombresRecibe,
    a.ApellidosRecibe,
    a.Telefono,
    a.DireccionExacta,
    a.Referencia,
    a.FechaRegistro,
    a.FechaActualizacion,
    CONVERT(NVARCHAR(36), m.IDPublico) AS IDPublicoMunicipio,
    m.Nombre AS NombreMunicipio,
    d.Nombre AS NombreDepartamento
  FROM dbo.DireccionesClientes a
  JOIN dbo.Municipios m ON m.IDMunicipio = a.IDMunicipio
  JOIN dbo.Departamentos d ON d.IDDepartamento = m.IDDepartamento
  WHERE a.IDUsuario = @IDUsuario AND a.Eliminado = 0
  ORDER BY a.FechaRegistro DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS
  FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

-- Reads one non-deleted address visible to the requesting user. Ownership is
-- part of the predicate: a foreign or unknown address returns an EMPTY result
-- set (the application maps it to NotFoundError/ADDRESS_NOT_FOUND -> 404),
-- never an error, so ownership is unverifiable from outside.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER,
  @IDUsuario INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    a.IDPublico,
    a.NombresRecibe,
    a.ApellidosRecibe,
    a.Telefono,
    a.DireccionExacta,
    a.Referencia,
    a.FechaRegistro,
    a.FechaActualizacion,
    CONVERT(NVARCHAR(36), m.IDPublico) AS IDPublicoMunicipio,
    m.Nombre AS NombreMunicipio,
    d.Nombre AS NombreDepartamento
  FROM dbo.DireccionesClientes a
  JOIN dbo.Municipios m ON m.IDMunicipio = a.IDMunicipio
  JOIN dbo.Departamentos d ON d.IDDepartamento = m.IDDepartamento
  WHERE a.IDPublico = @IDPublico
    AND a.IDUsuario = @IDUsuario
    AND a.Eliminado = 0;
END;
GO

-- Updates an owned, non-deleted address and returns the updated row.
-- 50501: municipality not found.
-- 50505: address not found, deleted or owned by another user.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Actualizar
  @IDPublico UNIQUEIDENTIFIER,
  @IDUsuario INT,
  @NombresRecibe NVARCHAR(100),
  @ApellidosRecibe NVARCHAR(100),
  @Telefono NVARCHAR(20),
  @IDPublicoMunicipio UNIQUEIDENTIFIER,
  @DireccionExacta NVARCHAR(300),
  @Referencia NVARCHAR(300)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDDireccion INT = (
    SELECT IDDireccion FROM dbo.DireccionesClientes
    WHERE IDPublico = @IDPublico AND IDUsuario = @IDUsuario AND Eliminado = 0
  );
  IF @IDDireccion IS NULL
    THROW 50505, N'La dirección indicada no existe, fue eliminada o pertenece a otro cliente', 1;

  DECLARE @IDMunicipio INT = (
    SELECT IDMunicipio FROM dbo.Municipios WHERE IDPublico = @IDPublicoMunicipio
  );
  IF @IDMunicipio IS NULL
    THROW 50501, N'El municipio indicado no existe', 1;

  UPDATE dbo.DireccionesClientes
  SET NombresRecibe = @NombresRecibe,
      ApellidosRecibe = @ApellidosRecibe,
      Telefono = @Telefono,
      IDMunicipio = @IDMunicipio,
      DireccionExacta = @DireccionExacta,
      Referencia = @Referencia,
      FechaActualizacion = SYSUTCDATETIME()
  WHERE IDDireccion = @IDDireccion;

  SELECT
    a.IDDireccion,
    a.IDPublico,
    a.NombresRecibe,
    a.ApellidosRecibe,
    a.Telefono,
    a.DireccionExacta,
    a.Referencia,
    a.FechaRegistro,
    a.FechaActualizacion,
    CONVERT(NVARCHAR(36), m.IDPublico) AS IDPublicoMunicipio,
    m.Nombre AS NombreMunicipio,
    d.Nombre AS NombreDepartamento
  FROM dbo.DireccionesClientes a
  JOIN dbo.Municipios m ON m.IDMunicipio = a.IDMunicipio
  JOIN dbo.Departamentos d ON d.IDDepartamento = m.IDDepartamento
  WHERE a.IDDireccion = @IDDireccion;
END;
GO

-- Logical delete (Eliminado = 1) of an owned, non-deleted address.
-- 50505: address not found, deleted or owned by another user.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Eliminar
  @IDPublico UNIQUEIDENTIFIER,
  @IDUsuario INT
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDDireccion INT = (
    SELECT IDDireccion FROM dbo.DireccionesClientes
    WHERE IDPublico = @IDPublico AND IDUsuario = @IDUsuario AND Eliminado = 0
  );
  IF @IDDireccion IS NULL
    THROW 50505, N'La dirección indicada no existe, fue eliminada o pertenece a otro cliente', 1;

  UPDATE dbo.DireccionesClientes
  SET Eliminado = 1,
      FechaActualizacion = SYSUTCDATETIME()
  WHERE IDDireccion = @IDDireccion;
END;
GO
