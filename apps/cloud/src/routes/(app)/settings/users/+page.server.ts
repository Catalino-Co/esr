import { fail } from '@sveltejs/kit';
import { ASSIGNABLE_ROLES, isOwnerRole } from '@esr/core';
import type { CompanyRole, MemberStatus } from '@esr/schemas';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getMemberRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudMemberInput, validateCloudUserInput } from '$lib/server/validators';

/** Roles que conservan el control de la empresa; nunca deben quedar en cero. */
const PRIVILEGED_ROLES: CompanyRole[] = ['owner', 'admin'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId, user } = requirePermission(locals, 'settings.members.manage');
	const members = await getMemberRepository().list(toTenantContext(companyId));

	return {
		members,
		assignableRoles: ASSIGNABLE_ROLES,
		currentUserId: user.id
	};
};

/**
 * Un admin no puede tocar al `owner` ni degradarse a si mismo si con eso la
 * empresa se queda sin nadie que pueda administrarla.
 */
async function assertMutable(
	locals: App.Locals,
	memberId: string
): Promise<{ member: Awaited<ReturnType<ReturnType<typeof getMemberRepository>['findById']>>; error?: string }> {
	// `company_members.id` es UUID: un id con otra forma hace que PostgreSQL
	// lance `invalid input syntax`, que sale al usuario como un 500. Se corta
	// antes de consultar, que es lo que espera un POST manipulado.
	if (!UUID.test(memberId)) return { member: null, error: 'Usuario no encontrado.' };

	const companyId = locals.companyId as string;
	const member = await getMemberRepository().findById(toTenantContext(companyId), memberId);
	if (!member) return { member: null, error: 'Usuario no encontrado.' };
	if (isOwnerRole(member.role)) {
		return { member, error: 'El propietario de la empresa no puede modificarse.' };
	}
	return { member };
}

async function wouldLoseLastAdmin(
	companyId: string,
	member: { role: string; status: string }
): Promise<boolean> {
	if (!PRIVILEGED_ROLES.includes(member.role as CompanyRole) || member.status !== 'active') return false;
	const remaining = await getMemberRepository().countActiveByRole(
		toTenantContext(companyId),
		PRIVILEGED_ROLES
	);
	return remaining <= 1;
}

export const actions: Actions = {
	invite: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.members.manage');
		const form = await request.formData();

		const values = {
			email: String(form.get('email') ?? '').trim(),
			role: String(form.get('role') ?? '').trim()
		};

		const errors = validateCloudMemberInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		const repository = getMemberRepository();
		const ctx = toTenantContext(companyId);

		const existing = await repository.findByEmail(ctx, values.email);
		if (existing && existing.status === 'active') {
			return fail(400, { error: 'Ese usuario ya es miembro activo de la empresa.', values });
		}

		// No se crean identidades desde aqui: la cuenta global debe existir y
		// tener su propio password_hash. Alta de usuarios nuevos es otra fase.
		const account = await repository.findGlobalUserByEmail(values.email);
		if (!account) {
			return fail(404, {
				error: 'No existe una cuenta con ese email. El usuario debe registrarse antes de ser invitado.',
				values
			});
		}

		const member = await repository.add(ctx, account.id, values.role as CompanyRole);

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'settings.member.added',
			entity_type: 'company_member',
			entity_id: member.id,
			description: `Miembro agregado: ${member.user_email} como ${member.role}`
		});

		return { success: `${member.user_name} ahora es miembro de la empresa.` };
	},

	updateMember: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.members.manage');
		const form = await request.formData();
		const memberId = String(form.get('member_id') ?? '').trim();
		const values = {
			name: String(form.get('name') ?? '').trim(),
			email: String(form.get('email') ?? '').trim(),
			role: String(form.get('role') ?? '').trim(),
			status: String(form.get('status') ?? '').trim()
		};

		if (!ASSIGNABLE_ROLES.includes(values.role as CompanyRole)) {
			return fail(400, { error: 'Seleccione un rol válido.', values });
		}
		if (values.status !== 'active' && values.status !== 'inactive') {
			return fail(400, { error: 'Estado no válido.', values });
		}

		const errors = validateCloudUserInput(values);
		if (errors.length) {
			return fail(400, {
				error: firstFormError(errors),
				fieldErrors: formErrorsToObject(errors),
				values
			});
		}

		const { member, error: guard } = await assertMutable(locals, memberId);
		if (guard) return fail(400, { error: guard, values });
		if (!member) return fail(404, { error: 'Usuario no encontrado.', values });

		// Perder al ultimo administrador se comprueba contra el estado FINAL:
		// degradar el rol y desactivar son dos formas de quedarse sin ninguno.
		const dejaDeMandar =
			!PRIVILEGED_ROLES.includes(values.role as CompanyRole) || values.status !== 'active';
		if (dejaDeMandar && (await wouldLoseLastAdmin(companyId, member))) {
			return fail(400, {
				error: 'La empresa debe conservar al menos un administrador activo.',
				values
			});
		}

		const ctx = toTenantContext(companyId);
		const repository = getMemberRepository();

		// Primero la cuenta global, que es lo que puede chocar con el UNIQUE.
		const cuenta = await repository.updateAccount(ctx, memberId, {
			name: values.name,
			email: values.email
		});
		if ('emailEnUso' in cuenta) {
			return fail(400, {
				error: 'Ese email ya pertenece a otra cuenta.',
				fieldErrors: { email: 'Ese email ya pertenece a otra cuenta.' },
				values
			});
		}

		if (member.role !== values.role) {
			await repository.updateRole(ctx, memberId, values.role as CompanyRole);
		}
		if (member.status !== values.status) {
			await repository.updateStatus(ctx, memberId, values.status as MemberStatus);
		}

		const cambios = [
			member.user_name !== values.name ? `nombre: ${member.user_name} → ${values.name}` : null,
			member.user_email !== values.email ? `email: ${member.user_email} → ${values.email}` : null,
			member.role !== values.role ? `rol: ${member.role} → ${values.role}` : null,
			member.status !== values.status ? `estado: ${member.status} → ${values.status}` : null
		].filter(Boolean);

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'settings.member.updated',
			entity_type: 'company_member',
			entity_id: memberId,
			description: `Usuario ${values.email} actualizado (${cambios.join(', ') || 'sin cambios'})`
		});

		return { success: `${values.name} se actualizó correctamente.` };
	},

	setStatus: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.members.manage');
		const form = await request.formData();
		const memberId = String(form.get('member_id') ?? '').trim();
		const status = String(form.get('status') ?? '').trim();

		if (status !== 'active' && status !== 'inactive') {
			return fail(400, { error: 'Estado no válido.' });
		}

		const { member, error: guard } = await assertMutable(locals, memberId);
		if (guard) return fail(400, { error: guard });
		if (!member) return fail(404, { error: 'Usuario no encontrado.' });

		if (status === 'inactive' && (await wouldLoseLastAdmin(companyId, member))) {
			return fail(400, { error: 'La empresa debe conservar al menos un administrador activo.' });
		}

		const updated = await getMemberRepository().updateStatus(
			toTenantContext(companyId),
			memberId,
			status
		);

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: status === 'active' ? 'settings.member.reactivated' : 'settings.member.deactivated',
			entity_type: 'company_member',
			entity_id: memberId,
			description: `Miembro ${updated.user_email} → ${status}`
		});

		return {
			success:
				status === 'active'
					? `${updated.user_name} fue reactivado.`
					: `${updated.user_name} fue desactivado.`
		};
	}
};
