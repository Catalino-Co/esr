import { json } from '@sveltejs/kit';
import { validateCustomerInput } from '@esr/schemas';

export function GET() {
	const validCustomer = validateCustomerInput({ name: 'Cliente Demo Cloud' });
	const invalidCustomer = validateCustomerInput({ name: '' });

	return json({
		package: '@esr/schemas',
		entity: 'Customer',
		results: {
			validCustomer,
			invalidCustomer
		}
	});
}

