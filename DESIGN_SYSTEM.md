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

## Reglas no negociables

1. **Un solo acento por pantalla.** `--accent` sólido solo en el botón primario. Todo lo demás es neutro, texto o borde.
2. **`--text-placeholder` nunca lleva texto que haya que leer.** Solo placeholders e iconos decorativos. Encabezados de tabla y metadata van en `--text-muted`.
3. **Los colores de estado tienen par fondo/texto.** Badge = `--success-bg` + `--success-text`. Jamás el color puro como color de letra.
4. **Altura única de control: 36px.** Inputs, selects y botones. Radio 8px. Espaciado en múltiplos de 4.
5. **Sentence case en toda la UI.** Sin ALL CAPS, sin Title Case, sin letter-spacing decorativo.
6. **Nada de datos crudos en la vista.** Ver "Capa de formato".
7. **Borde hairline 1px `--border`.** Sin sombras salvo el focus ring.

## Capa de formato

Ningún template renderiza valores de base de datos directamente.

- **Enums** → mapa central `label` + `tone` (`success` | `warning` | `danger` | `neutral`).
  `parcialmente_devuelto` → "Parcialmente devuelto", tone `warning`.
- **Fechas** → `20 jun 2026`. Menos de 7 días: relativo ("hace 2 días").
- **Dinero** → `Intl.NumberFormat` con la moneda del tenant y separador de miles.
- **Vacío** → `—` en `--text-muted`, nunca cadena vacía ni `null`.

## Patrones

### Barra de filtros
Una sola fila horizontal: input con icono interno (flex:1) + segmented control de píldoras para el estado. Filtrado en vivo con debounce de 300ms. **Sin botón "Buscar".** Si las opciones de un filtro pasan de 5, usar select inline con `width:auto`, nunca full-width.

### Tabla
- `thead` sin fondo gris. Labels 12px, `--text-muted`, sentence case.
- Filas separadas por hairline. Hover `--surface-sunken`.
- Personas y entidades llevan avatar de iniciales 32px (`--accent-subtle` / `--accent` como texto).
- Estado como punto de color + texto, no badge relleno.
- Acciones como icono `⋯` alineado a la derecha, nunca link de texto en medio.

### Métricas
Franja única dividida por hairlines, no tarjetas individuales. Label 12px arriba, valor 22px/500 abajo. Sin iconos de color. Toda métrica necesita comparación; si no hay comparación posible, no va en el dashboard.

### Estado vacío
Icono outline `--text-muted` 24px + título + una línea de explicación + botón de la acción que lo resuelve. Nunca una frase suelta flotando.

### Grids
Nunca dejar una tarjeta huérfana. 6 elementos → 3×2. Paneles de una fila con `align-items: stretch` y misma altura. Un tercer panel va full-width abajo.

### Links secundarios
"Ver todos" en `--text-secondary` 13px. El acento aparece solo en hover.