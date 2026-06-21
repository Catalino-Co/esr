export type AuthUser = {
	id: number;
	name: string;
	email: string;
	status: string;
};

export type AuthCompany = {
	id: string;
	name: string;
	slug: string;
	status: string;
};

export type AuthMembership = {
	id: string;
	companyId: string;
	userId: number;
	role: string;
	status: string;
};

export type AuthSession = {
	id: string;
	userId: number;
	activeCompanyId: string | null;
	expiresAt: string;
};

export type SessionContext = {
	user: AuthUser;
	session: AuthSession;
	company: AuthCompany | null;
	membership: AuthMembership | null;
	role: string | null;
	companyId: string | null;
};
