/**
 * ESR Pro adopta los roles de Cloud.
 *
 * Tenia una lista propia de tres —`admin`, `operador`, `almacen`— que no
 * coincidia con la de Cloud en nada salvo el primero. Y no era un modelo: era
 * un ROTULO. No habia un solo `if` sobre el rol en toda la app, asi que un
 * usuario de almacen veia y podia hacer exactamente lo mismo que un
 * administrador, incluida la pantalla de usuarios.
 *
 * Traduccion:
 *
 *   admin    -> admin     (ya coincidia)
 *   operador -> staff     el rol de operacion diaria
 *   almacen  -> staff     su matiz era «solo checklist», y `checklists.save` es
 *                         justo un permiso de `staff`. Mandarlo a `viewer` le
 *                         quitaria lo unico que su nombre dice que hace.
 *
 * NO hace falta tocar ninguna restriccion: `users.role` es `TEXT` libre, sin
 * CHECK y sin clave ajena. Y no hay usuarios sembrados —el primero lo crea el
 * arranque inicial—, asi que en una instalacion real esto no mueve nada o
 * mueve las pocas filas creadas a mano.
 *
 * El `DEFAULT 'admin'` de la columna se deja como esta: cambiarlo en SQLite
 * obliga a recrear la tabla, y no gobierna nada porque los dos caminos que
 * insertan usuarios —el arranque inicial y `createUser`— mandan el rol siempre.
 */
module.exports = {
  version: '0013',
  name: 'role_alignment',
  async up({ runQuery, getQuery }) {
    const antes = await getQuery(
      "SELECT role, COUNT(*) AS n FROM users WHERE role IN ('operador', 'almacen') GROUP BY role"
    );
    if (antes.length) {
      console.log(
        '[db-sqlite] 0013: roles a traducir ->',
        antes.map((f) => `${f.role}: ${f.n}`).join(', ')
      );
    }

    await runQuery("UPDATE users SET role = 'staff' WHERE role IN ('operador', 'almacen')");
  }
};
