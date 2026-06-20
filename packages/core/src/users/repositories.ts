import type { ESRId, User } from '@esr/schemas';

export interface UserRepository {
	findById(id: ESRId): Promise<User | null>;
	findByUsername(username: string): Promise<User | null>;
	create(data: User): Promise<User>;
	update(id: ESRId, data: User): Promise<User>;
	setActive(id: ESRId, isActive: number): Promise<void>;
}
