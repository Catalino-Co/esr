# Sistema de diseño — ESR Cloud

## Tokens

Todo el CSS se escribe contra variables. Nunca un hex directo en un componente.

```css
:root {
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-muted: #64748B;
  --text-placeholder: #94A3B8;
  --text-on-accent: #FFFFFF;

  --surface: #FFFFFF;
  --surface-sunken: #F1F5F9;
  --surface-page: #F6F8FB;

  --border: #E2E8F0;
  --border-strong: #CBD5E1;

  --accent: #4F46E5;
  --accent-hover: #4338CA;
  --accent-active: #3730A3;
  --accent-subtle: #EEF2FF;
  --accent-border: #C7D2FE;
  --sidebar-bg: #1E1B4B;
  --sidebar-item-active: #312E81;

  --success: #10B981; --success-bg: #ECFDF5; --success-text: #047857;
  --warning: #F59E0B; --warning-bg: #FFFBEB; --warning-text: #B45309;
  --danger:  #DC2626; --danger-bg:  #FEF2F2; --danger-text:  #B91C1C;

  --radius: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;
  --h-control: 36px;
  --focus-ring: 0 0 0 3px rgba(79, 70, 229, 0.18);
}
```

### Tema oscuro

El bloque de arriba es el tema **claro**. `[data-theme='dark']` redefine estos, y
solo estos: lo que no aparece aquí se hereda.

```css
[data-theme='dark'] {
  --text-primary: #F1F5F9;
  --text-secondary: #CBD5E1;
  --text-muted: #94A3B8;
  --text-placeholder: #64748B;

  --surface: #1E293B;
  --surface-sunken: #0F172A;
  --surface-page: #020617;

  --border: #334155;
  --border-strong: #475569;

  --accent: #635BFB;
  --accent-hover: #7F79FC;
  --accent-active: #A5B4FC;
  --accent-subtle: #312E81;
  --accent-border: #4338CA;

  --success-bg: rgba(16, 185, 129, .16);  --success-text: #34D399;
  --warning-bg: rgba(245, 158, 11, .16);  --warning-text: #FBBF24;
  --danger-bg:  rgba(220, 38, 38, .18);   --danger-text:  #F87171;

  --focus-ring: 0 0 0 3px rgba(99, 102, 241, .32);
}
```

Tres cosas que el bloque no enseña:

**La escala de texto sube un escalón entero.** `#64748B` da 4.8:1 sobre blanco
pero **3.07:1** sobre la superficie oscura. En oscuro deja de ser el último
escalón legible y pasa a ser el placeholder.

**El acento oscuro no es el claro.** El botón primario es letra blanca *encima*
del acento (pide 4.5:1) y a la vez una forma *sobre* el panel (pide 3:1), y las
dos condiciones tiran en contra: `#4F46E5` da 6.29 y 2.33; `#6366F1`, 4.47 y
3.27. `#635BFB` cumple las dos —4.75 y 3.08— y conserva el tono 243 del claro.

**`--accent-active` no sigue a los otros dos.** Ahí hace de color de *letra*
sobre `--accent-subtle` en badges, alertas y toasts.

### La barra lateral no tiene tema

`--sidebar-bg` y los `--sb-*` viven **fuera** de los bloques de tema: la barra es
siempre oscura. Cualquier color suyo tomado de un token que sí cambia con el
tema se rompe al pasar a oscuro.

## Reglas no negociables

1. **Un solo acento por pantalla.** `--accent` sólido solo en el botón primario. Todo lo demás es neutro, texto o borde.
2. **`--text-placeholder` nunca lleva texto que haya que leer.** Solo placeholders e iconos decorativos. Encabezados de tabla y metadata van en `--text-muted`.
3. **Los colores de estado tienen par fondo/texto.** Badge = `--success-bg` + `--success-text`. Jamás el color puro como color de letra.
4. **Radio 8px y espaciado en múltiplos de 4.**
5. **Sentence case en toda la UI.** Sin ALL CAPS, sin Title Case, sin letter-spacing decorativo.
6. **Nada de datos crudos en la vista.** Ver "Capa de formato".
7. **El umbral de contraste depende del FONDO, no del color.** El mismo
   `--text-muted` pasa AA sobre `--surface` (4.8:1) y no lo pasa sobre
   `--surface-sunken` (4.34:1). Lo que va sobre fondo hundido sube a
   `--text-secondary`. Un color no es accesible por sí solo: lo es sobre algo.
8. **Borde hairline 1px `--border`.** La sombra se reserva a lo que flota sobre el resto: modales y toasts.

## Capa de formato

Ningún template renderiza valores de base de datos directamente.

- **Enums** → mapa central `label` + `tone` (`success` | `warning` | `danger` | `neutral`).
  `parcialmente_devuelto` → "Parcialmente devuelto", tone `warning`.
- **Fechas** → `20 jun 2026`. Menos de 7 días: relativo ("hace 2 días").
- **Dinero** → `Intl.NumberFormat` con la moneda del tenant y separador de miles.
- **Vacío** → `—` en `--text-muted`, nunca cadena vacía ni `null`.

## Patrones

### Barra de filtros
Una sola fila horizontal: input con icono interno (flex:1) + selects de ancho fijo. Filtrado en vivo con debounce de 300ms. **Sin botón "Buscar".** La acción primaria de la pantalla va al final de esa misma fila, no en una fila propia encima.

El estado va en un `<select>` nativo con `appearance: none`, punto de color y chevron propio: conserva teclado, lector de pantalla y el desplegable del sistema, que en móvil supera a cualquier imitación.

### Tabla
- `thead` sin fondo gris. Labels 12px, `--text-muted`, sentence case.
- Filas separadas por hairline. Hover `--surface-sunken`.
- Estado como badge relleno, con el par fondo/texto de la regla 3.
- Las acciones de la fila son botones con etiqueta visible, no iconos mudos: `.btn-edit` en ámbar para lo que modifica y `.btn-view` en gris para lo que solo lleva a mirar.

### Métricas
Franja única dividida por hairlines, no tarjetas individuales. Label 12px arriba, valor 22px/500 abajo. Sin iconos de color.

### Estado vacío
Icono outline `--text-muted` 24px + título + una línea de explicación + botón de la acción que lo resuelve. Nunca una frase suelta flotando.

### Grids
Nunca dejar una tarjeta huérfana. 6 elementos → 3×2. Paneles de una fila con `align-items: stretch` y misma altura. Un tercer panel va full-width abajo.

### Links secundarios
"Ver todos" en `--text-secondary` 13px. El acento aparece solo en hover.