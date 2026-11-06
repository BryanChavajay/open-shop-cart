-- Revierte los objetos agregados por la migración 013. Los procedures
-- creados en el archivo do se eliminan antes de este bloque.

DROP PROCEDURE IF EXISTS dbo.SP_Inventario_ReservasObtenerBloquearEstadoPorID;
DROP PROCEDURE IF EXISTS dbo.SP_PedidosDetalle_RegistrarDevolucionPorID;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ObtenerPorID;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_HistorialListarPorID;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ListarDetallePorID;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_DetalleListarPorID;
DROP PROCEDURE IF EXISTS dbo.SP_Inventario_MovimientoVentaObtenerPorPedidoYVariante;

DROP INDEX IF EXISTS IX_InventarioMovimientos_MovimientoVentaRelacionado
  ON dbo.InventarioMovimientos;
DROP INDEX IF EXISTS IX_InventarioMovimientos_IDPedido_IDVariante_Tipo
  ON dbo.InventarioMovimientos;

ALTER TABLE dbo.InventarioMovimientos
  DROP CONSTRAINT FK_InventarioMovimientos_MovimientoVentaRelacionado,
                  FK_InventarioMovimientos_Pedidos;

ALTER TABLE dbo.InventarioMovimientos
  DROP COLUMN IDMovimientoVentaRelacionado, IDPedido;
