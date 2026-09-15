// Import dinamico por quien llama (`await import('@esr/reports/catalog')`),
// nunca estatico: `exceljs` pesa y `wb.xlsx.writeBuffer()` no tiene por que
// estar en el bundle inicial de ninguna de las dos apps.
import ExcelJS from 'exceljs/dist/exceljs.min.js';

/**
 * El libro de Excel del catalogo. FILAS PLANAS —categoria y subcategoria
 * repetidas en cada fila— y no celdas combinadas: a diferencia del PDF, aqui
 * el objetivo es poder filtrar y ordenar en la propia hoja, y una celda
 * combinada se lo impide a quien abra el archivo.
 *
 * @param {Array<{code:string,name:string,uom:string,price:number,categoryName:string,subcategoryName:string}>} rows
 */
export async function generateCatalogWorkbook(rows = []) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Catálogo');
  sheet.columns = [
    { header: 'Categoría', key: 'categoryName', width: 22 },
    { header: 'Subcategoría', key: 'subcategoryName', width: 22 },
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Ítem', key: 'name', width: 42 },
    { header: 'Unidad', key: 'uom', width: 10 },
    { header: 'Precio de renta', key: 'price', width: 16 }
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
  sheet.getColumn('price').numFmt = '#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  return { blob, filename: 'catalogo-productos.xlsx' };
}
