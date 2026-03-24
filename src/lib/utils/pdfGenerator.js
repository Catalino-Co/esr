import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function generateQuotationPDF(quotation, items) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(67, 94, 190); // Primary color
  doc.text("ESR APP", 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Events Stock & Rentals", 14, 26);
  
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
  doc.text("Cliente:", 14, 45);
  doc.setFont("helvetica", "normal");
  doc.text(quotation.client_name || "N/A", 14, 51);
  if (quotation.client_document) doc.text(`ID/RNC: ${quotation.client_document}`, 14, 56);
  if (quotation.client_phone) doc.text(`Tel: ${quotation.client_phone}`, 14, 61);
  
  // Items Table
  const tableData = items.map(i => [
    i.name,
    i.quantity.toString(),
    `$${Number(i.price).toFixed(2)}`,
    `$${Number(i.total).toFixed(2)}`
  ]);

  doc.autoTable({
    startY: 70,
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
  const finalY = doc.lastAutoTable.finalY || 70;
  
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

  // Save PDF
  doc.save(`Cotizacion_${String(quotation.id).padStart(5, '0')}.pdf`);
}

export function generateWorkOrderPDF(wo, items) {
  const doc = new jsPDF();
  
  doc.setFontSize(22);
  doc.setTextColor(67, 94, 190);
  doc.text("ESR APP", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Events Stock & Rentals", 14, 26);
  
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("ORDEN DE TRABAJO", 140, 20);
  doc.setFontSize(10);
  doc.text(`WO-${String(wo.id).padStart(5, '0')}`, 140, 26);
  doc.text(`Fecha Operación: ${wo.date}`, 140, 31);
  if (wo.vehicle) doc.text(`Vehículo: ${wo.vehicle}`, 140, 36);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente / Evento:", 14, 45);
  doc.setFont("helvetica", "normal");
  doc.text(wo.client_name || "N/A", 14, 51);
  doc.text(`Responsable: ${wo.responsible_person || 'No asignado'}`, 14, 56);
  
  const tableData = items.map(i => [
    i.internal_code,
    i.name,
    i.quantity.toString()
  ]);

  doc.autoTable({
    startY: 65,
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

  doc.save(`Orden_Trabajo_${String(wo.id).padStart(5, '0')}.pdf`);
}

export function generateConducePDF(wo, items) {
  const doc = new jsPDF();
  
  doc.setFontSize(22);
  doc.setTextColor(67, 94, 190);
  doc.text("ESR APP", 14, 20);
  
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("CONDUCE DE ENTREGA", 140, 20);
  doc.setFontSize(10);
  doc.text(`Ref. WO-${String(wo.id).padStart(5, '0')}`, 140, 26);
  doc.text(`Fecha: ${wo.date}`, 140, 31);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Entregado a:", 14, 45);
  doc.setFont("helvetica", "normal");
  doc.text(wo.client_name || "N/A", 14, 51);

  const tableData = items.map(i => [
    i.quantity.toString(),
    i.name,
    "" // Espacio para check manual si se desea
  ]);

  doc.autoTable({
    startY: 60,
    head: [['Cant.', 'Descripción del Equipo', 'Verificado']],
    body: tableData,
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [200, 200, 200] },
    bodyStyles: { lineWidth: 0.1, lineColor: [200, 200, 200] },
    columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 2: { cellWidth: 30 } }
  });

  const finalY = doc.lastAutoTable.finalY + 40;
  
  doc.setLineWidth(0.5);
  doc.line(20, finalY, 80, finalY);
  doc.text("Entregado por (Firma)", 25, finalY + 5);

  doc.line(120, finalY, 180, finalY);
  doc.text("Recibido Conforme (Firma)", 125, finalY + 5);

  doc.save(`Conduce_WO_${String(wo.id).padStart(5, '0')}.pdf`);
}
