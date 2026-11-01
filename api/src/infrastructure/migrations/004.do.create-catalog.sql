-- Catalog module (DIY phase): categories, brands, products, variants,
-- options/values, variant combinations and product images, plus access
-- procedures. Write procedures do not open transactions: they run inside the
-- caller's transaction. Read procedures never open transactions. The only
-- exception is SP_Catalogo_OpcionesEliminarDeProducto (single atomic cascade
-- delete, opens its own transaction).
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  CREATE TABLE dbo.Categorias (
    IDCategoria INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Categorias PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Categorias_IDPublico UNIQUE,
    Nombre NVARCHAR(100) NOT NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Categorias_Activo DEFAULT 1,
    Eliminado BIT NOT NULL CONSTRAINT DF_Categorias_Eliminado DEFAULT 0,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_Categorias_FechaRegistro DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_Categorias_FechaActualizacion DEFAULT SYSUTCDATETIME()
  );

  CREATE UNIQUE INDEX UX_Categorias_Nombre
    ON dbo.Categorias(Nombre) WHERE Eliminado = 0;

  CREATE INDEX IX_Categorias_Activo_Eliminado
    ON dbo.Categorias(Activo, Eliminado);

  CREATE TABLE dbo.Marcas (
    IDMarca INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Marcas PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Marcas_IDPublico UNIQUE,
    Nombre NVARCHAR(100) NOT NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Marcas_Activo DEFAULT 1,
    Eliminado BIT NOT NULL CONSTRAINT DF_Marcas_Eliminado DEFAULT 0,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_Marcas_FechaRegistro DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_Marcas_FechaActualizacion DEFAULT SYSUTCDATETIME()
  );

  CREATE UNIQUE INDEX UX_Marcas_Nombre
    ON dbo.Marcas(Nombre) WHERE Eliminado = 0;

  CREATE INDEX IX_Marcas_Activo_Eliminado
    ON dbo.Marcas(Activo, Eliminado);

  CREATE TABLE dbo.Imagenes (
    IDImagen INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Imagenes PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Imagenes_IDPublico UNIQUE,
    ClaveAlmacenamiento NVARCHAR(100) NOT NULL CONSTRAINT UQ_Imagenes_ClaveAlmacenamiento UNIQUE,
    TipoContenido NVARCHAR(50) NOT NULL,
    TamanoBytes INT NOT NULL,
    Ancho INT NOT NULL,
    Alto INT NOT NULL,
    TextoAlternativo NVARCHAR(300) NULL,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_Imagenes_FechaRegistro DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Imagenes_Archivo CHECK (TamanoBytes > 0 AND Ancho > 0 AND Alto > 0)
  );

  CREATE TABLE dbo.Productos (
    IDProducto INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Productos PRIMARY KEY,
    IDImagenPortada INT NULL CONSTRAINT FK_Productos_ImagenPortada REFERENCES dbo.Imagenes(IDImagen),
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_Productos_IDPublico UNIQUE,
    IDCategoria INT NOT NULL CONSTRAINT FK_Productos_Categorias REFERENCES dbo.Categorias(IDCategoria),
    IDMarca INT NOT NULL CONSTRAINT FK_Productos_Marcas REFERENCES dbo.Marcas(IDMarca),
    Nombre NVARCHAR(200) NOT NULL,
    Descripcion NVARCHAR(2000) NOT NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Productos_Activo DEFAULT 0,
    Eliminado BIT NOT NULL CONSTRAINT DF_Productos_Eliminado DEFAULT 0,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_Productos_FechaRegistro DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_Productos_FechaActualizacion DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_Productos_IDCategoria ON dbo.Productos(IDCategoria);
  CREATE INDEX IX_Productos_IDMarca ON dbo.Productos(IDMarca);
  CREATE INDEX IX_Productos_IDImagenPortada ON dbo.Productos(IDImagenPortada);
  CREATE INDEX IX_Productos_Activo_Eliminado ON dbo.Productos(Activo, Eliminado);
  CREATE INDEX IX_Productos_Nombre ON dbo.Productos(Nombre ASC);

  -- ExistenciaFisica is owned by the (future) inventory module; catalog
  -- procedures never write it, they only filter on it for public listing.
  CREATE TABLE dbo.ProductosVariantes (
    IDVariante INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ProductosVariantes PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_ProductosVariantes_IDPublico UNIQUE,
    IDImagenPortada INT NULL CONSTRAINT FK_ProductosVariantes_ImagenPortada REFERENCES dbo.Imagenes(IDImagen),
    IDProducto INT NOT NULL CONSTRAINT FK_ProductosVariantes_Productos REFERENCES dbo.Productos(IDProducto) ON DELETE CASCADE,
    SKU NVARCHAR(64) NOT NULL CONSTRAINT UQ_ProductosVariantes_SKU UNIQUE,
    NombreVariante NVARCHAR(100) NOT NULL,
    CostoUnitario DECIMAL(10, 2) NULL,
    PrecioUnitario DECIMAL(10, 2) NOT NULL,
    ExistenciaFisica INT NOT NULL CONSTRAINT DF_ProductosVariantes_ExistenciaFisica DEFAULT 0,
    Orden INT NOT NULL CONSTRAINT DF_ProductosVariantes_Orden DEFAULT 1,
    Activo BIT NOT NULL CONSTRAINT DF_ProductosVariantes_Activo DEFAULT 1,
    Eliminado BIT NOT NULL CONSTRAINT DF_ProductosVariantes_Eliminado DEFAULT 0,
    FechaRegistro DATETIME2(3) NOT NULL CONSTRAINT DF_ProductosVariantes_FechaRegistro DEFAULT SYSUTCDATETIME(),
    FechaActualizacion DATETIME2(3) NOT NULL CONSTRAINT DF_ProductosVariantes_FechaActualizacion DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_ProductosVariantes_PrecioUnitario CHECK (PrecioUnitario > 0),
    CONSTRAINT CK_ProductosVariantes_CostoUnitario CHECK (CostoUnitario IS NULL OR CostoUnitario >= 0)
  );

  CREATE INDEX IX_ProductosVariantes_IDProducto ON dbo.ProductosVariantes(IDProducto);
  CREATE INDEX IX_ProductosVariantes_IDImagenPortada ON dbo.ProductosVariantes(IDImagenPortada);
  CREATE INDEX IX_ProductosVariantes_PrecioUnitario ON dbo.ProductosVariantes(PrecioUnitario);

  CREATE TABLE dbo.ProductosOpciones (
    IDOpcion INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ProductosOpciones PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_ProductosOpciones_IDPublico UNIQUE,
    IDProducto INT NOT NULL CONSTRAINT FK_ProductosOpciones_Productos REFERENCES dbo.Productos(IDProducto) ON DELETE CASCADE,
    NombreOpcion NVARCHAR(50) NOT NULL,
    Orden INT NOT NULL CONSTRAINT DF_ProductosOpciones_Orden DEFAULT 1,

    CONSTRAINT UQ_ProductosOpciones_Producto_NombreOpcion UNIQUE (IDProducto, NombreOpcion),
    CONSTRAINT UQ_ProductosOpciones_Producto_Orden UNIQUE (IDProducto, Orden)
  );

  CREATE TABLE dbo.ProductosOpcionesValores (
    IDValor INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ProductosOpcionesValores PRIMARY KEY,
    IDPublico UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_ProductosOpcionesValores_IDPublico UNIQUE,
    IDOpcion INT NOT NULL CONSTRAINT FK_ProductosOpcionesValores_ProductosOpciones REFERENCES dbo.ProductosOpciones(IDOpcion) ON DELETE CASCADE,
    Valor NVARCHAR(50) NOT NULL,
    Orden INT NOT NULL CONSTRAINT DF_ProductosOpcionesValores_Orden DEFAULT 1,

    CONSTRAINT UQ_ProductosOpcionesValores_Opcion_Valor UNIQUE (IDOpcion, Valor),
    CONSTRAINT UQ_ProductosOpcionesValores_Opcion_Orden UNIQUE (IDOpcion, Orden)
  );

  CREATE TABLE dbo.ProductosVariantesValores (
    IDVariante INT NOT NULL CONSTRAINT FK_ProductosVariantesValores_ProductosVariantes REFERENCES dbo.ProductosVariantes(IDVariante) ON DELETE CASCADE,
    -- Avoid SQL Server's multiple cascade paths through product options/variants.
    IDValor INT NOT NULL CONSTRAINT FK_ProductosVariantesValores_ProductosOpcionesValores REFERENCES dbo.ProductosOpcionesValores(IDValor),

    CONSTRAINT PK_ProductosVariantesValores PRIMARY KEY (IDVariante, IDValor)
  );

  CREATE INDEX IX_ProductosVariantesValores_IDValor
    ON dbo.ProductosVariantesValores(IDValor);

  CREATE TABLE dbo.ProductosVariantesImagenes (
    IDVariante INT NOT NULL CONSTRAINT FK_ProductosVariantesImagenes_Variante REFERENCES dbo.ProductosVariantes(IDVariante) ON DELETE CASCADE,
    IDImagen INT NOT NULL CONSTRAINT FK_ProductosVariantesImagenes_Imagen REFERENCES dbo.Imagenes(IDImagen),
    Orden INT NOT NULL,
    CONSTRAINT PK_ProductosVariantesImagenes PRIMARY KEY (IDVariante, IDImagen),
    CONSTRAINT UQ_ProductosVariantesImagenes_Orden UNIQUE (IDVariante, Orden),
    CONSTRAINT CK_ProductosVariantesImagenes_Orden CHECK (Orden >= 1)
  );
  CREATE INDEX IX_ProductosVariantesImagenes_IDImagen ON dbo.ProductosVariantesImagenes(IDImagen);

  COMMIT;

END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CategoriasGuardar
  @IDCategoria INT = NULL, @IDPublico UNIQUEIDENTIFIER, @Nombre NVARCHAR(100), @Activo BIT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDCategoria IS NULL
  BEGIN
    INSERT dbo.Categorias (IDPublico, Nombre, Activo)
    VALUES (@IDPublico, @Nombre, @Activo);
    SET @IDCategoria = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE dbo.Categorias
    SET Nombre = @Nombre, Activo = @Activo, FechaActualizacion = SYSUTCDATETIME()
    WHERE IDCategoria = @IDCategoria;
  END

  SELECT IDCategoria, IDPublico, Nombre, Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.Categorias
  WHERE IDCategoria = @IDCategoria;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CategoriasListar
  @VerEliminados BIT, @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Categorias
  WHERE (@VerEliminados = 1 OR Eliminado = 0);

  SELECT IDCategoria, IDPublico, Nombre, Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.Categorias
  WHERE (@VerEliminados = 1 OR Eliminado = 0)
  ORDER BY Nombre ASC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CategoriasObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT IDCategoria, IDPublico, Nombre, Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.Categorias
  WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CategoriasContarProductos
  @IDCategoria INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Productos
  WHERE IDCategoria = @IDCategoria AND Eliminado = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CategoriasTieneProductos
  @IDCategoria INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1 ProductoIDPublico = IDPublico
  FROM dbo.Productos
  WHERE IDCategoria = @IDCategoria AND Eliminado = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CategoriasEliminar
  @IDCategoria INT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Categorias
  SET Activo = 0, Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDCategoria = @IDCategoria;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_MarcasGuardar
  @IDMarca INT = NULL, @IDPublico UNIQUEIDENTIFIER, @Nombre NVARCHAR(100), @Activo BIT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDMarca IS NULL
  BEGIN
    INSERT dbo.Marcas (IDPublico, Nombre, Activo)
    VALUES (@IDPublico, @Nombre, @Activo);
    SET @IDMarca = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE dbo.Marcas
    SET Nombre = @Nombre, Activo = @Activo, FechaActualizacion = SYSUTCDATETIME()
    WHERE IDMarca = @IDMarca;
  END

  SELECT IDMarca, IDPublico, Nombre, Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.Marcas
  WHERE IDMarca = @IDMarca;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_MarcasListar
  @VerEliminados BIT, @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Marcas
  WHERE (@VerEliminados = 1 OR Eliminado = 0);

  SELECT IDMarca, IDPublico, Nombre, Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.Marcas
  WHERE (@VerEliminados = 1 OR Eliminado = 0)
  ORDER BY Nombre ASC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_MarcasObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT IDMarca, IDPublico, Nombre, Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.Marcas
  WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_MarcasContarProductos
  @IDMarca INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Productos
  WHERE IDMarca = @IDMarca AND Eliminado = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_MarcasTieneProductos
  @IDMarca INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1 ProductoIDPublico = IDPublico
  FROM dbo.Productos
  WHERE IDMarca = @IDMarca AND Eliminado = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_MarcasEliminar
  @IDMarca INT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Marcas
  SET Activo = 0, Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDMarca = @IDMarca;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosGuardar
  @IDProducto INT = NULL, @IDPublico UNIQUEIDENTIFIER,
  @IDCategoria INT, @IDMarca INT,
  @Nombre NVARCHAR(200), @Descripcion NVARCHAR(2000), @Activo BIT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDProducto IS NULL
  BEGIN
    INSERT dbo.Productos (IDPublico, IDCategoria, IDMarca, Nombre, Descripcion, Activo)
    VALUES (@IDPublico, @IDCategoria, @IDMarca, @Nombre, @Descripcion, @Activo);
    SET @IDProducto = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE dbo.Productos
    SET IDCategoria = @IDCategoria, IDMarca = @IDMarca, Nombre = @Nombre,
        Descripcion = @Descripcion, Activo = @Activo, FechaActualizacion = SYSUTCDATETIME()
    WHERE IDProducto = @IDProducto;
  END

  SELECT P.IDProducto, P.IDPublico, P.IDImagenPortada,
         P.IDCategoria, C.IDPublico AS CategoriaIDPublico, C.Nombre AS NombreCategoria,
         P.IDMarca, M.IDPublico AS MarcaIDPublico, M.Nombre AS NombreMarca,
         P.Nombre, P.Descripcion, P.Activo, P.Eliminado, P.FechaRegistro, P.FechaActualizacion
  FROM dbo.Productos P
    JOIN dbo.Categorias C ON C.IDCategoria = P.IDCategoria
    JOIN dbo.Marcas M ON M.IDMarca = P.IDMarca
  WHERE P.IDProducto = @IDProducto;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT P.IDProducto, P.IDPublico, P.IDImagenPortada,
         P.IDCategoria, C.IDPublico AS CategoriaIDPublico, C.Nombre AS NombreCategoria,
         P.IDMarca, M.IDPublico AS MarcaIDPublico, M.Nombre AS NombreMarca,
         P.Nombre, P.Descripcion, P.Activo, P.Eliminado, P.FechaRegistro, P.FechaActualizacion
  FROM dbo.Productos P
    JOIN dbo.Categorias C ON C.IDCategoria = P.IDCategoria
    JOIN dbo.Marcas M ON M.IDMarca = P.IDMarca
  WHERE P.IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosObtenerPorID
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT P.IDProducto, P.IDPublico, P.IDImagenPortada,
         P.IDCategoria, C.IDPublico AS CategoriaIDPublico, C.Nombre AS NombreCategoria,
         P.IDMarca, M.IDPublico AS MarcaIDPublico, M.Nombre AS NombreMarca,
         P.Nombre, P.Descripcion, P.Activo, P.Eliminado, P.FechaRegistro, P.FechaActualizacion
  FROM dbo.Productos P
    JOIN dbo.Categorias C ON C.IDCategoria = P.IDCategoria
    JOIN dbo.Marcas M ON M.IDMarca = P.IDMarca
  WHERE P.IDProducto = @IDProducto;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosListarAdmin
  @IDCategoria INT = NULL, @IDMarca INT = NULL, @Eliminado BIT = 0, @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Productos P
  WHERE P.Eliminado = @Eliminado
    AND (@IDCategoria IS NULL OR P.IDCategoria = @IDCategoria)
    AND (@IDMarca IS NULL OR P.IDMarca = @IDMarca);

  SELECT P.IDProducto, P.IDPublico, P.IDImagenPortada,
         P.IDCategoria, C.IDPublico AS CategoriaIDPublico, C.Nombre AS NombreCategoria,
         P.IDMarca, M.IDPublico AS MarcaIDPublico, M.Nombre AS NombreMarca,
         P.Nombre, P.Descripcion, P.Activo, P.Eliminado, P.FechaRegistro, P.FechaActualizacion,
         (SELECT COUNT(*)
          FROM dbo.ProductosVariantes V
          WHERE V.IDProducto = P.IDProducto AND V.Activo = 1 AND V.Eliminado = 0) AS CantidadVariantesActivas,
         (SELECT MIN(V.PrecioUnitario)
          FROM dbo.ProductosVariantes V
          WHERE V.IDProducto = P.IDProducto AND V.Activo = 1 AND V.Eliminado = 0) AS PrecioMinimo,
         (SELECT MAX(V.PrecioUnitario)
          FROM dbo.ProductosVariantes V
          WHERE V.IDProducto = P.IDProducto AND V.Activo = 1 AND V.Eliminado = 0) AS PrecioMaximo
  FROM dbo.Productos P
    JOIN dbo.Categorias C ON C.IDCategoria = P.IDCategoria
    JOIN dbo.Marcas M ON M.IDMarca = P.IDMarca
  WHERE P.Eliminado = @Eliminado
    AND (@IDCategoria IS NULL OR P.IDCategoria = @IDCategoria)
    AND (@IDMarca IS NULL OR P.IDMarca = @IDMarca)
  ORDER BY P.IDProducto DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosListarPublico
  @Texto NVARCHAR(200) = NULL, @IDCategoria INT = NULL, @IDMarca INT = NULL,
  @PrecioMinimo DECIMAL(10, 2) = NULL, @PrecioMaximo DECIMAL(10, 2) = NULL,
  @SoloDisponible BIT = 0, @OrdenPor NVARCHAR(20) = 'nombre', @Pagina INT, @TamanoPagina INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS TotalFilas
  FROM dbo.Productos P
  WHERE P.Activo = 1
    AND P.Eliminado = 0
    AND (@Texto IS NULL OR P.Descripcion LIKE '%' + @Texto + '%')
    AND (@IDCategoria IS NULL OR P.IDCategoria = @IDCategoria)
    AND (@IDMarca IS NULL OR P.IDMarca = @IDMarca)
    AND EXISTS (
      SELECT 1
      FROM dbo.ProductosVariantes V
      WHERE V.IDProducto = P.IDProducto
        AND V.Activo = 1
        AND V.Eliminado = 0
        AND (@PrecioMinimo IS NULL OR V.PrecioUnitario >= @PrecioMinimo)
        AND (@PrecioMaximo IS NULL OR V.PrecioUnitario <= @PrecioMaximo)
        AND (@SoloDisponible = 0 OR V.ExistenciaFisica > 0)
    );

  WITH Base AS (
    SELECT P.IDProducto, P.IDPublico, P.IDImagenPortada, P.Nombre, P.Descripcion, P.FechaRegistro,
           P.IDCategoria, C.IDPublico AS CategoriaIDPublico, C.Nombre AS NombreCategoria,
           P.IDMarca, M.IDPublico AS MarcaIDPublico, M.Nombre AS NombreMarca,
           (SELECT MIN(V.PrecioUnitario)
            FROM dbo.ProductosVariantes V
            WHERE V.IDProducto = P.IDProducto AND V.Activo = 1 AND V.Eliminado = 0) AS PrecioMinimo,
           (SELECT COUNT(*)
            FROM dbo.ProductosVariantes V
            WHERE V.IDProducto = P.IDProducto AND V.Activo = 1 AND V.Eliminado = 0) AS CantidadVariantes
    FROM dbo.Productos P
      JOIN dbo.Categorias C ON C.IDCategoria = P.IDCategoria
      JOIN dbo.Marcas M ON M.IDMarca = P.IDMarca
    WHERE P.Activo = 1
      AND P.Eliminado = 0
      AND (@Texto IS NULL OR P.Descripcion LIKE '%' + @Texto + '%')
      AND (@IDCategoria IS NULL OR P.IDCategoria = @IDCategoria)
      AND (@IDMarca IS NULL OR P.IDMarca = @IDMarca)
      AND EXISTS (
        SELECT 1
        FROM dbo.ProductosVariantes V
        WHERE V.IDProducto = P.IDProducto
          AND V.Activo = 1
          AND V.Eliminado = 0
          AND (@PrecioMinimo IS NULL OR V.PrecioUnitario >= @PrecioMinimo)
          AND (@PrecioMaximo IS NULL OR V.PrecioUnitario <= @PrecioMaximo)
          AND (@SoloDisponible = 0 OR V.ExistenciaFisica > 0)
      )
  )
  SELECT B.IDPublico, B.IDImagenPortada, B.Nombre, B.Descripcion,
         B.IDCategoria, B.CategoriaIDPublico, B.NombreCategoria,
         B.IDMarca, B.MarcaIDPublico, B.NombreMarca,
         B.PrecioMinimo, B.CantidadVariantes, B.FechaRegistro
  FROM Base B
  ORDER BY
    CASE WHEN @OrdenPor = 'nombre' THEN B.Nombre END ASC,
    CASE WHEN @OrdenPor = 'fecha' THEN B.FechaRegistro END DESC,
    CASE WHEN @OrdenPor = 'precio' THEN B.PrecioMinimo END ASC,
    B.IDProducto ASC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosEliminar
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Productos
  SET Activo = 0, Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDProducto = @IDProducto;

  UPDATE dbo.ProductosVariantes
  SET Activo = 0
  WHERE IDProducto = @IDProducto;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosTieneVentas
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;

  -- Placeholder until the orders/pedidos module exists.
  SELECT CAST(0 AS BIT) AS TieneVentas;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_VariantesGuardar
  @IDVariante INT = NULL, @IDPublico UNIQUEIDENTIFIER, @IDProducto INT,
  @SKU NVARCHAR(64), @NombreVariante NVARCHAR(100),
  @CostoUnitario DECIMAL(10, 2) = NULL, @PrecioUnitario DECIMAL(10, 2),
  @Orden INT = 1, @Activo BIT = 1
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDVariante IS NULL
  BEGIN
    -- ExistenciaFisica stays at its default (0); the inventory module owns it.
    INSERT dbo.ProductosVariantes (IDPublico, IDProducto, SKU, NombreVariante, CostoUnitario, PrecioUnitario, Orden, Activo)
    VALUES (@IDPublico, @IDProducto, @SKU, @NombreVariante, @CostoUnitario, @PrecioUnitario, @Orden, @Activo);
    SET @IDVariante = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE dbo.ProductosVariantes
    SET SKU = @SKU, NombreVariante = @NombreVariante, CostoUnitario = @CostoUnitario,
        PrecioUnitario = @PrecioUnitario, Orden = @Orden, Activo = @Activo,
        FechaActualizacion = SYSUTCDATETIME()
    WHERE IDVariante = @IDVariante;
  END

  SELECT IDVariante, IDPublico, IDImagenPortada, IDProducto, SKU, NombreVariante,
         CostoUnitario, PrecioUnitario, ExistenciaFisica, Orden,
         Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.ProductosVariantes
  WHERE IDVariante = @IDVariante;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_VariantesObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  SELECT IDVariante, IDPublico, IDImagenPortada, IDProducto, SKU, NombreVariante,
         CostoUnitario, PrecioUnitario, ExistenciaFisica, Orden,
         Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.ProductosVariantes
  WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_VariantesListarDeProducto
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT IDVariante, IDPublico, IDImagenPortada, IDProducto, SKU, NombreVariante,
         CostoUnitario, PrecioUnitario, ExistenciaFisica, Orden,
         Activo, Eliminado, FechaRegistro, FechaActualizacion
  FROM dbo.ProductosVariantes
  WHERE IDProducto = @IDProducto AND Eliminado = 0
  ORDER BY Orden ASC, IDVariante ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_VariantesEliminar
  @IDVariante INT
AS
BEGIN
  SET NOCOUNT ON;

  -- The SKU is never released or reused.
  UPDATE dbo.ProductosVariantes
  SET Activo = 0, Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
  WHERE IDVariante = @IDVariante;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_OpcionesGuardar
  @IDPublico UNIQUEIDENTIFIER, @IDProducto INT, @NombreOpcion NVARCHAR(50), @Orden INT
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1 FROM dbo.ProductosOpciones
    WHERE IDProducto = @IDProducto AND NombreOpcion = @NombreOpcion
  )
    THROW 50003, 'La opción ya existe en el producto', 1;

  INSERT dbo.ProductosOpciones (IDPublico, IDProducto, NombreOpcion, Orden)
  VALUES (@IDPublico, @IDProducto, @NombreOpcion, @Orden);

  DECLARE @IDOpcion INT = SCOPE_IDENTITY();

  SELECT IDOpcion, IDPublico, IDProducto, NombreOpcion, Orden
  FROM dbo.ProductosOpciones
  WHERE IDOpcion = @IDOpcion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ValoresGuardar
  @IDPublico UNIQUEIDENTIFIER, @IDOpcion INT, @Valor NVARCHAR(50), @Orden INT
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.ProductosOpciones WHERE IDOpcion = @IDOpcion)
    THROW 50004, 'La opción indicada no existe', 1;

  IF EXISTS (
    SELECT 1 FROM dbo.ProductosOpcionesValores
    WHERE IDOpcion = @IDOpcion AND Valor = @Valor
  )
    THROW 50005, 'La opción ya tiene un valor con el mismo texto', 1;

  INSERT dbo.ProductosOpcionesValores (IDPublico, IDOpcion, Valor, Orden)
  VALUES (@IDPublico, @IDOpcion, @Valor, @Orden);

  DECLARE @IDValor INT = SCOPE_IDENTITY();

  SELECT IDValor, IDPublico, IDOpcion, Valor, Orden
  FROM dbo.ProductosOpcionesValores
  WHERE IDValor = @IDValor;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_OpcionesListarDeProducto
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;

  -- Two recordsets: [0] options of the product, [1] values of those options.
  SELECT IDOpcion, IDPublico, IDProducto, NombreOpcion, Orden
  FROM dbo.ProductosOpciones
  WHERE IDProducto = @IDProducto
  ORDER BY Orden ASC, IDOpcion ASC;

  SELECT OV.IDValor, OV.IDPublico, OV.IDOpcion, OV.Valor, OV.Orden
  FROM dbo.ProductosOpcionesValores OV
    JOIN dbo.ProductosOpciones O ON O.IDOpcion = OV.IDOpcion
  WHERE O.IDProducto = @IDProducto
  ORDER BY OV.Orden ASC, OV.IDValor ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_OpcionesEliminarDeProducto
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- Single atomic cascade delete: variant combinations, option values and
  -- options of the product. Exception to the rule: opens its own transaction.
  BEGIN TRY
    BEGIN TRANSACTION;

    DELETE CV
    FROM dbo.ProductosVariantesValores CV
      JOIN dbo.ProductosVariantes V ON V.IDVariante = CV.IDVariante
      JOIN dbo.ProductosOpcionesValores OV ON OV.IDValor = CV.IDValor
      JOIN dbo.ProductosOpciones O ON O.IDOpcion = OV.IDOpcion
    WHERE O.IDProducto = @IDProducto;

    DELETE OV
    FROM dbo.ProductosOpcionesValores OV
      JOIN dbo.ProductosOpciones O ON O.IDOpcion = OV.IDOpcion
    WHERE O.IDProducto = @IDProducto;

    DELETE dbo.ProductosOpciones
    WHERE IDProducto = @IDProducto;

    COMMIT;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CombosVaciarDeVariante
  @IDVariante INT
AS
BEGIN
  SET NOCOUNT ON;

  DELETE dbo.ProductosVariantesValores
  WHERE IDVariante = @IDVariante;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CombosAgregar
  @IDVariante INT, @IDValor INT
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @IDProducto INT = (SELECT IDProducto FROM dbo.ProductosVariantes WHERE IDVariante = @IDVariante);
  IF @IDProducto IS NULL
    THROW 50001, 'La variante del combo no existe', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.ProductosOpcionesValores OV
      JOIN dbo.ProductosOpciones O ON O.IDOpcion = OV.IDOpcion
    WHERE OV.IDValor = @IDValor AND O.IDProducto = @IDProducto
  )
    THROW 50002, 'El valor no pertenece al producto de la variante', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.ProductosVariantesValores WHERE IDVariante = @IDVariante AND IDValor = @IDValor)
    INSERT dbo.ProductosVariantesValores (IDVariante, IDValor)
    VALUES (@IDVariante, @IDValor);
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CombosListar
  @IDVariante INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT CV.IDVariante, OV.IDValor, OV.IDPublico, OV.Valor, OV.Orden
  FROM dbo.ProductosVariantesValores CV
    JOIN dbo.ProductosOpcionesValores OV ON OV.IDValor = CV.IDValor
  WHERE CV.IDVariante = @IDVariante
  ORDER BY OV.IDValor ASC;
END;
GO

-- Serializes publication and media changes of the same product until commit.
CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ProductosBloquear
  @IDProducto INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT IDProducto FROM dbo.Productos WITH (UPDLOCK, HOLDLOCK) WHERE IDProducto = @IDProducto;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesGuardar
  @IDPublico UNIQUEIDENTIFIER, @ClaveAlmacenamiento NVARCHAR(100),
  @TipoContenido NVARCHAR(50), @TamanoBytes INT, @Ancho INT, @Alto INT,
  @TextoAlternativo NVARCHAR(300) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  INSERT dbo.Imagenes (IDPublico, ClaveAlmacenamiento, TipoContenido, TamanoBytes, Ancho, Alto, TextoAlternativo)
  VALUES (@IDPublico, @ClaveAlmacenamiento, @TipoContenido, @TamanoBytes, @Ancho, @Alto, @TextoAlternativo);
  SELECT * FROM dbo.Imagenes WHERE IDImagen = SCOPE_IDENTITY();
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesObtenerPorClave
  @ClaveAlmacenamiento NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.Imagenes WHERE ClaveAlmacenamiento = @ClaveAlmacenamiento;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesObtenerPorIDPublico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.Imagenes WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesObtenerPorID
  @IDImagen INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.Imagenes WHERE IDImagen = @IDImagen;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesEliminarFisico
  @IDPublico UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  -- References are validated by the use case and protected against races by FKs.
  SELECT * FROM dbo.Imagenes WHERE IDPublico = @IDPublico;
  DELETE dbo.Imagenes WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesActualizar
  @IDPublico UNIQUEIDENTIFIER, @TextoAlternativo NVARCHAR(300)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Imagenes SET TextoAlternativo = @TextoAlternativo WHERE IDPublico = @IDPublico;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_PortadasAsignar
  @TipoEntidad NVARCHAR(10), @IDEntidad INT, @IDImagen INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @TipoEntidad = 'producto'
    UPDATE dbo.Productos SET IDImagenPortada = @IDImagen, FechaActualizacion = SYSUTCDATETIME() WHERE IDProducto = @IDEntidad;
  ELSE IF @TipoEntidad = 'variante'
    UPDATE dbo.ProductosVariantes SET IDImagenPortada = @IDImagen, FechaActualizacion = SYSUTCDATETIME() WHERE IDVariante = @IDEntidad;
  ELSE
    THROW 50006, 'Tipo de entidad de imagen inválido', 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_CarruselAsignar
  @IDVariante INT, @IDImagen INT = NULL, @Orden INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @IDImagen IS NULL
  BEGIN
    DELETE dbo.ProductosVariantesImagenes WHERE IDVariante = @IDVariante;
    RETURN;
  END;
  DELETE FROM dbo.ProductosVariantesImagenes WHERE IDVariante = @IDVariante AND IDImagen = @IDImagen;
  INSERT dbo.ProductosVariantesImagenes (IDVariante, IDImagen, Orden) VALUES (@IDVariante, @IDImagen, @Orden);
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesListarDeVariante
  @IDVariante INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT I.*, VI.Orden FROM dbo.ProductosVariantesImagenes VI
    JOIN dbo.Imagenes I ON I.IDImagen = VI.IDImagen
  WHERE VI.IDVariante = @IDVariante ORDER BY VI.Orden;
END;
GO

CREATE OR ALTER PROCEDURE dbo.SP_Catalogo_ImagenesReferencias
  @IDImagen INT, @SoloPublica BIT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT CAST(CASE WHEN EXISTS (
    SELECT 1 FROM dbo.Productos P WHERE P.IDImagenPortada = @IDImagen
      AND (@SoloPublica = 0 OR (P.Activo = 1 AND P.Eliminado = 0))
  ) OR EXISTS (
    SELECT 1 FROM dbo.ProductosVariantes V JOIN dbo.Productos P ON P.IDProducto = V.IDProducto
    WHERE V.IDImagenPortada = @IDImagen AND (@SoloPublica = 0 OR (P.Activo = 1 AND P.Eliminado = 0 AND V.Activo = 1 AND V.Eliminado = 0))
  ) OR EXISTS (
    SELECT 1 FROM dbo.ProductosVariantesImagenes VI JOIN dbo.ProductosVariantes V ON V.IDVariante = VI.IDVariante
      JOIN dbo.Productos P ON P.IDProducto = V.IDProducto
    WHERE VI.IDImagen = @IDImagen AND (@SoloPublica = 0 OR (P.Activo = 1 AND P.Eliminado = 0 AND V.Activo = 1 AND V.Eliminado = 0))
  ) THEN 1 ELSE 0 END AS BIT) AS TieneReferencias;
END;
GO
