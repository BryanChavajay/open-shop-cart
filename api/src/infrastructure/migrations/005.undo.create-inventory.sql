-- Undo of the inventory module: drops the procedures and the tables in
-- reverse order of creation, then removes the balance constraint added to
-- dbo.ProductosVariantes so the schema returns to its exact prior state.
-- WARNING: module history is not recoverable — every kardex movement,
-- reservation, history entry and idempotency receipt stored by this module
-- is destroyed with no way to rebuild it.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_OperacionesObtener;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_OperacionesGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_MovimientosListarDeVariante;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_SaldosListar;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasListarVencidas;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasObtenerPorReferencia;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasObtenerBloquearEstado;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasObtenerBloquearActiva;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasEstadoActualizar;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_HistoriaReservaAgregar;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasCrear;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_VariantesConSaldoOReservas;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasSumarActivasDeVariantes;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_SaldosBloquearDeVariantes;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_SaldoObtenerPorVariante;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_MovimientosSumarReintegrados;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_MovimientoObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_MovimientoAgregar;
  DROP PROCEDURE IF EXISTS dbo.SP_Inventario_VarianteActualizarExistencia;

  DROP TABLE IF EXISTS dbo.InventarioOperaciones;
  DROP TABLE IF EXISTS dbo.InventarioReservasHistorial;
  DROP TABLE IF EXISTS dbo.InventarioReservasDetalle;
  DROP TABLE IF EXISTS dbo.InventarioReservas;
  DROP TABLE IF EXISTS dbo.InventarioMovimientos;

  ALTER TABLE dbo.ProductosVariantes
    DROP CONSTRAINT CK_ProductosVariantes_ExistenciaFisicaNoNegativa;

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
