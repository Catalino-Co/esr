import type { CreateCustomerInput, CustomerRepository } from '@esr/core';
import type { Customer, ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export class PostgresCustomerRepository implements CustomerRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(id: ESRId): Promise<Customer | null> {
		const result = await this.pool.query<Customer>('SELECT * FROM clients WHERE id = $1', [id]);
		return result.rows[0] ?? null;
	}

	async create(data: CreateCustomerInput): Promise<Customer> {
		const result = await this.pool.query<Customer>(
			`INSERT INTO clients
				(name, document_id, phone, email, address, contact_person, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING *`,
			[
				data.name,
				data.document_id || null,
				data.phone || null,
				data.email || null,
				data.address || null,
				data.contact_person || null,
				data.notes || null,
				data.is_active ?? 1
			]
		);

		return result.rows[0];
	}

	async update(id: ESRId, data: Partial<Customer>): Promise<Customer> {
		const current = await this.findById(id);
		if (!current) throw new Error(`Customer ${id} not found.`);

		const next = { ...current, ...data };
		const result = await this.pool.query<Customer>(
			`UPDATE clients SET
				name = $1,
				document_id = $2,
				phone = $3,
				email = $4,
				address = $5,
				contact_person = $6,
				notes = $7,
				is_active = $8
			 WHERE id = $9
			 RETURNING *`,
			[
				next.name,
				next.document_id || null,
				next.phone || null,
				next.email || null,
				next.address || null,
				next.contact_person || null,
				next.notes || null,
				next.is_active ?? 1,
				id
			]
		);

		return result.rows[0];
	}
}

