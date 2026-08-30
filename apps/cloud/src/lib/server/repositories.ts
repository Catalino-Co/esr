import {
	PostgresAuditLogRepository,
	PostgresCategoryRepository,
	PostgresCollaboratorRepository,
	PostgresChecklistRepository,
	PostgresCompanySettingsRepository,
	PostgresConduceRepository,
	PostgresCustomerRepository,
	PostgresDashboardRepository,
	PostgresEventTypeRepository,
	PostgresEventRepository,
	PostgresIncidentRepository,
	PostgresInventoryRepository,
	PostgresInvoiceRepository,
	PostgresMemberRepository,
	PostgresPackageRepository,
	PostgresPaymentRepository,
	PostgresQuoteRepository,
	PostgresRentalRepository,
	PostgresSerialRepository,
	PostgresStockMovementRepository,
	PostgresSupplierRepository,
	PostgresSubcategoryRepository,
	InvoiceService,
	QuoteConversionService,
	getCompanyDocumentInfo,
	WorkOrderOperationsService
} from '@esr/db-postgres';

let customerRepository: PostgresCustomerRepository | null = null;
let dashboardRepository: PostgresDashboardRepository | null = null;
let inventoryRepository: PostgresInventoryRepository | null = null;
let eventRepository: PostgresEventRepository | null = null;
let categoryRepository: PostgresCategoryRepository | null = null;
let subcategoryRepository: PostgresSubcategoryRepository | null = null;
let quoteRepository: PostgresQuoteRepository | null = null;
let rentalRepository: PostgresRentalRepository | null = null;
let quoteConversionService: QuoteConversionService | null = null;
let conduceRepository: PostgresConduceRepository | null = null;
let checklistRepository: PostgresChecklistRepository | null = null;
let incidentRepository: PostgresIncidentRepository | null = null;
let stockMovementRepository: PostgresStockMovementRepository | null = null;
let workOrderOperationsService: WorkOrderOperationsService | null = null;
let auditLogRepository: PostgresAuditLogRepository | null = null;
let companySettingsRepository: PostgresCompanySettingsRepository | null = null;
let memberRepository: PostgresMemberRepository | null = null;
let eventTypeRepository: PostgresEventTypeRepository | null = null;
let supplierRepository: PostgresSupplierRepository | null = null;
let collaboratorRepository: PostgresCollaboratorRepository | null = null;
let invoiceRepository: PostgresInvoiceRepository | null = null;
let invoiceService: InvoiceService | null = null;
let paymentRepository: PostgresPaymentRepository | null = null;
let packageRepository: PostgresPackageRepository | null = null;
let serialRepository: PostgresSerialRepository | null = null;

export function getCustomerRepository(): PostgresCustomerRepository {
	if (!customerRepository) customerRepository = new PostgresCustomerRepository();
	return customerRepository;
}

export function getDashboardRepository(): PostgresDashboardRepository {
	if (!dashboardRepository) dashboardRepository = new PostgresDashboardRepository();
	return dashboardRepository;
}

export function getInventoryRepository(): PostgresInventoryRepository {
	if (!inventoryRepository) inventoryRepository = new PostgresInventoryRepository();
	return inventoryRepository;
}

export function getEventRepository(): PostgresEventRepository {
	if (!eventRepository) eventRepository = new PostgresEventRepository();
	return eventRepository;
}

export function getCategoryRepository(): PostgresCategoryRepository {
	if (!categoryRepository) categoryRepository = new PostgresCategoryRepository();
	return categoryRepository;
}

export function getSubcategoryRepository(): PostgresSubcategoryRepository {
	if (!subcategoryRepository) subcategoryRepository = new PostgresSubcategoryRepository();
	return subcategoryRepository;
}

export function getQuoteRepository(): PostgresQuoteRepository {
	if (!quoteRepository) quoteRepository = new PostgresQuoteRepository();
	return quoteRepository;
}

export function getRentalRepository(): PostgresRentalRepository {
	if (!rentalRepository) rentalRepository = new PostgresRentalRepository();
	return rentalRepository;
}

export function getQuoteConversionService(): QuoteConversionService {
	if (!quoteConversionService) quoteConversionService = new QuoteConversionService();
	return quoteConversionService;
}

export function getConduceRepository(): PostgresConduceRepository {
	if (!conduceRepository) conduceRepository = new PostgresConduceRepository();
	return conduceRepository;
}

export function getChecklistRepository(): PostgresChecklistRepository {
	if (!checklistRepository) checklistRepository = new PostgresChecklistRepository();
	return checklistRepository;
}

export function getIncidentRepository(): PostgresIncidentRepository {
	if (!incidentRepository) incidentRepository = new PostgresIncidentRepository();
	return incidentRepository;
}

export function getStockMovementRepository(): PostgresStockMovementRepository {
	if (!stockMovementRepository) stockMovementRepository = new PostgresStockMovementRepository();
	return stockMovementRepository;
}

export function getWorkOrderOperationsService(): WorkOrderOperationsService {
	if (!workOrderOperationsService) workOrderOperationsService = new WorkOrderOperationsService();
	return workOrderOperationsService;
}

export function getAuditLogRepository(): PostgresAuditLogRepository {
	if (!auditLogRepository) auditLogRepository = new PostgresAuditLogRepository();
	return auditLogRepository;
}

export function getCompanySettingsRepository(): PostgresCompanySettingsRepository {
	if (!companySettingsRepository) companySettingsRepository = new PostgresCompanySettingsRepository();
	return companySettingsRepository;
}

export function getMemberRepository(): PostgresMemberRepository {
	if (!memberRepository) memberRepository = new PostgresMemberRepository();
	return memberRepository;
}

export function getEventTypeRepository(): PostgresEventTypeRepository {
	if (!eventTypeRepository) eventTypeRepository = new PostgresEventTypeRepository();
	return eventTypeRepository;
}

export function getSupplierRepository(): PostgresSupplierRepository {
	if (!supplierRepository) supplierRepository = new PostgresSupplierRepository();
	return supplierRepository;
}

export function getCollaboratorRepository(): PostgresCollaboratorRepository {
	if (!collaboratorRepository) collaboratorRepository = new PostgresCollaboratorRepository();
	return collaboratorRepository;
}

export function getInvoiceRepository(): PostgresInvoiceRepository {
	if (!invoiceRepository) invoiceRepository = new PostgresInvoiceRepository();
	return invoiceRepository;
}

export function getInvoiceService(): InvoiceService {
	if (!invoiceService) invoiceService = new InvoiceService();
	return invoiceService;
}

export function getPaymentRepository(): PostgresPaymentRepository {
	if (!paymentRepository) paymentRepository = new PostgresPaymentRepository();
	return paymentRepository;
}

export function getPackageRepository(): PostgresPackageRepository {
	if (!packageRepository) packageRepository = new PostgresPackageRepository();
	return packageRepository;
}

export function getSerialRepository(): PostgresSerialRepository {
	if (!serialRepository) serialRepository = new PostgresSerialRepository();
	return serialRepository;
}

export { getCompanyDocumentInfo };
