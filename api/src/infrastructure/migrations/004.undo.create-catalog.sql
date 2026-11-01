-- Undo of the catalog module: drops procedures and tables in reverse order
-- of creation. Refuses nothing by default (catalog data is disposable and its
-- logical deletions are soft deletes).
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesActualizar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesReordenar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesEliminarFisico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesObtenerPorID;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesObtenerPorClave;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CombosListar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CombosAgregar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CombosVaciarDeVariante;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_OpcionesEliminarDeProducto;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_OpcionesListarDeProducto;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ValoresGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_OpcionesGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_VariantesEliminar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_VariantesListarDeProducto;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_VariantesObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_VariantesGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosTieneVentas;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosEliminar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosListarPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosListarAdmin;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosObtenerPorID;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_MarcasEliminar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_MarcasTieneProductos;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_MarcasContarProductos;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_MarcasObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_MarcasListar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_MarcasGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CategoriasEliminar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CategoriasTieneProductos;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CategoriasContarProductos;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CategoriasObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CategoriasListar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CategoriasGuardar;

  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_PortadasAsignar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ProductosBloquear;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_CarruselAsignar;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesListarDeVariante;
  DROP PROCEDURE IF EXISTS dbo.SP_Catalogo_ImagenesReferencias;
  DROP TABLE IF EXISTS dbo.ProductosVariantesImagenes;
  DROP TABLE IF EXISTS dbo.ProductosVariantesValores;
  DROP TABLE IF EXISTS dbo.ProductosOpcionesValores;
  DROP TABLE IF EXISTS dbo.ProductosOpciones;
  DROP TABLE IF EXISTS dbo.ProductosVariantes;
  DROP TABLE IF EXISTS dbo.Productos;
  DROP TABLE IF EXISTS dbo.Imagenes;
  DROP TABLE IF EXISTS dbo.Marcas;
  DROP TABLE IF EXISTS dbo.Categorias;
  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
