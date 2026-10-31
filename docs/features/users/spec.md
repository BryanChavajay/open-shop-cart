# Usuarios — Especificación

## Propósito

Gestión del ciclo de vida de los usuarios del sistema.

---

## Entidades

### Usuario

| Atributo   | Condición            | Regla                                                                |
| ---------- | -------------------- | -------------------------------------------------------------------- |
| Identidad  | Obligatorio          | Distingue a cada usuario.                                            |
| Nombres    | Obligatorio          | Nombres del usuario.                                                 |
| Apellidos  | Opcional             | Apellidos del usuario.                                               |
| Correo     | Obligatorio          | Único, incluso entre usuarios eliminados.                            |
| Contraseña | Obligatorio al crear | Su contenido original no puede consultarse.                          |
| Rol        | Obligatorio          | Uno de: `CLIENTE`, `OPERADOR` o `ADMINISTRADOR`.                     |
| Activo     | Obligatorio          | Cliente inactivo al registrarse; personal interno activo al crearse. |
| Eliminado  | Obligatorio          | No eliminado al crearse.                                             |

Los datos de entrada obligatorios son nombres, correo y contraseña. La identidad y los estados no los elige el solicitante. El registro público asigna `CLIENTE`; el administrador selecciona el rol al crear personal interno.

Se considera personal interno a los usuarios con rol `OPERADOR` o `ADMINISTRADOR`.

---

## Requerimientos

### Requerimiento: Permisos de gestión

El sistema DEBE reservar la gestión administrativa de usuarios al administrador. Este DEBE poder consultar clientes, iniciar su recuperación de contraseña y reiniciar su confirmación pendiente. NO DEBE modificar sus datos o rol, cambiar directamente su estado ni eliminarlos.

#### Escenario: Gestión sin permisos

- **DADO** un usuario con rol `CLIENTE` u `OPERADOR`
- **CUANDO** intenta gestionar administrativamente usuarios
- **ENTONCES** el sistema rechaza la operación.

#### Escenario: Consulta administrativa de un cliente

- **DADO** un administrador autenticado
- **CUANDO** consulta la información de un cliente
- **ENTONCES** el sistema permite la consulta sin permitir su edición.

---

### Requerimiento: Creación de personal interno

El sistema DEBE permitir al administrador crear personal interno con todos los datos obligatorios y un rol `OPERADOR` o `ADMINISTRADOR`.

#### Escenario: Creación exitosa

- **DADO** un administrador autenticado
- **CUANDO** proporciona todos los datos obligatorios y un rol de personal interno
- **ENTONCES** el sistema crea al usuario activo y no eliminado, con el rol seleccionado.

---

### Requerimiento: Registro de clientes

El sistema DEBE permitir el registro con todos los datos obligatorios y asignar únicamente el rol `CLIENTE`. El cliente DEBE crearse inactivo y seguir un proceso de confirmación mediante su correo para activar su cuenta.

#### Escenario: Registro de cliente

- **DADO** una persona que desea registrarse
- **CUANDO** proporciona nombres, correo y contraseña válidos
- **ENTONCES** el sistema crea al cliente inactivo y no eliminado e inicia la confirmación en su correo registrado.

#### Escenario: Elección de otro rol en el registro público

- **DADO** una solicitud de registro público
- **CUANDO** se intenta obtener un rol distinto de `CLIENTE`
- **ENTONCES** el sistema rechaza la asignación de ese rol.

---

### Requerimiento: Confirmación de la cuenta del cliente

El sistema DEBE activar la cuenta cuando el titular complete la confirmación mediante su correo registrado. La confirmación DEBE tener vigencia limitada y ser de un solo uso.

#### Escenario: Confirmación válida

- **DADO** un cliente pendiente de activación y una confirmación vigente y sin utilizar
- **CUANDO** el titular completa la confirmación
- **ENTONCES** el sistema activa la cuenta e invalida la confirmación utilizada.

#### Escenario: Confirmación no válida

- **DADO** una confirmación inválida, vencida o ya utilizada
- **CUANDO** se intenta completar la confirmación
- **ENTONCES** el sistema rechaza la operación sin cambiar el estado de la cuenta.

---

### Requerimiento: Nueva confirmación iniciada por el administrador

El sistema DEBE permitir al administrador iniciar una nueva confirmación para un cliente pendiente de activación. DEBE enviarla al correo registrado e invalidar la anterior, sin activar directamente la cuenta.

#### Escenario: Nueva confirmación

- **DADO** un administrador autenticado y un cliente que no completó su activación
- **CUANDO** el administrador inicia una nueva confirmación, aunque la anterior haya vencido
- **ENTONCES** el sistema envía la nueva confirmación, invalida la anterior y mantiene la cuenta inactiva.

---

### Requerimiento: Datos obligatorios y correo único

El sistema DEBE exigir los datos obligatorios al crear usuarios y conservarlos al editar su información. NO DEBE permitir un correo asignado a otro usuario, aunque esté eliminado.

#### Escenario: Datos obligatorios faltantes

- **DADO** una solicitud de creación o edición
- **CUANDO** falta un dato obligatorio al crear o se intenta dejarlo vacío al editar
- **ENTONCES** el sistema rechaza la operación e informa qué dato falta.

#### Escenario: Correo duplicado

- **DADO** un correo asignado a otro usuario, incluso eliminado
- **CUANDO** se intenta utilizarlo al crear o editar un usuario
- **ENTONCES** el sistema rechaza la operación e informa que el correo ya está registrado.

---

### Requerimiento: Protección de contraseña

El sistema DEBE proteger las contraseñas e impedir consultar su contenido original. El administrador NO DEBE establecer una nueva contraseña para un usuario existente; solo puede iniciar su recuperación.

#### Escenario: Consulta de contraseña

- **DADO** un usuario registrado
- **CUANDO** se consulta su información
- **ENTONCES** el sistema no revela su contraseña.

#### Escenario: Cambio directo de contraseña ajena

- **DADO** un administrador autenticado
- **CUANDO** intenta establecer una nueva contraseña para otro usuario existente
- **ENTONCES** el sistema rechaza la operación.

---

### Requerimiento: Edición propia del cliente

El sistema DEBE permitir al cliente editar únicamente sus nombres, apellidos y correo. NO DEBE permitirle modificar directamente su rol, estado o condición de eliminación.

#### Escenario: Edición de información propia

- **DADO** un cliente autenticado
- **CUANDO** modifica sus campos editables con datos válidos
- **ENTONCES** el sistema actualiza únicamente esos campos.

#### Escenario: Edición de campos no permitidos

- **DADO** un cliente autenticado
- **CUANDO** intenta modificar su rol, estado o condición de eliminación
- **ENTONCES** el sistema rechaza la operación.

#### Escenario: Edición de otro usuario

- **DADO** un cliente autenticado
- **CUANDO** intenta modificar información de otro usuario
- **ENTONCES** el sistema rechaza la operación.

---

### Requerimiento: Edición administrativa

El sistema DEBE permitir al administrador editar nombres, apellidos, correo y rol del personal interno. NO DEBE permitir estas modificaciones sobre clientes.

#### Escenario: Edición de personal interno

- **DADO** un administrador autenticado y un usuario del personal interno
- **CUANDO** modifica sus datos editables con valores válidos
- **ENTONCES** el sistema actualiza la información solicitada.

#### Escenario: Cambio de rol del personal interno

- **DADO** un administrador autenticado y un operador
- **CUANDO** le asigna el rol `ADMINISTRADOR`
- **ENTONCES** el sistema actualiza su único rol.

#### Escenario: Edición administrativa de un cliente

- **DADO** un administrador autenticado
- **CUANDO** intenta modificar los datos o el rol de un cliente
- **ENTONCES** el sistema rechaza la operación.

---

### Requerimiento: Listado de usuarios

El sistema DEBE permitir al administrador listar usuarios con paginación y filtro por correo. El listado excluye usuarios eliminados.

#### Escenario: Solicitud de listado

- **DADO** un administrador autenticado
- **CUANDO** solicita el listado
- **ENTONCES** el sistema muestra una página de usuarios no eliminados.

#### Escenario: Filtro por correo

- **DADO** un administrador autenticado
- **CUANDO** filtra el listado por correo
- **ENTONCES** el sistema muestra los usuarios que cumplen el filtro, con paginación.

---

### Requerimiento: Cambio de estado

El sistema DEBE permitir al administrador activar o desactivar personal interno, excepto a sí mismo. NO DEBE permitir cambios directos del estado de clientes; su activación requiere completar la confirmación. La desactivación conserva al usuario. Una cuenta inactiva no puede realizar acciones autenticadas.

#### Escenario: Cambio exitoso

- **DADO** un administrador autenticado
- **CUANDO** activa o desactiva a otro usuario del personal interno
- **ENTONCES** el sistema cambia su estado sin eliminarlo.

#### Escenario: Usuario inexistente

- **DADO** un administrador autenticado
- **CUANDO** intenta cambiar el estado de un usuario inexistente
- **ENTONCES** el sistema rechaza la operación e informa que el usuario no existe.

#### Escenario: Cambio de estado propio

- **DADO** un usuario autenticado
- **CUANDO** intenta cambiar directamente su propio estado
- **ENTONCES** el sistema rechaza la operación.

#### Escenario: Cambio de estado de un cliente

- **DADO** un administrador autenticado
- **CUANDO** intenta cambiar directamente el estado de un cliente
- **ENTONCES** el sistema rechaza la operación.

---

### Requerimiento: Eliminación de usuario

El sistema DEBE permitir al administrador eliminar personal interno, excepto a sí mismo. NO DEBE permitir eliminar clientes. La eliminación DEBE ser lógica y conservar el historial y el correo reservado.

#### Escenario: Eliminación exitosa

- **DADO** un administrador autenticado
- **CUANDO** elimina a otro usuario del personal interno
- **ENTONCES** el sistema lo marca como eliminado y conserva su historial.

#### Escenario: Usuario inexistente

- **DADO** un administrador autenticado
- **CUANDO** intenta eliminar un usuario inexistente
- **ENTONCES** el sistema rechaza la operación e informa que el usuario no existe.

#### Escenario: Eliminación propia

- **DADO** un usuario autenticado
- **CUANDO** intenta eliminarse a sí mismo
- **ENTONCES** el sistema rechaza la operación.

#### Escenario: Eliminación de un cliente

- **DADO** un administrador autenticado
- **CUANDO** intenta eliminar a un cliente
- **ENTONCES** el sistema rechaza la operación.

---

### Requerimiento: Recuperación de contraseña por el titular

El sistema DEBE permitir solicitar la recuperación mediante el correo registrado, sin revelar si existe. La solicitud NO DEBE cambiar la contraseña.

#### Escenario: Solicitud de recuperación

- **DADO** un usuario registrado
- **CUANDO** solicita recuperar su contraseña con su correo
- **ENTONCES** el sistema dirige la recuperación a ese correo y mantiene la contraseña actual.

#### Escenario: Correo no registrado

- **DADO** una solicitud con un correo no registrado
- **CUANDO** el sistema responde
- **ENTONCES** muestra la misma confirmación que para un correo registrado.

---

### Requerimiento: Recuperación de contraseña iniciada por el administrador

El sistema DEBE permitir al administrador iniciar la recuperación de clientes y personal interno. La recuperación DEBE dirigirse al correo registrado del titular, quien establece la nueva contraseña.

#### Escenario: Inicio administrativo de recuperación

- **DADO** un administrador autenticado y un cliente o miembro del personal interno
- **CUANDO** inicia su recuperación de contraseña
- **ENTONCES** el sistema dirige la recuperación al correo del titular sin modificar la contraseña.

---

### Requerimiento: Finalización de la recuperación

El sistema DEBE exigir una autorización temporal y de un solo uso, obtenida mediante acceso al correo registrado. Solo el titular DEBE establecer la nueva contraseña. Al completar la recuperación, la contraseña anterior DEBE dejar de ser válida. Recuperar la contraseña NO DEBE activar una cuenta pendiente de confirmación.

#### Escenario: Recuperación válida

- **DADO** un titular con una autorización de recuperación vigente y sin utilizar
- **CUANDO** establece su nueva contraseña
- **ENTONCES** el sistema sustituye la contraseña anterior e invalida la autorización utilizada.

#### Escenario: Recuperación no válida

- **DADO** una autorización inválida, vencida o ya utilizada
- **CUANDO** se intenta establecer una nueva contraseña
- **ENTONCES** el sistema rechaza la operación y conserva la contraseña actual.

#### Escenario: Recuperación con activación pendiente

- **DADO** un cliente pendiente de confirmación y una autorización de recuperación válida
- **CUANDO** completa la recuperación de contraseña
- **ENTONCES** el sistema cambia la contraseña y mantiene la cuenta inactiva.

---
