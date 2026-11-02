-- Undo of the inventory/catalog integration: restores the original public
-- listing procedure (plain copy of the definition created in 004) and drops
-- the two procedures 006 added. No tables or data were touched by 006, so the
-- schema returns to its exact prior state.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_CantidadReservadaDeVariantes;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_VariantesConSaldoOReservasBloquear;

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
GO

-- Exact original definition of SP_Catalogo_ProductosListarPublico (004).
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
