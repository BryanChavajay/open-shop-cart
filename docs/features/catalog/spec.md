# Catálogo de productos — Especificación

## Propósito

Gestión de categorías, productos, variantes y precios publicados en la tienda.

## Requerimientos

### Requerimiento: Administración de categorías

El sistema DEBE permitir al administrador crear, consultar, modificar y eliminar categorías.

#### Escenario: Gestión de categorías

- **DADO** un administrador autenticado
- **CUANDO** solicita crear, consultar, modificar o eliminar una categoría
- **ENTONCES** el sistema realiza la operación solicitada.

---

### Requerimiento: Administración de productos y variantes

El sistema DEBE permitir al administrador crear, consultar, modificar y eliminar productos con variantes, respetando la conservación de productos con ventas asociadas. Un producto DEBE contar con nombre, descripción, categoría e imágenes. Cada variante DEBE tener su propio SKU único, atributos, precio y existencia.

#### Escenario: Gestión de un producto con variantes

- **DADO** un administrador autenticado
- **CUANDO** crea o modifica un producto con sus variantes
- **ENTONCES** el sistema mantiene los datos del producto y el SKU, atributos, precio y existencia propios de cada variante.

#### Escenario: SKU duplicado

- **DADO** una variante con un SKU ya registrado
- **CUANDO** se intenta asignar ese SKU a otra variante
- **ENTONCES** el sistema rechaza la operación porque el SKU debe ser único.

---

### Requerimiento: Consulta del catálogo

El sistema DEBE permitir buscar productos por texto, filtrar por categoría, rango de precio y disponibilidad, y consultar los resultados con ordenamiento y paginación.

#### Escenario: Búsqueda y filtrado

- **DADO** el catálogo de productos
- **CUANDO** se solicita una búsqueda con filtros, ordenamiento y página
- **ENTONCES** el sistema muestra la página solicitada con los productos que cumplen los criterios, en el orden solicitado.

---

### Requerimiento: Conservación de productos con ventas

El sistema NO DEBE borrar productos con ventas asociadas. En su lugar, DEBE desactivarlos y dejar de mostrarlos en la tienda.

#### Escenario: Eliminación de un producto vendido

- **DADO** un producto con ventas asociadas
- **CUANDO** el administrador solicita eliminarlo
- **ENTONCES** el sistema conserva el producto, lo desactiva y deja de mostrarlo en la tienda.

---

### Requerimiento: Moneda e impuesto de los precios publicados

El sistema DEBE expresar los precios en quetzales. Los precios publicados DEBEN incluir el IVA del 12 %.

#### Escenario: Publicación de un precio

- **DADO** una variante ofrecida en la tienda
- **CUANDO** se publica su precio
- **ENTONCES** el precio se expresa en quetzales e incluye el IVA del 12 %.

---

### Requerimiento: Conservación de importes de pedidos anteriores

El sistema NO DEBE alterar los importes de pedidos ya realizados cuando cambie un precio del catálogo.

#### Escenario: Cambio de precio después de una compra

- **DADO** un pedido realizado con una variante a un precio determinado
- **CUANDO** el administrador cambia el precio de esa variante
- **ENTONCES** el pedido conserva sus precios e importes originales.

---

### Requerimiento: Portadas e imágenes independientes

Las imágenes DEBEN ser entidades independientes y reutilizables. El producto DEBE tener una referencia a su portada y NO DEBE tener un carrusel. Cada variante DEBE tener su propia referencia de portada y PUEDE tener un carrusel ordenado de imágenes.

- La imagen conserva su `publicId` y los metadatos del archivo, sin propietario ni orden de presentación.
- El orden pertenece a la asociación entre variante e imagen.
- Una misma imagen PUEDE reutilizarse en varias portadas y carruseles sin duplicar el archivo.
- El producto se crea inactivo con al menos una variante. Las portadas pueden asignarse posteriormente.
- Para activar un producto se DEBE exigir su portada, al menos una variante activa y una portada para cada variante activa.
- Al añadir o activar una variante de un producto activo se DEBE exigir su portada.
- El carrusel es opcional. La respuesta de la variante DEBE incluir la portada primero y luego las imágenes adicionales, sin duplicar la portada.
- Desvincular una imagen NO DEBE eliminar el archivo. La eliminación de una imagen DEBE rechazarse mientras exista cualquier referencia, incluso de entidades eliminadas lógicamente.
- Una imagen solo es accesible públicamente si está vinculada a un producto visible o a una variante activa de un producto visible. El administrador puede consultar imágenes todavía no vinculadas.

#### Escenario: Publicación incompleta

- **DADO** un producto inactivo con una variante activa sin portada
- **CUANDO** el administrador intenta activar el producto
- **ENTONCES** se rechaza la publicación hasta asignar las portadas requeridas.

#### Escenario: Portada incluida en el carrusel

- **DADO** una variante cuya portada también aparece entre sus imágenes asociadas
- **CUANDO** se consulta la variante
- **ENTONCES** la portada aparece una sola vez, al inicio de `images`.

---

Fuente: [documento de requerimientos](../../archivo.md), contexto, moneda e impuestos, glosario, RF-01 y RF-02, y decisiones de portadas/carruseles acordadas para esta iteración.
