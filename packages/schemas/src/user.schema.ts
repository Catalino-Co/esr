import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type UserRole = 'admin' | 'operador' | 'almacen' | string;

export type User = {
	id?: Nullable<ESRId>;
	username: string;
	password?: string;
	name: string;
	role?: UserRole;
	is_active?: number;
};

export function validateUserInput(user: Pick<User, 'username' | 'name' | 'password'>, options: { isEditing?: boolean } = {}): ValidationResult {
	const hasPasswordWhenRequired = options.isEditing || isPresent(user.password);
	return isPresent(user.username) && isPresent(user.name) && hasPasswordWhenRequired
		? valid()
		: invalid('user.required_fields');
}
