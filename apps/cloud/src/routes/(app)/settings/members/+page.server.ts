import { fail } from '@sveltejs/kit';
import { ASSIGNABLE_ROLES, isOwnerRole } from '@esr/core';
import type { CompanyRole } from '@esr/schemas';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getMemberRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudMemberInput } from '$lib/server/validators';

/** Roles que conservan el control de la empresa; nunca deben quedar en cero. */
const PRIVILEGED_ROLES: CompanyRole[] = ['owner', 'admin'];

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
	const companyId = locals.companyId as string;
	const member = await getMemberRepository().findById(toTenantContext(companyId), memberId);
	if (!member) return { member: null, error: 'Miembro no encontrado.' };
	if (isOwnerRole(member.role)) return { member, error: 'El propietario de la empresa no puede modificarse.' };
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

	updateRole: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.members.manage');
		const form = await request.formData();
		const memberId = String(form.get('member_id') ?? '').trim();
		const role = String(form.get('role') ?? '').trim();

		if (!ASSIGNABLE_ROLES.includes(role as CompanyRole)) {
			return fail(400, { error: 'Seleccione un rol válido.' });
		}

		const { member, error: guard } = await assertMutable(locals, memberId);
		if (guard) return fail(400, { error: guard });
		if (!member) return fail(404, { error: 'Miembro no encontrado.' });

		const losesAdmin =
			!PRIVILEGED_ROLES.includes(role as CompanyRole) &&
			(await wouldLoseLastAdmin(companyId, member));
		if (losesAdmin) {
			return fail(400, { error: 'La empresa debe conservar al menos un administrador activo.' });
		}

		const updated = await getMemberRepository().updateRole(
			toTenantContext(companyId),
			memberId,
			role as CompanyRole
		);

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'settings.member.role_changed',
			entity_type: 'company_member',
			entity_id: memberId,
			description: `Rol de ${updated.user_email}: ${member.role} → ${role}`
		});

		return { success: `Rol de ${updated.user_name} actualizado.` };
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
		if (!member) return fail(404, { error: 'Miembro no encontrado.' });

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
