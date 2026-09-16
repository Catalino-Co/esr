// Import dinamico por quien llama (`await import('@esr/reports/events')`),
// nunca estatico: `exceljs` pesa y `wb.xlsx.writeBuffer()` no tiene por que
// estar en el bundle inicial de ninguna de las dos apps. Mismo criterio que
// `catalog/workbook.js`.
import ExcelJS from 'exceljs/dist/exceljs.min.js';

/**
 * El libro de Excel de Eventos: mismas columnas que el PDF -el punto de color
 * del tipo no se puede pintar en una celda, asi que va como texto.
 *
 * @param {Array<any>} events
 */
export async function generateEventsWorkbook(events = []) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Eventos');
  sheet.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Evento', key: 'name', width: 32 },
    { header: 'Tipo', key: 'event_type', width: 18 },
    { header: 'Cliente', key: 'client_name', width: 28 },
    { header: 'Lugar', key: 'location', width: 28 },
    { header: 'Estado', key: 'status', width: 14 }
  ];
  sheet.getRow(1).font = { bold: true };
  events.forEach((event) =>
    sheet.addRow({
      date: event.date || '',
      name: event.name || '',
      event_type: event.event_type || '',
      client_name: event.client_name || '',
      location: event.location || '',
      status: event.status || ''
    })
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  return { blob, filename: 'eventos.xlsx' };
}
