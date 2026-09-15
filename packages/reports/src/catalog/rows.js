/**
 * Aplana una fila de `listCatalog`/la consulta SQL de Desktop al vocabulario
 * de pantalla del reporte "Catálogo de productos".
 */
export function createCatalogReportRows(items = []) {
  return items.map((item) => ({
    id: item.id,
    code: item.internal_code || '',
    name: item.name || '',
    uom: item.uom_abbr || '—',
    price: Number(item.rental_price ?? 0),
    categoryName: item.category_name || 'Sin categoría',
    subcategoryName: item.subcategory_name || 'Sin subcategoría'
  }));
}

/**
 * Agrupa filas YA ORDENADAS (categoria, subcategoria, nombre) en un arbol
 * categoria -> subcategoria -> items. No reordena: confia en el `ORDER BY`
 * de quien llama (la consulta SQL de cada app).
 */
export function groupCatalogRows(rows = []) {
  const categories = [];
  let currentCat = null;
  let currentSub = null;

  for (const row of rows) {
    if (!currentCat || currentCat.categoryName !== row.categoryName) {
      currentCat = { categoryName: row.categoryName, subcategories: [] };
      categories.push(currentCat);
      currentSub = null;
    }
    if (!currentSub || currentSub.subcategoryName !== row.subcategoryName) {
      currentSub = { subcategoryName: row.subcategoryName, items: [] };
      currentCat.subcategories.push(currentSub);
    }
    currentSub.items.push(row);
  }
  return categories;
}
