# Inventario — Especificación

## Propósito

Control de existencias por variante y trazabilidad de sus movimientos.

## Requerimientos

### Requerimiento: Kardex por variante

El sistema DEBE registrar en el kardex cada entrada por compra, salida por venta, ajuste y devolución de existencia por variante, incluyendo usuario, fecha, motivo y cantidad.

#### Escenario: Registro de un movimiento

- **DADO** una variante cuya existencia cambia por una entrada, venta, ajuste o devolución
- **CUANDO** se realiza el movimiento
- **ENTONCES** el sistema lo registra en el kardex de la variante con usuario, fecha, motivo y cantidad.

---

### Requerimiento: Existencia disponible

El sistema DEBE calcular la existencia disponible de cada variante como la existencia física menos las unidades reservadas.

#### Escenario: Unidades reservadas

- **DADO** una variante con existencia física y unidades reservadas
- **CUANDO** se consulta su existencia disponible
- **ENTONCES** el sistema informa la existencia física menos las unidades reservadas.

---

### Requerimiento: Correspondencia entre existencia y kardex

La existencia actual de una variante DEBE coincidir con la suma de sus movimientos de entrada y salida registrados en el kardex.

#### Escenario: Verificación de existencia

- **DADO** los movimientos registrados de una variante
- **CUANDO** se determina su existencia actual
- **ENTONCES** la existencia coincide con el saldo resultante de esos movimientos.

---

### Requerimiento: Ajustes manuales

El sistema DEBE exigir un motivo para cada ajuste manual y NO DEBE permitir que el ajuste deje la existencia en negativo.

#### Escenario: Ajuste sin motivo

- **DADO** una solicitud de ajuste manual
- **CUANDO** no se proporciona un motivo
- **ENTONCES** el sistema rechaza el ajuste.

#### Escenario: Ajuste con resultado negativo

- **DADO** una variante con una existencia determinada
- **CUANDO** se solicita un ajuste que dejaría su existencia en negativo
- **ENTONCES** el sistema rechaza el ajuste.

#### Escenario: Ajuste permitido

- **DADO** un operador o administrador autenticado
- **CUANDO** solicita un ajuste con motivo que no deja la existencia en negativo
- **ENTONCES** el sistema actualiza la existencia y registra el movimiento en el kardex.

---

### Requerimiento: Consistencia de movimientos simultáneos

El sistema DEBE mantener la consistencia de las existencias y del kardex cuando se realizan movimientos simultáneos, sin permitir sobreventa.

#### Escenario: Movimientos simultáneos

- **DADO** varios movimientos simultáneos sobre una misma variante
- **CUANDO** se realizan los movimientos permitidos
- **ENTONCES** la existencia resultante coincide con los movimientos registrados y no se venden unidades sin disponibilidad.

---