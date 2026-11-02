-- Undo of the addresses module: drops the procedures and then the tables in
-- reverse order of creation, so the schema returns to its exact prior state.
-- WARNING: module history is not recoverable — every registered address and
-- the seeded geographic catalog are destroyed with no way to rebuild them.
-- Orders pointing at these tables (created by a later migration) would break
-- FK references; only run this when no checkout data exists.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_Eliminar;
  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_Actualizar;
  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_ObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_ListarPorUsuario;
  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_Crear;
  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_MunicipiosListarPorDepartamento;
  DROP PROCEDURE IF EXISTS dbo.SP_Direcciones_DepartamentosListar;

  DROP TABLE IF EXISTS dbo.DireccionesClientes;
  DROP TABLE IF EXISTS dbo.Municipios;
  DROP TABLE IF EXISTS dbo.Departamentos;

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
