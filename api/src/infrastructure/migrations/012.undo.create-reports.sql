-- Undo del módulo de reportes (RF-08): elimina el índice de apoyo, la vista
-- del dashboard y los procedures de consulta de ventas, todos creados por la
-- migración 012. Las tablas (Pedidos, PedidosDetalle, PedidosPagos,
-- PedidosHistorialEstados) pertenecen a la migración 010 y NO se tocan aquí;
-- el catálogo (ProductosVariantes, Productos, Categorias) se creó en la
-- migración 004 y tampoco se toca.
DROP PROCEDURE IF EXISTS dbo.SP_Reportes_ProductosMasVendidos;
DROP PROCEDURE IF EXISTS dbo.SP_Reportes_VentasPorCategoria;
DROP PROCEDURE IF EXISTS dbo.SP_Reportes_VentasPorPeriodo;
DROP VIEW IF EXISTS dbo.VW_Dashboard_VentasPorCategoria;
DROP INDEX IF EXISTS IX_Pedidos_EstadoPedido_FechaCreacion ON dbo.Pedidos;
