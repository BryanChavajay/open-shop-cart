# Bitácora — Especificación

## Propósito

Trazabilidad de los cambios de negocio y conservación de su historial.

## Requerimientos

### Requerimiento: Registro de cambios

El sistema DEBE registrar toda creación, modificación o desactivación en productos, precios, existencias, cupones y estados de pedido.

#### Escenario: Operación sujeta a bitácora

- **DADO** una creación, modificación o desactivación de un producto, precio, existencia, cupón o estado de pedido
- **CUANDO** se realiza la operación
- **ENTONCES** el sistema registra la acción en la bitácora.

---

### Requerimiento: Información de cada registro

Cada registro de bitácora DEBE guardar usuario, fecha y hora, entidad, acción, valor anterior y valor nuevo.

#### Escenario: Consulta del detalle de un cambio

- **DADO** una operación registrada en la bitácora
- **CUANDO** se consulta su detalle
- **ENTONCES** se identifica al usuario, la fecha y hora, la entidad, la acción y los valores anterior y nuevo.

---

### Requerimiento: Consulta administrativa por módulo

El sistema DEBE permitir a los administradores consultar la bitácora y filtrarla por módulo.

#### Escenario: Consulta filtrada

- **DADO** un administrador autenticado
- **CUANDO** consulta la bitácora seleccionando un módulo
- **ENTONCES** el sistema muestra los registros correspondientes a ese módulo.

---

### Requerimiento: Inmutabilidad de la bitácora

El sistema NO DEBE permitir modificar ni eliminar registros de la bitácora.

#### Escenario: Intento de modificación o eliminación

- **DADO** un registro existente en la bitácora
- **CUANDO** se intenta modificarlo o eliminarlo
- **ENTONCES** el sistema rechaza la operación y conserva el registro original.

---
