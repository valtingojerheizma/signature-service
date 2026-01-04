import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SetupWizard } from '@/components/setup/wizard';

export default async function SetupPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  // Check if setup is already complete
  if (session.user.isSetupComplete && session.user.tenantId) {
    redirect('/dashboard');
  }

  // Get or create tenant
  let tenant = session.user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        include: { workspaceConnection: true },
      })
    : null;

  // Determine current step
  let currentStep = 1;
  if (tenant) {
    if (tenant.workspaceConnection) {
      currentStep = 3; // Ready to test connection
    } else {
      currentStep = 2; // Need to upload credentials
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Set Up SignatureOps</h1>
          <p className="mt-2 text-gray-600">
            Connect your company directory to get started.
          </p>
        </div>

        <SetupWizard
          initialStep={currentStep}
          userEmail={session.user.email}
          tenantId={tenant?.id}
          hasConnection={!!tenant?.workspaceConnection}
        />
      </div>
    </div>
  );
}
