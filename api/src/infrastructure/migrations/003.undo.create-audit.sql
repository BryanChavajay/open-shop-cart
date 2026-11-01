-- Undo of audit module: refuses to run if the audit log contains entries.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  -- Preservation guard: never delete existing audit entries.
  IF OBJECT_ID(N'dbo.Bitacora', N'U') IS NOT NULL
     AND EXISTS (SELECT 1 FROM dbo.Bitacora)
    THROW 51000, 'Audit log contains entries; the undo operation does not delete them', 1;

  DROP PROCEDURE IF EXISTS dbo.SP_Bitacora_ObtenerDetalle;
  DROP PROCEDURE IF EXISTS dbo.SP_Bitacora_Listar;
  DROP PROCEDURE IF EXISTS dbo.SP_Bitacora_Agregar;
  DROP TABLE IF EXISTS dbo.Bitacora;
  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
