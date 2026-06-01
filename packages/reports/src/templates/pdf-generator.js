import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../formatters/number.js';

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
  
  // Doc Title
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("COTIZACIÓN", 140, 20);
  
  doc.setFontSize(10);
  doc.text(`Nº: ${String(quotation.id).padStart(5, '0')}`, 140, 26);
  doc.text(`Fecha: ${quotation.date}`, 140, 31);
  doc.text(`Válida por: ${quotation.validity_days} días`, 140, 36);

  // Client Info
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", 14, 55);
  doc.setFont("helvetica", "normal");
  doc.text(quotation.client_name || "N/A", 14, 61);
  if (quotation.client_document) doc.text(`ID/RNC: ${quotation.client_document}`, 14, 66);
  if (quotation.client_phone) doc.text(`Tel: ${quotation.client_phone}`, 14, 71);
  
  // Items Table
  const tableData = items.map(i => [
    i.name,
    i.quantity.toString(),
    `$${fmt(i.price)}`,
    `$${fmt(i.total)}`
  ]);

  autoTable(doc, {
    startY: 80,
    head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [67, 94, 190] },
    styles: { fontSize: 9 },
    columnStyles: {
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 30 }
    }
  });

  // Totals
  const finalY = doc.lastAutoTable.finalY || 80;
  
  doc.setFontSize(10);
  doc.text(`Subtotal:`, 140, finalY + 10);
  doc.text(`$${fmt(quotation.subtotal)}`, 180, finalY + 10, { align: "right" });
  
  doc.text(`Descuento:`, 140, finalY + 16);
  doc.text(`-$${fmt(quotation.discount)}`, 180, finalY + 16, { align: "right" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL:`, 140, finalY + 24);
  doc.text(`$${fmt(quotation.total)}`, 180, finalY + 24, { align: "right" });

  // Notes & Conditions
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  
  let noteY = finalY + 10;
  if (quotation.notes && quotation.notes.trim() !== '') {
    doc.text("Notas:", 14, noteY);
    doc.text(doc.splitTextToSize(quotation.notes, 100), 14, noteY + 5);
    noteY += 20;
  }
  
  if (quotation.conditions && quotation.conditions.trim() !== '') {
    doc.text("Condiciones:", 14, noteY);
    doc.text(doc.splitTextToSize(quotation.conditions, 100), 14, noteY + 5);
  }

  // Footer / Signature line
  doc.setLineWidth(0.5);
  doc.line(14, 280, 80, 280);
  doc.text("Firma de Aceptación", 30, 285);

  const filename = `Cotizacion_${String(quotation.id).padStart(5, '0')}.pdf`;

  return createPdfResult(doc, filename, action);
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
