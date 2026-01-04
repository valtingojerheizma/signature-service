import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export default async function RulesPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  const rules = tenantId
    ? await prisma.assignmentRule.findMany({
        where: { tenantId },
        orderBy: [{ type: 'asc' }, { priority: 'desc' }],
        include: {
          template: true,
          employee: true,
        },
      })
    : [];

  const groupedRules = {
    TENANT_DEFAULT: rules.filter((r) => r.type === 'TENANT_DEFAULT'),
    ORG_UNIT: rules.filter((r) => r.type === 'ORG_UNIT'),
    USER_OVERRIDE: rules.filter((r) => r.type === 'USER_OVERRIDE'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignment Rules</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure which templates are assigned to which employees.
          </p>
        </div>
        <Link href="/dashboard/rules/new" className="btn-primary">
          Create Rule
        </Link>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800">Rule Priority</h3>
        <p className="mt-1 text-sm text-blue-700">
          Rules are applied in this order: User Override → Org Unit (most specific) →
          Tenant Default
        </p>
      </div>

      {/* Tenant Default */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-medium text-gray-900">Tenant Default</h2>
          <p className="text-sm text-gray-500">
            Fallback template for all employees without a more specific rule
          </p>
        </div>
        <div className="divide-y divide-gray-200">
          {groupedRules.TENANT_DEFAULT.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No default rule configured. All employees need a matching org unit or user
              override rule.
            </div>
          ) : (
            groupedRules.TENANT_DEFAULT.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))
          )}
        </div>
      </div>

      {/* Org Unit Rules */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-medium text-gray-900">Org Unit Rules</h2>
          <p className="text-sm text-gray-500">
            Templates assigned based on organizational unit path
          </p>
        </div>
        <div className="divide-y divide-gray-200">
          {groupedRules.ORG_UNIT.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No org unit rules configured.
            </div>
          ) : (
            groupedRules.ORG_UNIT.map((rule) => <RuleRow key={rule.id} rule={rule} />)
          )}
        </div>
      </div>

      {/* User Overrides */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-medium text-gray-900">User Overrides</h2>
          <p className="text-sm text-gray-500">
            Templates assigned to specific individual employees
          </p>
        </div>
        <div className="divide-y divide-gray-200">
          {groupedRules.USER_OVERRIDE.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No user overrides configured.
            </div>
          ) : (
            groupedRules.USER_OVERRIDE.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
}: {
  rule: {
    id: string;
    type: string;
    priority: number;
    orgUnitPath: string | null;
    isActive: boolean;
    template: { id: string; name: string };
    employee: { fullName: string; primaryEmail: string } | null;
  };
}) {
  return (
    <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{rule.template.name}</span>
          {!rule.isActive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
              Inactive
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          {rule.type === 'TENANT_DEFAULT' && 'Applies to all employees'}
          {rule.type === 'ORG_UNIT' && `Org unit: ${rule.orgUnitPath}`}
          {rule.type === 'USER_OVERRIDE' &&
            `User: ${rule.employee?.fullName} (${rule.employee?.primaryEmail})`}
        </p>
      </div>
      <Link
        href={`/dashboard/rules/${rule.id}`}
        className="text-sm text-primary-600 hover:text-primary-700"
      >
        Edit
      </Link>
    </div>
  );
}
