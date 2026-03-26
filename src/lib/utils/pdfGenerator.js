import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  doc.text(companyInfo && companyInfo.name ? companyInfo.name : "ESR APP", 14, textY);

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
    `$${Number(i.price).toFixed(2)}`,
    `$${Number(i.total).toFixed(2)}`
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
  doc.text(`$${Number(quotation.subtotal).toFixed(2)}`, 180, finalY + 10, { align: "right" });
  
  doc.text(`Descuento:`, 140, finalY + 16);
  doc.text(`-$${Number(quotation.discount).toFixed(2)}`, 180, finalY + 16, { align: "right" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL:`, 140, finalY + 24);
  doc.text(`$${Number(quotation.total).toFixed(2)}`, 180, finalY + 24, { align: "right" });

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

  if (action === 'preview') {
    return { url: doc.output('bloburl'), filename };
  }
  
  // Save PDF
  doc.save(filename);
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

  if (action === 'preview') {
    return { url: doc.output('bloburl'), filename };
  }

  doc.save(filename);
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
    `$${Number(i.price || 0).toFixed(2)}`,
    `$${Number((i.quantity || 0) * (i.price || 0)).toFixed(2)}`
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
  doc.text(`$${Number(wo.subtotal || 0).toFixed(2)}`, 180, finalY + 10, { align: "right" });
  
  doc.text(`Descuento:`, 140, finalY + 16);
  doc.text(`-$${Number(wo.discount || 0).toFixed(2)}`, 180, finalY + 16, { align: "right" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL:`, 140, finalY + 24);
  doc.text(`$${Number(wo.total || 0).toFixed(2)}`, 180, finalY + 24, { align: "right" });

  const signatureY = finalY + 45;
  
  doc.setLineWidth(0.5);
  doc.line(20, signatureY, 80, signatureY);
  doc.text("Entregado por (Firma)", 25, signatureY + 5);

  doc.line(120, signatureY, 180, signatureY);
  doc.text("Recibido Conforme (Firma)", 125, signatureY + 5);

  const filename = wo.conduce_id 
    ? `Conduce_${String(wo.conduce_id).padStart(5, '0')}_WO_${String(wo.id).padStart(5, '0')}.pdf`
    : `Conduce_WO_${String(wo.id).padStart(5, '0')}.pdf`;

  if (action === 'preview') {
    return { url: doc.output('bloburl'), filename };
  }

  doc.save(filename);
}
