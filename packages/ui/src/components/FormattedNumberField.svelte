<script>
  /**
   * Input de dinero/cantidad con coma de miles EN VIVO, mientras se escribe.
   *
   * Un `<input type="number">` nativo rechaza texto con comas como valor, así
   * que el campo visible es `type="text"`. Eso le quita a `required`/`min`
   * su candado nativo del navegador si el valor no llega a enviarse -en
   * Cloud, un input sin `name` sí participa en la validación nativa aunque no
   * se envíe, así que `required` se conserva-; `min`/`max` se recortan a mano
   * en `blur`, que es donde las dos apps ya validan de verdad antes de
   * guardar.
   *
   * `value` es siempre el NÚMERO limpio (sin comas). Reformatear en cada
   * tecla mueve el cursor al final si no se restaura a mano: se cuentan los
   * dígitos y el punto decimal (todo salvo la coma) antes del cursor en el
   * texto viejo, se reformatea, y se busca esa misma posición en el texto
   * nuevo para reponerlo ahí -así sobrevive a que una coma nueva aparezca
   * antes o después del cursor-. Todo dentro del MISMO evento `input`, sin
   * `tick()`/`await`: dos teclas seguidas (como al escribir ".5" rápido)
   * llegan como dos eventos `input` separados, y si el primero deja su
   * `setSelectionRange` pendiente en una promesa, el segundo puede leer
   * `selectionStart` antes de que se aplique y descuadrar el cursor.
   *
   * Cuando lleva `name` (formularios nativos de Cloud, que leen
   * `request.formData()`), agrega un `<input type="hidden">` con el valor
   * limpio: el campo visible no lleva `name`, así que el navegador solo
   * envía la versión sin comas. Desktop no usa formularios nativos -lee el
   * valor ligado y lo pasa directo a `window.api.db.run`- así que le basta
   * con `bind:value`, sin `name`.
   */

  export let value = null;
  export let id = undefined;
  export let name = undefined;
  // Para filas de tabla que viven fuera de su `<form>` y se asocian con
  // `form="id-del-form"` en vez de anidamiento -caso de las líneas de una
  // orden nueva-: el input oculto necesita el mismo atributo para que el
  // navegador lo cuente al enviar.
  export let form = undefined;
  export let decimals = 2;
  export let min = undefined;
  export let max = undefined;
  export let placeholder = undefined;
  export let required = false;
  export let disabled = false;

  let className = '';
  export { className as class };

  /** @param {number | string | null | undefined} num */
  function formatDisplay(num) {
    if (num === null || num === undefined || num === '') return '';
    const n = Number(num);
    if (Number.isNaN(n)) return '';
    return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
  }

  /** @param {string} text */
  function cleanToNumber(text) {
    const cleaned = text.replace(/,/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }

  // "Significativo" = dígito o punto decimal. La coma de agrupación NO
  // cuenta: es la única marca que el formateo agrega o quita libremente, así
  // que anclar el cursor a todo lo demás (incluido el punto que el usuario
  // acaba de escribir) es lo que lo deja DESPUÉS de ese punto y no antes.
  /** @param {string} ch */
  function esSignificativo(ch) {
    return (ch >= '0' && ch <= '9') || ch === '.';
  }

  /** @param {string} text @param {number} pos */
  function contarSignificativosAntes(text, pos) {
    let count = 0;
    for (let i = 0; i < pos && i < text.length; i++) {
      if (esSignificativo(text[i])) count++;
    }
    return count;
  }

  /** @param {string} text @param {number} n */
  function posicionTrasSignificativos(text, n) {
    if (n <= 0) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      if (esSignificativo(text[i])) {
        count++;
        if (count === n) return i + 1;
      }
    }
    return text.length;
  }

  let displayValue = formatDisplay(value);
  // Espejo de `value`: si difiere de `value` en el bloque reactivo de abajo
  // es porque el cambio vino de FUERA (carga inicial, reset del formulario),
  // no de `handleInput` -que ya deja los dos iguales antes de que ese bloque
  // corra-. Sin esto, reformatear en cada tecla borraría el "50." que alguien
  // acaba de escribir en cuanto `value` pasa a `50`.
  let ultimoValorInterno = value;
  $: if (value !== ultimoValorInterno) {
    ultimoValorInterno = value;
    displayValue = formatDisplay(value);
  }

  /** @param {Event & { currentTarget: HTMLInputElement }} e */
  function handleInput(e) {
    const el = e.currentTarget;
    const cursorPos = el.selectionStart ?? el.value.length;
    const antes = contarSignificativosAntes(el.value, cursorPos);

    let raw = el.value.replace(/[^\d.]/g, '');
    if (decimals === 0) {
      raw = raw.replace(/\./g, '');
    } else {
      const firstDot = raw.indexOf('.');
      if (firstDot !== -1) {
        raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
      }
    }

    const [intPart, decPart] = raw.split('.');
    const decCapped = decPart !== undefined ? decPart.slice(0, decimals) : decPart;

    let formatted;
    if (!intPart) {
      formatted = raw.startsWith('.') ? '0' : '';
    } else {
      formatted = Number(intPart).toLocaleString('en-US');
    }
    if (decCapped !== undefined) formatted += '.' + decCapped;

    const cleaned = cleanToNumber(raw.split('.')[0] + (decCapped !== undefined ? '.' + decCapped : ''));

    // Orden importa: primero el DOM, de forma síncrona y en el mismo evento
    // -así el cursor queda bien puesto antes de que el navegador procese la
    // siguiente tecla-. `displayValue`/`value` se actualizan después, para
    // que Svelte los vea ya consistentes con lo que hay en pantalla.
    el.value = formatted;
    el.setSelectionRange(
      posicionTrasSignificativos(formatted, antes),
      posicionTrasSignificativos(formatted, antes)
    );
    displayValue = formatted;
    value = cleaned;
    ultimoValorInterno = cleaned;
  }

  function handleBlur() {
    if (value === null || value === undefined) {
      displayValue = '';
      return;
    }
    let n = value;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    value = n;
    ultimoValorInterno = n;
    displayValue = n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
</script>

<input
  {id}
  type="text"
  inputmode="decimal"
  class={className}
  {placeholder}
  {required}
  {disabled}
  value={displayValue}
  on:input={handleInput}
  on:blur={handleBlur}
  {...$$restProps}
/>
{#if name}
  <input type="hidden" {name} {form} value={value ?? ''} />
{/if}
