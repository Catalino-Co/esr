-- El rol `owner` desaparece. Era `admin` con otro nombre.
--
-- No es una opinion: `packages/core/src/authorization/permissions.ts` les
-- asignaba EL MISMO ARRAY, por referencia —`owner: ADMIN_PERMISSIONS,
-- admin: ADMIN_PERMISSIONS`—, o sea los 51 permisos a cada uno. La pantalla de
-- Roles ya lo decia en voz alta: «Propietario — 51 permisos — Mismos permisos
-- que Administrador». Lo unico que `owner` aportaba eran guardas de mutacion:
-- no era asignable y era intocable.
--
-- EL ORDEN DE ESTA MIGRACION NO ES NEGOCIABLE.
--
-- Primero los datos, despues la restriccion. Al reves, una fila con
-- `role = 'owner'` sobrevive a un CHECK que ya no la admite; y en la capa de
-- TypeScript el fallo es todavia mas silencioso, porque `locals.role` es
-- `string` sin estrechar: `isCompanyRole('owner')` pasaria a `false`,
-- `permissionsForRole()` devolveria `[]` y el propietario se quedaria sin los 51
-- permisos SIN UN SOLO AVISO.

-- ── 1. Los datos ─────────────────────────────────────────────────────────
UPDATE company_members SET role = 'admin', updated_at = NOW() WHERE role = 'owner';

-- ── 2. Fuera la restriccion vieja ────────────────────────────────────────
--
-- El CHECK se declaro EN LINEA y sin nombre en la migracion 002, asi que quien
-- lo bautizo fue PostgreSQL con su convencion `<tabla>_<columna>_check`. El
-- `IF EXISTS` cubre el caso de que alguna instalacion lo tenga con otro nombre:
-- ahi esta migracion no falla, y el CHECK nuevo se añade igual.
ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_role_check;

-- ── 3. La nueva, ya sin `owner` ──────────────────────────────────────────
--
-- Esta vez CON NOMBRE explicito, para que la siguiente que necesite tocarla no
-- dependa de adivinar como la llamo PostgreSQL.
ALTER TABLE company_members
	ADD CONSTRAINT company_members_role_check
	CHECK (role IN ('admin', 'manager', 'staff', 'viewer'));
