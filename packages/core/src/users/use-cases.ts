import { validateUserInput, type User } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export function validateUserDraft(input: User, options: { isEditing?: boolean } = {}): UseCaseResult<User> {
	const validation = validateUserInput(input, options);
	return validation.valid ? ok(input) : fail(validation.issues[0] || 'user.invalid');
}

export function canDeactivateUser(input: { currentUserId?: unknown; targetUserId: unknown }): boolean {
	return String(input.currentUserId ?? '') !== String(input.targetUserId ?? '');
}

