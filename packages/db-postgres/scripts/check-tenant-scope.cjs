const fs = require('node:fs');
const path = require('node:path');

const repositoryDir = path.join(__dirname, '..', 'src', 'repositories');
const files = [
  'postgres-customer.repository.ts',
  'postgres-event.repository.ts',
  'postgres-inventory.repository.ts',
  'postgres-rental.repository.ts'
];

for (const file of files) {
  const source = fs.readFileSync(path.join(repositoryDir, file), 'utf8');
  if (!source.includes('requireCompanyId(ctx)')) {
    throw new Error(`${file} does not require company context.`);
  }
  if (!source.includes('company_id')) {
    throw new Error(`${file} does not scope SQL by company_id.`);
  }
  if (/WHERE\s+id\s*=\s*\$1/i.test(source)) {
    throw new Error(`${file} contains an id-only lookup without company_id.`);
  }
}

console.log(`Tenant scope guard passed for ${files.length} PostgreSQL repositories.`);
