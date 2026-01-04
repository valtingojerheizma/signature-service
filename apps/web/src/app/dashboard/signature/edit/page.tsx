import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { TemplateEditor } from '@/components/editor/template-editor';
import { getDefaultTemplate } from '@signatureops/shared';

export default async function EditSignaturePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.tenantId) {
    redirect('/setup');
  }

  const tenantId = session.user.tenantId;

  // Get existing template or use default
  const template = await prisma.template.findFirst({
    where: { tenantId, isDefault: true },
  });

  // Get sample employee for preview
  const sampleEmployee = await prisma.employee.findFirst({
    where: { tenantId, suspended: false },
    orderBy: { fullName: 'asc' },
  });

  // Get all employees for preview selector
  const employees = await prisma.employee.findMany({
    where: { tenantId, suspended: false },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      primaryEmail: true,
      title: true,
      department: true,
    },
    take: 50,
  });

  const initialHtml = template?.htmlContent || getDefaultTemplate();
  const templateId = template?.id;
  const templateName = template?.name || 'Company Signature';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Signature</h1>
          <p className="mt-1 text-gray-500">
            Design your company email signature. Personal details will be filled in automatically.
          </p>
        </div>
      </div>

      <TemplateEditor
        templateId={templateId}
        templateName={templateName}
        initialHtml={initialHtml}
        employees={employees}
        defaultEmployeeId={sampleEmployee?.id}
      />
    </div>
  );
}
