import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

/**
 * Un Servicio: algo vendible que no es un articulo de inventario (una
 * Maestria de Ceremonias, vestirse de Santa...). A diferencia de un Paquete,
 * no agrupa articulos ni se "explota" en lineas al cotizarlo: viaja como
 * linea propia, con su propio precio.
 *
 * No es tangible: no participa de Entrega, Devolucion ni Cierre de orden, ni
 * genera movimiento de inventario. Por eso no tiene almacen, unidad de
 * medida ni seriales -a diferencia de un Articulo-.
 */
export type Service = {
	id?: Nullable<ESRId>;
	company_id?: string;
	name: string;
	price?: number;
	notes?: Nullable<string>;
	is_active?: number;
	created_at?: string;
	updated_at?: Nullable<string>;
};

export function validateServiceInput(service: Pick<Service, 'name' | 'price'>): ValidationResult {
	if (!isPresent(service.name)) return invalid('service.name.required');
	if (service.price != null) {
		const price = Number(service.price);
		if (!Number.isFinite(price) || price < 0) return invalid('service.price.invalid');
	}
	return valid();
}
