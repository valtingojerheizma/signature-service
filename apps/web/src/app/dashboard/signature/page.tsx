import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getDefaultTemplate } from '@signatureops/shared';

export default async function SignaturePage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  const template = tenantId
    ? await prisma.template.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      })
    : null;

  // Get a sample employee for preview
  const sampleEmployee = tenantId
    ? await prisma.employee.findFirst({
        where: { tenantId, suspended: false },
        orderBy: { fullName: 'asc' },
      })
    : null;

  // Generate preview with sample data
  const previewData = {
    fullName: sampleEmployee?.fullName || 'John Smith',
    firstName: sampleEmployee?.givenName || 'John',
    lastName: sampleEmployee?.familyName || 'Smith',
    title: sampleEmployee?.title || 'Marketing Manager',
    department: sampleEmployee?.department || 'Marketing',
    email: sampleEmployee?.primaryEmail || 'john.smith@company.com',
    phone: sampleEmployee?.phone || '+1 (555) 123-4567',
    mobile: sampleEmployee?.mobilePhone || '',
    location: sampleEmployee?.location || '',
  };

  const htmlContent = template?.htmlContent || getDefaultTemplate();

  // Simple template variable replacement for preview
  let previewHtml = htmlContent;
  Object.entries(previewData).forEach(([key, value]) => {
    previewHtml = previewHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Signature</h1>
          <p className="mt-1 text-gray-500">
            Design the signature that appears at the bottom of every email.
          </p>
        </div>
        <Link href="/dashboard/signature/edit" className="btn-primary">
          {template ? 'Edit Design' : 'Create Signature'}
        </Link>
      </div>

      {template ? (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Preview */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
            <div className="card p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500 mb-2">
                  Showing how it looks for{' '}
                  <span className="font-medium">{previewData.fullName}</span>
                </p>
              </div>
              <div
                className="signature-preview"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>

          {/* Info */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <div className="card divide-y divide-gray-200">
              <div className="p-4">
                <div className="text-sm text-gray-500">Name</div>
                <div className="font-medium text-gray-900">{template.name}</div>
              </div>
              {template.description && (
                <div className="p-4">
                  <div className="text-sm text-gray-500">Description</div>
                  <div className="text-gray-900">{template.description}</div>
                </div>
              )}
              <div className="p-4">
                <div className="text-sm text-gray-500">Last updated</div>
                <div className="text-gray-900">
                  {template.updatedAt.toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Personal details are filled automatically
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Full name', example: previewData.fullName },
                  { label: 'Job title', example: previewData.title },
                  { label: 'Email', example: previewData.email },
                  { label: 'Phone', example: previewData.phone },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-gray-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <svg
            className="mx-auto w-16 h-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No signature yet
          </h3>
          <p className="mt-2 text-gray-500 max-w-sm mx-auto">
            Create a professional email signature for your team. Each person's
            name, title, and contact info will be filled in automatically.
          </p>
          <Link href="/dashboard/signature/edit" className="btn-primary mt-6">
            Create Signature
          </Link>
        </div>
      )}
    </div>
  );
}
