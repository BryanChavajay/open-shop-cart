-- Undo del módulo de gestión de pedidos: elimina los procedures y la vista
-- de resumen. Las tablas (Pedidos, PedidosDetalle, PedidosPagos,
-- PedidosHistorialEstados) pertenecen a la migración 010 y NO se tocan
-- aquí: el undo de 010 es quien las elimina.
DROP PROCEDURE IF EXISTS dbo.SP_PedidosDetalle_RegistrarDevolucion;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ActualizarEstado;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_HistorialListarPorIDPublico;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ListarDetallePorIDPublico;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ObtenerDetallePorIDPublico;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ListarAdmin;
DROP PROCEDURE IF EXISTS dbo.SP_Pedidos_ListarPorCliente;
DROP VIEW IF EXISTS dbo.VW_Pedidos_Resumen;
