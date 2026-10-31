# Autenticación y autorización — Especificación

## Propósito

Gestión del ciclo de vida de autenticación y autorización.

## Requerimientos

### Requerimiento: Autenticación

El sistema DEBE permitir autenticarse a un usuario por correo y contraseña.

#### Escenario: Correo o contraseña incorrecta

- **DADO** un correo y contraseña
- **CUANDO** el correo no exista **O** la contraseña sea incorrecta
- **ENTONCES** el sistema rechazar la operación sin revelar al usuario cual de las dos provocó el error.

---

### Requerimiento: Roles

El sistema DEBE manejar unicamente 3 roles: `CLIENTE`, `OPERADOR` y `ADMINISTRADOR`

---

### Requerimiento: Autorización

#### Escenario: Validación de operción

- **DADO** un usuario autenticado
- **CUANDO** no tenga el rol suficiente para una acción
- **ENTONCES** el sistema rechazar la operación he informar al usuario

---

### Requerimiento: Permisos por rol

El sistema DEBE permitir al `CLIENTE` comprar y consultar su propia información; al `OPERADOR`, gestionar pedidos e inventario; y al `ADMINISTRADOR`, gestionar además catálogo, precios, cupones, usuarios y reportes.

#### Escenario: Gestión operativa

- **DADO** un usuario con rol `OPERADOR`
- **CUANDO** gestiona pedidos o inventario
- **ENTONCES** el sistema permite la operación conforme a las reglas del módulo correspondiente.

#### Escenario: Gestión administrativa

- **DADO** un usuario con rol `ADMINISTRADOR`
- **CUANDO** gestiona catálogo, precios, cupones, usuarios, reportes, pedidos o inventario
- **ENTONCES** el sistema permite la operación conforme a las reglas del módulo correspondiente.

---

### Requerimiento: Acceso a información propia

El sistema DEBE permitir que el cliente consulte y gestione únicamente sus propios carritos, pedidos y direcciones, conforme a las operaciones permitidas en cada módulo.

#### Escenario: Acceso a información de otro cliente

- **DADO** un cliente autenticado
- **CUANDO** intenta consultar o modificar un carrito, pedido o dirección perteneciente a otro cliente, incluso indicando su identificador
- **ENTONCES** el sistema rechaza la operación sin exponer ni modificar la información ajena.

---

### Requerimiento: Autenticación vencida

El sistema DEBE rechazar las operaciones que requieren autenticación cuando esta haya vencido.

#### Escenario: Acceso con autenticación vencida

- **DADO** un usuario cuya autenticación ha vencido
- **CUANDO** solicita una operación que requiere autenticación
- **ENTONCES** el sistema rechaza la operación por falta de autenticación vigente.
