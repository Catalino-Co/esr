## La lista de cotizaciones

La pantalla de **Cotizaciones** muestra, por cada una: número
(`COT-000001`), cliente, evento, fecha, estado y total.

Por defecto solo ve las de un periodo —el que esté configurado en
Configuración › Generales—, con un aviso arriba indicando ese rango.
Puede ajustarlo con los botones rápidos (Este mes, Trimestre, Año) o
escribiendo un "Desde"/"Hasta" propio. Un buscador filtra en vivo por
número, cliente o evento dentro de ese rango.

Si necesita una cotización de hace tiempo, fuera del rango visible, use
la lupa de **buscar por número**: escriba al menos dos caracteres y
busca en todas, sin importar la fecha.

**Seleccionar varias** activa un modo de selección múltiple para
aprobar o cancelar varias cotizaciones de una vez. El sistema procesa
las que sí califican y avisa cuáles saltó y por qué —por ejemplo, una
que ya estaba aprobada, o sin existencia suficiente—.

## Crear una cotización

El botón **Nueva cotización** abre un formulario corto:

- **Evento\*** y **Cliente\*** (obligatorios).
- **Válida hasta** (opcional): la fecha que se imprime en el documento.
- **Notas** y **Condiciones**: texto libre que también se imprime.

Al guardar, la cotización nace en estado **Borrador** y lo lleva
directo a su ficha — ahí es donde se agregan los artículos.

## Agregar artículos y paquetes

Dentro de la ficha, la tabla de **Ítems cotizados** empieza vacía.

- **Agregar artículo** abre un buscador sobre el catálogo activo.
  Al elegir uno, complete Cantidad, Precio unitario —viene
  precargado con el precio de alquiler del artículo, pero es editable:
  esto es una cotización, no una tarifa fija—, Descuento % e
  Impuesto %. Una vista previa muestra el importe antes de agregarlo.
- **Agregar paquete** inserta de una vez todos los artículos de un
  paquete armado en Configuración, con un mismo Descuento %/Impuesto %
  para el grupo. Cada artículo entra como una línea independiente, al
  precio vigente del catálogo —no al precio que tuviera el paquete
  cuando se armó—, y desde ahí se edita como cualquier otra línea. Si
  el paquete incluye un artículo inactivo, no se puede insertar.

Cualquier línea se puede editar o quitar mientras la cotización siga en
Borrador. Los cambios se guardan solos; no hay un botón de guardar.

## Cómo se calculan los importes

Cada línea se calcula así:

1. Cantidad × Precio unitario = importe bruto.
2. Se resta el Descuento % sobre ese bruto.
3. Sobre lo que queda se suma el Impuesto %.

El resultado es el importe de la línea. Los **Totales** de la
cotización —Subtotal, Descuento, Impuesto y Total— son la suma de
todas las líneas: no existe un descuento o impuesto que se aplique a
la cotización completa, solo a cada línea por separado.

## Aprobar, cancelar o convertir en orden

Una cotización en Borrador puede:

- **Aprobarse.** Revisa que tenga al menos una línea y que todavía
  haya existencia suficiente de cada artículo, y la pasa a
  **Aprobada**.
- **Cancelarse.** La deja en **Cancelada**, de forma permanente.

Una vez **Aprobada**, aparece el botón **Convertir a orden**: crea la
orden de trabajo con esas mismas líneas y pasa la cotización a
**Convertida**.

Una cotización **Cancelada** o **Convertida** ya no se puede editar
—ni sus líneas, ni sus notas—. Si necesita partir de ella, use
**Copiar**.

Aprobar, cancelar y convertir están reservados a los roles Gerente y
Administrador; cualquier rol con acceso a Cotizaciones puede crear una
y editarla mientras esté en Borrador. Consulte *Roles y Permisos* para
el detalle completo.

## Copiar una cotización

**Copiar** funciona sobre cualquier cotización, sin importar su
estado — es la forma normal de reutilizar una aprobada, cancelada o
convertida. Pide el cliente destino (por defecto, el mismo) y,
opcionalmente, un evento de ese cliente.

La copia siempre nace **en Borrador**, con número y fecha nuevos: trae
las líneas, notas y condiciones, pero no arrastra el estado ni la
fecha de validez originales. Si elige un cliente distinto, recuerde que
los precios copiados pueden no ser los que le corresponden a ese
cliente.

## Imprimir o exportar a PDF

El botón **Imprimir** genera una vista previa del documento —membrete
de la empresa, líneas con su descuento e impuesto, totales, y las
Notas/Condiciones— desde la que se puede ver o descargar el PDF.
