-- Undo of the coupons module: drops the procedures and then the tables in
-- reverse order of creation, so the schema returns to its exact prior state.
-- WARNING: module history is not recoverable — every coupon definition and
-- every redemption record is destroyed with no way to rebuild them.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_RegistrarUso;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_ConteoUsosCliente;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_ListarAdmin;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_ObtenerParaRedimir;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_ObtenerPorCodigo;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_ObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_Eliminar;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_EstadoActualizar;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_Actualizar;
  DROP PROCEDURE IF EXISTS dbo.SP_Cupones_Crear;

  DROP TABLE IF EXISTS dbo.CuponesUsos;
  DROP TABLE IF EXISTS dbo.Cupones;

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
