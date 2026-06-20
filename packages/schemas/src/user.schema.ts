import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type UserRole = 'admin' | 'operador' | 'almacen' | string;
export type UserStatus = 'active' | 'inactive' | 'invited';

export type User = {
	id?: Nullable<ESRId>;
	username?: string;
	email?: string;
	password_hash?: string;
	/** Desktop-only legacy credential input. ESR Cloud must use password_hash. */
	password?: string;
	name: string;
	role?: UserRole;
	is_active?: number;
	status?: UserStatus;
	created_at?: string;
	updated_at?: string;
};

export function validateUserInput(user: Pick<User, 'username' | 'name' | 'password'>, options: { isEditing?: boolean } = {}): ValidationResult {
	const hasPasswordWhenRequired = options.isEditing || isPresent(user.password);
	return isPresent(user.username) && isPresent(user.name) && hasPasswordWhenRequired
		? valid()
		: invalid('user.required_fields');
}
export function validateCloudUserInput(
	user: Pick<User, 'email' | 'name' | 'password_hash'>
): ValidationResult {
	return isPresent(user.email) && isPresent(user.name) && isPresent(user.password_hash)
		? valid()
		: invalid('cloud_user.required_fields');
}
