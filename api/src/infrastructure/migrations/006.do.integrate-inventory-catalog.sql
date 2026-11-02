-- Integration phase: the catalog's public availability now subtracts the
-- units held by ACTIVE, unexpired reservations, and the catalog deletion
-- guard reads stock with a locking variant of the inventory probe.
--
-- Pure object swap: no tables or data are touched.
--
-- Changes:
--   * SP_Catalogo_ProductosListarPublico  availability filter now accounts for
--     reserved stock (ExistenciaFisica - reserved > 0). Same signature, same
--     columns, same shape as in 004.
--   * SP_Inventario_CantidadReservadaDeVariantes (NEW) lock-free reserved-sum
--     per variant for the public read model.
--   * SP_Inventario_VariantesConSaldoOReservasBloquear (NEW) locking variant
--     of SP_Inventario_VariantesConSaldoOReservas used by the deletion guard
--     so deletes serialize against concurrent stock mutations.
--
-- THROW error codes (distinct per procedure):
--   50112  SP_Inventario_VariantesConSaldoOReservasBloquear  lista de variantes vacía

-- Replacement of the procedure created in 004: the EXISTS filter no longer
-- trusts bare ExistenciaFisica > 0; availability over the wire is
-- ExistenciaFisica minus the reserved units of ACTIVE reservations that are
-- still unexpired. Filters, parameters, columns and ordering of the original
-- are otherwise untouched.
-- Performance note: the reserved-sum is an inline correlated subquery allowed
-- per variant row; it only fires when @SoloDisponible = 1 and
-- IX_InventarioReservasDetalle_IDVariante serves it. At this catalog's scale
-- (thousands of variants) this is negligible; revisit with a lateral apply
-- only if the reservations per variant grow by orders of magnitude.
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
        AND (
          @SoloDisponible = 0
          OR V.ExistenciaFisica - ISNULL((
            SELECT SUM(rd.Cantidad)
            FROM dbo.InventarioReservasDetalle rd
              JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
            WHERE rd.IDVariante = V.IDVariante
              AND r.Estado = 'ACTIVE'
              AND r.FechaVencimiento > SYSUTCDATETIME()
          ), 0) > 0
        )
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
          AND (
            @SoloDisponible = 0
            OR V.ExistenciaFisica - ISNULL((
              SELECT SUM(rd.Cantidad)
              FROM dbo.InventarioReservasDetalle rd
                JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
              WHERE rd.IDVariante = V.IDVariante
                AND r.Estado = 'ACTIVE'
                AND r.FechaVencimiento > SYSUTCDATETIME()
            ), 0) > 0
          )
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

-- Reserved units per variant (by internal id) held by ACTIVE, unexpired
-- reservations at @FechaAsOf. Plain read: no locking hints, the public read
-- model runs it outside transactions. Only variants with at least one such
-- line return a row; the repository maps missing ids to zero.
-- Performance note: one aggregated scan over
-- IX_InventarioReservasDetalle_IDVariante for the whole batch of ids; the
-- public detail page calls it once per request, not per variant.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_CantidadReservadaDeVariantes
  @IDVariantesInternos NVARCHAR(4000), @FechaAsOf DATETIME2(3)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @Ids TABLE (IDVariante INT PRIMARY KEY);

  INSERT INTO @Ids (IDVariante)
    SELECT DISTINCT CAST(value AS INT)
    FROM STRING_SPLIT(@IDVariantesInternos, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

  SELECT rd.IDVariante, SUM(rd.Cantidad) AS ExistenciaReservada
  FROM dbo.InventarioReservasDetalle rd
    JOIN dbo.InventarioReservas r ON r.IDReserva = rd.IDReserva
  WHERE rd.IDVariante IN (SELECT IDVariante FROM @Ids)
    AND r.Estado = 'ACTIVE'
    AND r.FechaVencimiento > @FechaAsOf
  GROUP BY rd.IDVariante;
END;
GO

-- Locking variant of SP_Inventario_VariantesConSaldoOReservas (which stays a
-- plain read): locks the given variant rows (UPDLOCK, HOLDLOCK) before
-- evaluating balances, so a catalog deletion of the variants and a concurrent
-- inventory mutation of the same variants serialize until commit. The rows are
-- returned in ascending IDPublico, the same shared order used by
-- SP_Inventario_SaldosBloquearDeVariantes, so every caller of this lock graph
-- takes the locks in one common order.
CREATE OR ALTER PROCEDURE dbo.SP_Inventario_VariantesConSaldoOReservasBloquear
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
    THROW 50112, 'La lista de variantes está vacía', 1;

  SELECT v.IDVariante
  FROM dbo.ProductosVariantes v WITH (UPDLOCK, HOLDLOCK)
  WHERE v.IDVariante IN (SELECT IDVariante FROM @Ids)
  ORDER BY v.IDPublico ASC;

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
