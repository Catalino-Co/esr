// Import CON NOMBRE, no por defecto. `jspdf` declara una condicion `node` que
// resuelve a otra compilacion, y en ella el export por defecto es un OBJETO, no
// el constructor: `new jsPDF()` lanza «jsPDF is not a constructor». Los dos
// builds exportan `jsPDF` con nombre, asi que esta forma funciona igual en Node
// y en el navegador. (Aun asi este modulo NO debe ejecutarse en SSR:
// `doc.output('bloburl')` necesita `Blob` y `URL.createObjectURL`.)
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
// UNA sola fuente para el desglose de una linea: la misma funcion que usan las
// dos pantallas y los dos repositorios. Duplicar aqui esas cuatro
// multiplicaciones seria una tercera copia de la formula, y ninguna prueba la
// cubriria.
//
// Se importa `@esr/core` a secas —que resuelve al TypeScript— y NO el gemelo
// `.cjs`: el servidor de desarrollo de Vite sirve un `.cjs` de un paquete del
// workspace tal cual, sin interoperar, y el import de sus exportadas con nombre
// revienta en desarrollo aunque `vite build` lo resuelva. Por eso la prueba de
// maquetacion del PDF corre con `tsx` y no con Node pelado.
import { calculateQuoteLineAmounts } from '@esr/core';
import { fmt, fmtMoney } from '../formatters/number.js';

/**
 * Una tasa, sin ceros de relleno: 18 y no «18.00», 6.818 y no «6.82».
 *
 * Se imprime vacio cuando es cero. Una columna de «0%» repetida sesenta veces
 * es ruido, y lo que el lector busca ahi es la excepcion.
 */
function pct(valor) {
  const n = Number(valor) || 0;
  if (n === 0) return '';
  return `${Number(n.toFixed(3))}%`;
}
import { quoteDocumentFilename, quoteDocumentNumber, quoteItemLabel } from '../formatters/labels.js';

/**
 * Geometria de pagina, en milimetros. Antes eran numeros sueltos —`14`, `140`,
 * `180`, `280`— repetidos por los cuatro generadores.
 */
const MARGEN_X = 14;
const MARGEN_SUPERIOR = 20;
/** Banda inferior reservada. Ni la tabla ni el texto entran aqui. */
const MARGEN_INFERIOR = 30;
const COL_ETIQUETA = 140;
const COL_VALOR = 182;

const altoPagina = (doc) => doc.internal.pageSize.getHeight();
const anchoPagina = (doc) => doc.internal.pageSize.getWidth();

/**
 * Devuelve una `y` donde CABEN `alto` milimetros. Si no caben en la pagina
 * actual, abre otra y devuelve el margen superior.
 *
 * Es la pieza que faltaba. El generador de cotizaciones escribia la firma en
 * `y = 280` pasara lo que pasara, y empezaba las notas en `finalY + 10`, que es
 * exactamente la `y` de la fila «Subtotal»: con una tabla larga la firma caia
 * encima de la tabla, y con una nota larga el texto entraba en la columna de
 * los totales. No habia ni un `addPage()` en todo el archivo.
 */
function hueco(doc, y, alto) {
  if (y + alto <= altoPagina(doc) - MARGEN_INFERIOR) return y;
  doc.addPage();
  return MARGEN_SUPERIOR;
}

/**
 * Numera las paginas AL FINAL, no durante el dibujo: mientras se dibuja aun no
 * se sabe cuantas van a ser. Un documento de una sola pagina no lleva «1 de 1»,
 * que es ruido.
 */
function paginar(doc) {
  const total = doc.getNumberOfPages();
  if (total < 2) return;
  for (let n = 1; n <= total; n += 1) {
    doc.setPage(n);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text(`Página ${n} de ${total}`, anchoPagina(doc) - MARGEN_X, altoPagina(doc) - 10, {
      align: 'right'
    });
  }
}

function createPdfResult(doc, filename, action) {
  if (action === 'preview') {
    return { url: doc.output('bloburl'), filename };
  }

  return { doc, filename };
}

function renderCompanyHeader(doc, companyInfo) {
  let textY = 20;
  
  if (companyInfo && companyInfo.logo_base64) {
    try {
      let format = 'JPEG';
      if (companyInfo.logo_base64.startsWith('data:image/png')) format = 'PNG';
      doc.addImage(companyInfo.logo_base64, format, 14, 10, 45, 20);
      textY = 36;
    } catch(e) {
      console.warn("Error rendering logo", e);
    }
  }

  doc.setFontSize(16);
  doc.setTextColor(67, 94, 190);
  doc.text(companyInfo && companyInfo.name ? companyInfo.name : "ESR Pro", 14, textY);

  doc.setFontSize(9);
  doc.setTextColor(100);
  textY += 5;
  
  if (companyInfo) {
    if (companyInfo.rnc) { doc.text(`RNC: ${companyInfo.rnc}`, 14, textY); textY += 4; }
    if (companyInfo.phone || companyInfo.email) { 
      let ctext = [];
      if(companyInfo.phone) ctext.push(`Tel: ${companyInfo.phone}`);
      if(companyInfo.email) ctext.push(`Email: ${companyInfo.email}`);
      doc.text(ctext.join(' | '), 14, textY); 
      textY += 4; 
    }
    if (companyInfo.address) { 
      doc.text(doc.splitTextToSize(companyInfo.address, 100), 14, textY); 
    }
  } else {
    doc.text("Events Stock & Rentals", 14, textY);
  }
}

export function generateQuotationPDF(quotation, items, action = 'save', companyInfo = null) {
  const doc = new jsPDF();

  renderCompanyHeader(doc, companyInfo);

  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text('COTIZACIÓN', COL_ETIQUETA, 20);

  doc.setFontSize(10);
  // Una sola funcion para el numero de la cabecera y el del fichero: antes eran
  // dos `padStart(5)` escritos a mano que coincidian por casualidad.
  doc.text(`Nº: ${quoteDocumentNumber(quotation)}`, COL_ETIQUETA, 26);
  doc.text(`Fecha: ${quotation.date || '—'}`, COL_ETIQUETA, 31);
  if (quotation.validity_days) {
    doc.text(`Válida por: ${quotation.validity_days} días`, COL_ETIQUETA, 36);
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', MARGEN_X, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(quotation.client_name || 'N/A', MARGEN_X, 61);
  if (quotation.client_document) doc.text(`ID/RNC: ${quotation.client_document}`, MARGEN_X, 66);
  if (quotation.client_phone) doc.text(`Tel: ${quotation.client_phone}`, MARGEN_X, 71);

  autoTable(doc, {
    startY: 80,
    // La moneda va en la CABECERA y no en cada celda: repetir «RD$» en cuatro
    // celdas por fila embarra una tabla de 60 lineas, y sin declararla en
    // ningun sitio un «$» suelto se lee como dolar, que en el pais no es lo
    // mismo. Se declara una vez y se cuenta una vez.
    // «Desc.» e «Imp.» van en porcentaje y por eso llevan su simbolo en la
    // celda: son las dos unicas columnas que no son dinero, y sin el «%» se
    // leerian como importes.
    head: [['Descripción', 'Cant.', 'Precio unit. (RD$)', 'Desc.', 'Imp.', 'Importe (RD$)']],
    body: (items || []).map((linea) => {
      const importes = calculateQuoteLineAmounts(linea);
      return [
        // La etiqueta la pone `quoteItemLabel`, no quien llama: el listado de
        // Desktop escribia «[PAQUETE] X» y su editor «📦 X» para la misma
        // cotizacion, y el emoji ademas salia como un hueco porque las fuentes
        // estandar de jsPDF son WinAnsi.
        quoteItemLabel(linea),
        // `String(... ?? 0)` y no `.toString()`: una cantidad nula reventaba.
        String(linea.quantity ?? 0),
        fmt(linea.price),
        pct(linea.discount_rate),
        pct(linea.tax_rate),
        // El importe va CON impuesto y ya rebajado: es lo que se cobra por la
        // linea, y su suma es el TOTAL de abajo. Enseñar aqui el bruto dejaria
        // un documento cuyas lineas no suman su propio total.
        fmt(importes.total)
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: [67, 94, 190] },
    styles: { fontSize: 9 },
    // Lo que hace que los saltos de pagina de la propia tabla respeten la banda
    // inferior donde va el pie.
    margin: { top: MARGEN_SUPERIOR, bottom: MARGEN_INFERIOR, left: MARGEN_X, right: MARGEN_X },
    columnStyles: {
      1: { halign: 'center', cellWidth: 14 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 28 }
    }
  });

  // ── Totales ─────────────────────────────────────────────────────────────
  //
  // Cursor acumulado y no `finalY + N`: las filas de descuento e impuesto son
  // condicionales, asi que la altura del bloque es variable POR DISEÑO.
  let y = (doc.lastAutoTable && doc.lastAutoTable.finalY) || 80;

  const filas = [['Subtotal:', fmtMoney(quotation.subtotal)]];
  // Solo lo que vale algo: antes se imprimia «Descuento: -$0.00» en todas las
  // cotizaciones, que es ruido en la inmensa mayoria.
  if (Number(quotation.discount) > 0) {
    filas.push(['Descuento:', `-${fmtMoney(quotation.discount)}`]);
  }
  // El impuesto no se imprimia NUNCA. En Desktop daba igual porque sus
  // cotizaciones no tenian la columna; en Cloud, `total = subtotal - discount +
  // tax_amount`, asi que el PDF enseñaba un total que no cuadraba con sus
  // propias cifras.
  if (Number(quotation.tax_amount) > 0) {
    filas.push(['Impuesto:', fmtMoney(quotation.tax_amount)]);
  }

  y = hueco(doc, y + 10, filas.length * 6 + 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  for (const [etiqueta, valor] of filas) {
    doc.text(etiqueta, COL_ETIQUETA, y);
    doc.text(valor, COL_VALOR, y, { align: 'right' });
    y += 6;
  }

  y += 2;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', COL_ETIQUETA, y);
  doc.text(fmtMoney(quotation.total), COL_VALOR, y, { align: 'right' });

  // ── Notas y condiciones ─────────────────────────────────────────────────
  //
  // DEBAJO de los totales y a ancho completo. Antes empezaban en la misma `y`
  // que la fila «Subtotal» y solo se salvaban por estar en otra columna: en
  // cuanto la nota era larga, `splitTextToSize` la llevaba hasta la columna de
  // los totales. Ponerlas debajo mata la colision por construccion, no
  // ajustando numeros.
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const anchoTexto = anchoPagina(doc) - MARGEN_X * 2;

  for (const bloque of [
    { titulo: 'Notas', texto: quotation.notes },
    { titulo: 'Condiciones', texto: quotation.conditions }
  ]) {
    const texto = String(bloque.texto || '').trim();
    if (!texto) continue;
    const lineas = doc.splitTextToSize(texto, anchoTexto);
    y = hueco(doc, y + 8, 6 + lineas.length * 4);
    doc.setFont('helvetica', 'bold');
    doc.text(`${bloque.titulo}:`, MARGEN_X, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lineas, MARGEN_X, y + 5);
    y += 5 + lineas.length * 4;
  }

  // La firma va DESPUES del contenido, no clavada al pie de la hoja: con una
  // cotizacion de tres lineas quedaria flotando veinte centimetros mas abajo y
  // pareceria un error de maquetacion.
  y = hueco(doc, y + 16, 12);
  doc.setDrawColor(150);
  doc.setLineWidth(0.5);
  doc.line(MARGEN_X, y, MARGEN_X + 66, y);
  doc.setTextColor(80);
  doc.setFontSize(9);
  doc.text('Firma de aceptación', MARGEN_X, y + 5);

  paginar(doc);

  return createPdfResult(doc, quoteDocumentFilename(quotation), action);
}

export function generateWorkOrderPDF(wo, items, action = 'save', companyInfo = null) {
  const doc = new jsPDF();
  
  renderCompanyHeader(doc, companyInfo);
  
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("ORDEN DE TRABAJO", 140, 20);
  doc.setFontSize(10);
  doc.text(`WO-${String(wo.id).padStart(5, '0')}`, 140, 26);
  doc.text(`Fecha Operación: ${wo.date}`, 140, 31);
  if (wo.vehicle) doc.text(`Vehículo: ${wo.vehicle}`, 140, 36);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente / Evento:", 14, 55);
  doc.setFont("helvetica", "normal");
  doc.text(wo.client_name || "N/A", 14, 61);
  doc.text(`Responsable: ${wo.responsible_person || 'No asignado'}`, 14, 66);
  
  const tableData = items.map(i => [
    i.internal_code,
    i.name,
    i.quantity.toString()
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Código', 'Descripción del Ítem', 'Cantidad a Preparar']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [108, 117, 125] },
    styles: { fontSize: 10 },
    columnStyles: { 2: { halign: 'center', cellWidth: 40 } }
  });

  const finalY = doc.lastAutoTable.finalY + 10;
  if (wo.notes) {
    doc.setFont("helvetica", "bold");
    doc.text("Instrucciones / Observaciones:", 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(wo.notes, 180), 14, finalY + 6);
  }

  const filename = `Orden_Trabajo_${String(wo.id).padStart(5, '0')}.pdf`;

  return createPdfResult(doc, filename, action);
}

export function generateChecklistPDF(workOrder, items, type = 'salida', action = 'save', companyInfo = null) {
  const doc      = new jsPDF();
  const isSalida = type === 'salida';
  const accentR  = isSalida ? 67  : 202;
  const accentG  = isSalida ? 94  : 87;
  const accentB  = isSalida ? 190 : 0;

  renderCompanyHeader(doc, companyInfo);

  // Title
  doc.setFontSize(9);
  doc.setTextColor(accentR, accentG, accentB);
  doc.text(isSalida ? 'CHECKLIST DE SALIDA' : 'CHECKLIST DE RETORNO', 140, 20);

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`WO-${String(workOrder.id).padStart(5, '0')}`, 140, 27);
  doc.text(`Fecha: ${workOrder.date}`, 140, 33);
  if (workOrder.vehicle) doc.text(`Vehiculo: ${workOrder.vehicle}`, 140, 39);

  // Client / Responsible
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 14, 55);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(workOrder.client_name || 'N/A', 14, 61);
  if (workOrder.responsible_person) {
    doc.text(`Responsable: ${workOrder.responsible_person}`, 14, 67);
  }

  // Helper: dibuja el checkbox visual en la celda de la columna 0 (B&N, apto para imprimir)
  function drawCheckCell(data, isOk) {
    if (data.section !== 'body' || data.column.index !== 0) return;
    const cx   = data.cell.x + data.cell.width  / 2;
    const cy   = data.cell.y + data.cell.height / 2;
    const half = 1.5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.35);
    doc.roundedRect(cx - half, cy - half, half * 2, half * 2, 0.5, 0.5, 'FD');
    if (isOk) {
      // Palomita negra
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.6);
      doc.line(cx - 1.3, cy,        cx - 0.2, cy + 1.3);
      doc.line(cx - 0.2, cy + 1.3,  cx + 1.5, cy - 1.1);
    }
    doc.setLineWidth(0.4);
    doc.setDrawColor(0);
  }

  // ── Salida table ──────────────────────────────────────────────────────────
  if (isSalida) {
    const tableData = items.map(item => [
      '',   // columna checkbox — contenido vacío, se pinta en didDrawCell
      item.internal_code || '-',
      item.item_name,
      String(item.expected_quantity),
      String(item.actual_quantity ?? item.expected_quantity),
      item.notes || ''
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['Ok', 'Codigo', 'Descripcion del Item', 'Req.', 'Verif.', 'Observacion']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [accentR, accentG, accentB], fontSize: 9 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 44 }
      },
      didParseCell(data) {
        if (data.section !== 'body') return;
        data.cell.styles.fillColor = [255, 255, 255];
      },
      didDrawCell(data) {
        if (data.section !== 'body' || data.column.index !== 0) return;
        const item  = items[data.row.index];
        const qty   = item?.actual_quantity ?? item?.expected_quantity;
        drawCheckCell(data, qty >= item?.expected_quantity);
      }
    });

  // ── Retorno table ─────────────────────────────────────────────────────────
  } else {
    const incidents = [];
    const tableData = items.map(item => {
      if (item.is_damaged || item.is_missing) incidents.push(item);
      return [
        '',   // columna checkbox
        item.internal_code || '-',
        item.item_name,
        String(item.expected_quantity),
        String(item.actual_quantity ?? 0),
        item.is_damaged ? 'SI' : '-',
        item.is_missing ? 'SI' : '-',
        item.notes || ''
      ];
    });

    autoTable(doc, {
      startY: 75,
      head: [['Ok', 'Codigo', 'Descripcion del Item', 'Req.', 'Ret.', 'Dano', 'Falt.', 'Observacion']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [accentR, accentG, accentB], fontSize: 9 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 38 }
      },
      didParseCell(data) {
        if (data.section !== 'body') return;
        const item = items[data.row.index];
        data.cell.styles.fillColor = [255, 255, 255];
        // Texto en negrita para celdas de daño/faltante con "SI"
        if (data.column.index === 5 && item?.is_damaged) data.cell.styles.fontStyle = 'bold';
        if (data.column.index === 6 && item?.is_missing) data.cell.styles.fontStyle = 'bold';
      },
      didDrawCell(data) {
        if (data.section !== 'body' || data.column.index !== 0) return;
        const item = items[data.row.index];
        const isOk = !item?.is_damaged && !item?.is_missing && (item?.actual_quantity ?? 0) >= item?.expected_quantity;
        drawCheckCell(data, isOk);
      }
    });

    // Resumen de incidencias
    if (incidents.length > 0) {
      let incY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(185, 28, 28);
      doc.text('Incidencias Registradas:', 14, incY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0);
      incY += 6;
      for (const inc of incidents) {
        let line = `  - [${inc.internal_code}] ${inc.item_name}:`;
        if (inc.is_damaged) line += ' DANIO REPORTADO';
        if (inc.is_damaged && inc.is_missing) line += ' /';
        if (inc.is_missing) line += ' FALTANTE';
        if (inc.notes) line += `  (${inc.notes})`;
        doc.text(line, 14, incY);
        incY += 5;
      }
    }
  }

  // Firmas
  const tableBottom = doc.lastAutoTable.finalY;
  const signY = Math.min(tableBottom + 22, 268);

  doc.setDrawColor(150);
  doc.setLineWidth(0.5);
  doc.setFontSize(9);
  doc.setTextColor(80);

  doc.line(14, signY, 85, signY);
  doc.text('Responsable de Operacion (Firma)', 14, signY + 5);

  doc.line(115, signY, 186, signY);
  doc.text('Supervisor / Recibido Conforme (Firma)', 115, signY + 5);

  const filename = `Checklist_${isSalida ? 'Salida' : 'Retorno'}_WO-${String(workOrder.id).padStart(5, '0')}.pdf`;

  return createPdfResult(doc, filename, action);
}

export function generateConducePDF(wo, items, action = 'save', companyInfo = null) {
  const doc = new jsPDF();
  
  renderCompanyHeader(doc, companyInfo);
  
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("CONDUCE", 140, 20);
  doc.setFontSize(10);
  if (wo.conduce_id) {
    doc.text(`COND-${String(wo.conduce_id).padStart(5, '0')}`, 140, 26);
    doc.text(`Ref. WO-${String(wo.id).padStart(5, '0')}`, 140, 31);
    doc.text(`Fecha: ${wo.date}`, 140, 36);
  } else {
    doc.text(`Ref. WO-${String(wo.id).padStart(5, '0')}`, 140, 26);
    doc.text(`Fecha: ${wo.date}`, 140, 31);
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Entregado a:", 14, 55);
  doc.setFont("helvetica", "normal");
  doc.text(wo.client_name || "N/A", 14, 61);

  const tableData = items.map(i => [
    i.quantity.toString(),
    i.name,
    `$${fmt(i.price || 0)}`,
    `$${fmt((i.quantity || 0) * (i.price || 0))}`
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['Cant.', 'Descripción del Equipo', 'Precio Unit.', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [67, 94, 190] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 30 }
    }
  });

  const finalY = doc.lastAutoTable.finalY || 70;
  
  doc.setFontSize(10);
  doc.text(`Subtotal:`, 140, finalY + 10);
  doc.text(`$${fmt(wo.subtotal || 0)}`, 180, finalY + 10, { align: "right" });
  
  doc.text(`Descuento:`, 140, finalY + 16);
  doc.text(`-$${fmt(wo.discount || 0)}`, 180, finalY + 16, { align: "right" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL:`, 140, finalY + 24);
  doc.text(`$${fmt(wo.total || 0)}`, 180, finalY + 24, { align: "right" });

  const signatureY = finalY + 45;
  
  doc.setLineWidth(0.5);
  doc.line(20, signatureY, 80, signatureY);
  doc.text("Entregado por (Firma)", 25, signatureY + 5);

  doc.line(120, signatureY, 180, signatureY);
  doc.text("Recibido Conforme (Firma)", 125, signatureY + 5);

  const filename = wo.conduce_id 
    ? `Conduce_${String(wo.conduce_id).padStart(5, '0')}_WO_${String(wo.id).padStart(5, '0')}.pdf`
    : `Conduce_WO_${String(wo.id).padStart(5, '0')}.pdf`;

  return createPdfResult(doc, filename, action);
}

/**
 * La hoja del evento: sus datos de logistica y el resumen de lo que cuelga de
 * el.
 *
 * Es el unico documento del sistema que combina varias entidades en una hoja, y
 * por eso sigue el molde de la COTIZACION y no el de la orden: es la unica de
 * las cuatro que usa `hueco()` y `paginar()`. Las otras tres llevan numeros
 * magicos y no saltan de pagina, que aqui reventaria en cuanto las notas fueran
 * largas.
 *
 * Las dos tarjetas de resumen son DELIBERADAMENTE escuetas —de la cotizacion,
 * su numero, su total y si esta aprobada; de la orden, su numero y su estado—.
 * Quien quiera el detalle imprime ese documento, que ya existe.
 *
 * SIN enlaces: un PDF no navega a la aplicacion, y en Electron menos. Los
 * botones «Ver» viven en las tarjetas de la PANTALLA.
 *
 * Los tipos van a `any` a proposito y no a `object`: este archivo es JS sin
 * tipar y las filas llegan crudas de dos bases distintas. `object` no declara
 * ninguna propiedad, asi que cada acceso seria un error.
 *
 * @param {any} evento       La fila de `events`, con `client_name` resuelto.
 * @param {any} extras       `{ quote, order }`, cualquiera de los dos nulo.
 * @param {'save'|'preview'} action
 * @param {any} companyInfo
 */
export function generateEventPDF(evento, extras = {}, action = 'save', companyInfo = null) {
  const doc = new jsPDF();
  const { quote = null, order = null } = extras || {};

  renderCompanyHeader(doc, companyInfo);

  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text('EVENTO', COL_ETIQUETA, 20);

  doc.setFontSize(10);
  doc.text(`Nº: ${eventDocumentNumber(evento)}`, COL_ETIQUETA, 26);
  doc.text(`Fecha: ${evento.date || '—'}`, COL_ETIQUETA, 31);
  if (evento.status) doc.text(`Estado: ${evento.status}`, COL_ETIQUETA, 36);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(String(evento.name || 'Sin nombre'), MARGEN_X, 55);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90);
  let y = 61;
  if (evento.event_type) { doc.text(`Tipo: ${evento.event_type}`, MARGEN_X, y); y += 5; }
  doc.text(`Cliente: ${evento.client_name || '—'}`, MARGEN_X, y); y += 5;
  if (evento.location) {
    const lineas = doc.splitTextToSize(`Lugar: ${evento.location}`, 110);
    doc.text(lineas, MARGEN_X, y);
    y += lineas.length * 5;
  }
  if (evento.responsible_person) {
    doc.text(`Responsable: ${evento.responsible_person}`, MARGEN_X, y);
    y += 5;
  }

  // ── Logistica ───────────────────────────────────────────────────────────
  //
  // En tabla y no en parrafo: son cuatro pares hora/fecha que el montador lee
  // de un vistazo el dia del evento, y una lista corrida se lee fatal.
  const logistica = [
    ['Salida de almacén', evento.departure_time],
    ['Montaje', evento.setup_time],
    ['Recogida / desmontaje', evento.pickup_date],
    ['Hora de recogida', evento.pickup_time]
  ].filter(([, valor]) => String(valor || '').trim());

  if (logistica.length) {
    y = hueco(doc, y + 6, 12 + logistica.length * 8);
    autoTable(doc, {
      startY: y,
      head: [['Logística', 'Hora / fecha']],
      body: logistica,
      theme: 'grid',
      headStyles: { fillColor: [67, 94, 190] },
      styles: { fontSize: 9 },
      margin: { left: MARGEN_X, right: MARGEN_X },
      columnStyles: { 1: { halign: 'right', cellWidth: 45 } }
    });
    y = tablaFinalY(doc, y);
  }

  // ── Los dos resumenes ───────────────────────────────────────────────────
  const resumen = [];
  resumen.push(
    quote
      ? ['Cotización', quoteDocumentNumber(quote), quote.status || '—', fmtMoney(quote.total || 0)]
      : ['Cotización', '—', 'Sin cotización', '']
  );
  resumen.push(
    order
      ? ['Orden de trabajo', orderDocumentNumber(order), order.status || '—', '']
      : ['Orden de trabajo', '—', 'Sin orden', '']
  );

  y = hueco(doc, y + 8, 30);
  autoTable(doc, {
    startY: y,
    head: [['Documento', 'Número', 'Estado', 'Total']],
    body: resumen,
    theme: 'grid',
    headStyles: { fillColor: [67, 94, 190] },
    styles: { fontSize: 9 },
    margin: { left: MARGEN_X, right: MARGEN_X },
    columnStyles: { 3: { halign: 'right', cellWidth: 35 } }
  });
  y = tablaFinalY(doc, y);

  // ── Notas ───────────────────────────────────────────────────────────────
  const notas = String(evento.notes || '').trim();
  if (notas) {
    const anchoTexto = anchoPagina(doc) - MARGEN_X * 2;
    const lineas = doc.splitTextToSize(notas, anchoTexto);
    y = hueco(doc, y + 8, 6 + lineas.length * 4);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('Condiciones o notas del evento:', MARGEN_X, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lineas, MARGEN_X, y + 5);
  }

  paginar(doc);

  return createPdfResult(doc, `Evento_${eventFilenamePart(evento)}.pdf`, action);
}

/**
 * Donde acabo la ultima tabla.
 *
 * `lastAutoTable` lo cuelga `jspdf-autotable` en tiempo de ejecucion y no esta
 * en los tipos de `jsPDF`, de ahi el cast. Con reserva por si faltara.
 * @param {any} doc
 * @param {number} porDefecto
 */
function tablaFinalY(doc, porDefecto) {
  return doc.lastAutoTable?.finalY ?? porDefecto;
}

/**
 * `EV-000007`, o el id pelado si no hubiera nada mejor.
 * @param {any} evento
 */
function eventDocumentNumber(evento) {
  return `EV-${String(evento?.id ?? '').padStart(6, '0')}`;
}

/** @param {any} evento */
function eventFilenamePart(evento) {
  return eventDocumentNumber(evento).replace(/[^\w-]/g, '') || 'sin-numero';
}

/**
 * `WO-00007`, el mismo formato que ya usan la orden y el conduce.
 * @param {any} order
 */
function orderDocumentNumber(order) {
  const numero = String(order?.order_number ?? '').trim();
  if (numero) return numero;
  return `WO-${String(order?.id ?? '').padStart(5, '0')}`;
}
