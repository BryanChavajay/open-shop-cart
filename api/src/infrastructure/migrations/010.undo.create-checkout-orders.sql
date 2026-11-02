-- Undo of the checkout/orders module: drops the procedures and then the
-- tables in reverse order of creation, so the schema returns to its exact
-- prior state. WARNING: module history is not recoverable — every order,
-- frozen line, payment record, state-transition entry and idempotency
-- receipt is destroyed with no way to rebuild them.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ActualizarVerificacionPago;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ObtenerBloquearParaVerificarPago;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_DetalleListar;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ObtenerPorIDPublico;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_HistorialAgregar;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_PagoRegistrar;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_DetalleAgregar;
  DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_Crear;
  DROP PROCEDURE IF EXISTS dbo.SP_Checkout_OperacionGuardar;
  DROP PROCEDURE IF EXISTS dbo.SP_Checkout_OperacionObtener;
  DROP PROCEDURE IF EXISTS dbo.SP_Checkout_VariantesObtenerParaCotizar;

  DROP TABLE IF EXISTS dbo.CheckoutOperaciones;
  DROP TABLE IF EXISTS dbo.PedidosHistorialEstados;
  DROP TABLE IF EXISTS dbo.PedidosPagos;
  DROP TABLE IF EXISTS dbo.PedidosDetalle;
  DROP TABLE IF EXISTS dbo.Pedidos;

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
