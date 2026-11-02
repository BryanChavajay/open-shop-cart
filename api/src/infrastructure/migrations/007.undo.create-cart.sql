-- Undo of the cart module: drops the procedures and then the cart table, in
-- reverse order of creation, so the schema returns to its exact prior state.
-- WARNING: module history is not recoverable — every cart row (guest and
-- user-bound, active and closed) is destroyed with no way to rebuild it.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Carritos_AbandonadosListar;
  DROP PROCEDURE IF EXISTS dbo.SP_Carritos_EstadoActualizar;
  DROP PROCEDURE IF EXISTS dbo.SP_Carritos_ActividadRegistrar;
  DROP PROCEDURE IF EXISTS dbo.SP_Carritos_ObtenerActivoPorHashToken;
  DROP PROCEDURE IF EXISTS dbo.SP_Carritos_Crear;

  DROP TABLE IF EXISTS dbo.Carritos;

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
