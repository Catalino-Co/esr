-- Los seriales sin almacen, al principal.
--
-- La 019 puso en 'PRIN' los seriales que existian entonces, pero el alta de
-- seriales nunca escribio `warehouse_id`: todo el que se dio de alta despues
-- quedo en NULL. Y como el inventario cuenta las unidades de un almacen con
-- `s.warehouse_id = $n`, esas unidades no se contaban en NINGUNO —salian en
-- cero en todos los almacenes— mientras el total de la empresa si las veia.
-- Dos pantallas diciendo cosas distintas del mismo articulo.
--
-- Se reparan aqui y se cierra la fuente en el mismo cambio: `create` pasa a
-- exigir el almacen. La columna se queda NULLABLE a proposito: una empresa sin
-- almacenes no podria dar de alta ni una unidad si fuera NOT NULL, y el sitio
-- de esa regla es la pantalla, que ya obliga a crear un almacen antes.
WITH principal AS (
	SELECT DISTINCT ON (company_id) company_id, id
	FROM warehouses
	WHERE is_active = 1
	ORDER BY company_id, CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, name
)
UPDATE item_serials s
SET warehouse_id = principal.id
FROM principal
WHERE principal.company_id = s.company_id AND s.warehouse_id IS NULL;
