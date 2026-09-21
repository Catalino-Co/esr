const { getQuery, getSingleQuery, runQuery, withTransaction } = require('./db/index.cjs');

/**
 * Exportar / Importar catálogos › IMPORTACIÓN.
 *
 * La EXPORTACION no pasa por aquí: cada pantalla de Ajustes ya sabe leer su
 * propio catálogo por `window.api.db.get`, y la portada de exportar/importar
 * hace lo mismo con esas mismas consultas.
 *
 * La IMPORTACION sí necesita un canal de proceso principal: son varias filas
 * por entidad, cada una con su propio chequeo de duplicados, y deben quedar
 * TODAS dentro o TODAS fuera. Desde el renderer cada `window.api.db.run` es
 * una invocación IPC suelta —igual que explica la cabecera de
 * `sqlite-quote.repository.cjs`—, así que aquí sí hace falta `withTransaction`,
 * que solo existe en este proceso.
 *
 * Contrato de retorno calcado de `invoices.cjs`/`quotes.cjs`: nunca lanza,
 * siempre `{ ok: true, data }` / `{ ok: false, error }`, porque
 * `ipcRenderer.invoke` antepone «Error invoking remote method 'x': Error: »
 * a cualquier Error lanzado y aquí el mensaje SÍ es la interfaz.
 */
function envolver(fn) {
  return async (...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return { ok: false, error: String(error?.message || 'Error inesperado.') };
    }
  };
}

function normalizar(valor) {
  return String(valor ?? '').trim().toLowerCase();
}

async function importarSimple(tabla, columnas, rows) {
  const resultado = { agregados: 0, omitidos: 0, errores: [] };
  for (const row of rows || []) {
    try {
      const existente = await getSingleQuery(
        `SELECT id FROM ${tabla} WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))`,
        [row.name]
      );
      if (existente) {
        resultado.omitidos++;
        continue;
      }
      const marcadores = columnas.map(() => '?').join(', ');
      await runQuery(
        `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})`,
        columnas.map((col) => row[col])
      );
      resultado.agregados++;
    } catch (error) {
      resultado.errores.push(`«${row?.name ?? ''}»: ${error?.message || 'error desconocido'}`);
    }
  }
  return resultado;
}

function importEventTypes(rows) {
  const filas = (rows || []).map((row) => ({
    name: row.name,
    color: row.color || '#6366f1',
    description: row.description ?? null,
    is_active: row.is_active ?? 1
  }));
  return importarSimple('event_types', ['name', 'color', 'description', 'is_active'], filas);
}

function importUnitsOfMeasure(rows) {
  const filas = (rows || []).map((row) => ({
    name: row.name,
    abbr: row.abbr ?? null,
    is_active: row.is_active ?? 1
  }));
  return importarSimple('units_of_measure', ['name', 'abbr', 'is_active'], filas);
}

function importCommercialSectors(rows) {
  const filas = (rows || []).map((row) => ({
    name: row.name,
    description: row.description ?? null,
    is_active: row.is_active ?? 1
  }));
  return importarSimple('commercial_sectors', ['name', 'description', 'is_active'], filas);
}

/**
 * Categorías. Además del resumen, devuelve el mapa nombre→id de lo que
 * ACABA de insertar, para que las subcategorías puedan resolver contra una
 * categoría llegada en el mismo archivo sin depender de una segunda vuelta.
 */
async function importCategories(rows) {
  const resultado = { agregados: 0, omitidos: 0, errores: [] };
  const idsInsertados = new Map();
  for (const row of rows || []) {
    try {
      const existente = await getSingleQuery(
        'SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
        [row.name]
      );
      if (existente) {
        resultado.omitidos++;
        continue;
      }
      const insertado = await runQuery('INSERT INTO categories (name, color, is_active) VALUES (?, ?, ?)', [
        row.name,
        row.color || '#6366f1',
        row.is_active ?? 1
      ]);
      resultado.agregados++;
      idsInsertados.set(normalizar(row.name), insertado.id);
    } catch (error) {
      resultado.errores.push(`«${row?.name ?? ''}»: ${error?.message || 'error desconocido'}`);
    }
  }
  return { resultado, idsInsertados };
}

/** Mapa nombre→id de TODAS las categorías que hay ahora mismo en este equipo. */
async function mapaCategorias() {
  const filas = await getQuery('SELECT id, name FROM categories');
  return new Map(filas.map((c) => [normalizar(c.name), c.id]));
}

async function importSubcategories(rows, mapaCategoriaId) {
  const resultado = { agregados: 0, omitidos: 0, errores: [] };
  for (const row of rows || []) {
    const categoryId = mapaCategoriaId.get(normalizar(row.category_name));
    if (!categoryId) {
      resultado.errores.push(
        `La categoría «${row.category_name}» no existe: se omitió la subcategoría «${row.name}».`
      );
      continue;
    }
    try {
      const existente = await getSingleQuery(
        'SELECT id FROM subcategories WHERE category_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))',
        [categoryId, row.name]
      );
      if (existente) {
        resultado.omitidos++;
        continue;
      }
      await runQuery('INSERT INTO subcategories (category_id, name, is_active) VALUES (?, ?, ?)', [
        categoryId,
        row.name,
        row.is_active ?? 1
      ]);
      resultado.agregados++;
    } catch (error) {
      resultado.errores.push(`«${row?.name ?? ''}»: ${error?.message || 'error desconocido'}`);
    }
  }
  return resultado;
}

// Categorías ANTES que subcategorías: estas ultimas resuelven la categoría
// por nombre, y pueden llegar en el mismo archivo.
const ORDEN = ['event_types', 'units_of_measure', 'commercial_sectors', 'categories', 'subcategories'];

async function importCatalogsInner(catalogos) {
  const entrada = catalogos && typeof catalogos === 'object' ? catalogos : {};

  return await withTransaction(async () => {
    const salida = {};
    let mapaCategoriaId = null;

    for (const key of ORDEN) {
      const rows = entrada[key];
      if (!Array.isArray(rows)) continue;

      if (key === 'event_types') {
        salida.event_types = await importEventTypes(rows);
      } else if (key === 'units_of_measure') {
        salida.units_of_measure = await importUnitsOfMeasure(rows);
      } else if (key === 'commercial_sectors') {
        salida.commercial_sectors = await importCommercialSectors(rows);
      } else if (key === 'categories') {
        const { resultado, idsInsertados } = await importCategories(rows);
        salida.categories = resultado;
        // El requery ya ve, dentro de esta misma transacción, tanto lo que
        // ya existía como lo recién insertado; el merge con `idsInsertados`
        // es una red de seguridad adicional, no el camino principal.
        mapaCategoriaId = await mapaCategorias();
        for (const [nombre, id] of idsInsertados) mapaCategoriaId.set(nombre, id);
      } else if (key === 'subcategories') {
        if (!mapaCategoriaId) mapaCategoriaId = await mapaCategorias();
        salida.subcategories = await importSubcategories(rows, mapaCategoriaId);
      }
    }

    return salida;
  });
}

module.exports = {
  importCatalogs: envolver(importCatalogsInner)
};
