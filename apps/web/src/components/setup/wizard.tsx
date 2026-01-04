'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SetupWizardProps {
  initialStep: number;
  userEmail: string;
  tenantId?: string | null;
  hasConnection: boolean;
}

export function SetupWizard({
  initialStep,
  userEmail,
  tenantId,
  hasConnection,
}: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    users?: Array<{ name: string; email: string }>;
    error?: string;
  } | null>(null);

  const domain = userEmail.split('@')[1];

  const handleCreateTenant = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/setup/tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create organization');
      }

      setStep(2);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const credentials = JSON.parse(text);

      // Validate it looks like a service account
      if (credentials.type !== 'service_account') {
        throw new Error('Please upload a Google service account JSON file');
      }

      const res = await fetch('/api/setup/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save credentials');
      }

      setStep(3);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid file format'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const res = await fetch('/api/setup/test', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setTestResult({
          success: false,
          error: data.error || 'Connection test failed',
        });
        return;
      }

      setTestResult({
        success: true,
        users: data.users,
      });
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to complete setup');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s < step
                  ? 'bg-green-500 text-white'
                  : s === step
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s < step ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                s
              )}
            </div>
            {s < 3 && (
              <div
                className={`w-16 h-0.5 mx-2 ${
                  s < step ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Create organization */}
      {step === 1 && (
        <div className="card p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Create Your Organization
          </h2>
          <p className="mt-2 text-gray-600">
            We'll set up SignatureOps for <strong>{domain}</strong>
          </p>
          <div className="mt-6">
            <button
              onClick={handleCreateTenant}
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? 'Creating...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload credentials */}
      {step === 2 && (
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 text-center">
            Connect Your Directory
          </h2>
          <p className="mt-2 text-gray-600 text-center">
            Upload your Google service account credentials to connect.
          </p>

          <div className="mt-8 space-y-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-medium text-blue-900">How to get credentials:</h3>
              <ol className="mt-2 text-sm text-blue-800 space-y-2 list-decimal list-inside">
                <li>Go to Google Cloud Console</li>
                <li>Create a service account with a JSON key</li>
                <li>Enable Domain-Wide Delegation in Google Admin</li>
                <li>Upload the JSON key file below</li>
              </ol>
              <p className="mt-3 text-sm text-blue-700">
                See the{' '}
                <a href="/docs/setup" className="underline">
                  detailed setup guide
                </a>{' '}
                for step-by-step instructions.
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={isLoading}
                className="hidden"
                id="credentials-upload"
              />
              <label
                htmlFor="credentials-upload"
                className="cursor-pointer block"
              >
                <svg
                  className="mx-auto w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-600">
                  {isLoading ? 'Uploading...' : 'Click to upload JSON key file'}
                </p>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Test connection */}
      {step === 3 && (
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 text-center">
            Test Connection
          </h2>
          <p className="mt-2 text-gray-600 text-center">
            Let's make sure everything is connected properly.
          </p>

          <div className="mt-8 space-y-6">
            {!testResult && (
              <div className="text-center">
                <button
                  onClick={handleTestConnection}
                  disabled={isLoading}
                  className="btn-primary"
                >
                  {isLoading ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            )}

            {testResult && !testResult.success && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h3 className="font-medium text-red-900">Connection Failed</h3>
                <p className="mt-2 text-sm text-red-700">{testResult.error}</p>
                <div className="mt-4">
                  <button
                    onClick={() => setTestResult(null)}
                    className="btn-secondary text-sm"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {testResult?.success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="font-medium text-green-900 flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Connection Successful!
                </h3>
                <p className="mt-2 text-sm text-green-700">
                  Found {testResult.users?.length || 0} team members:
                </p>
                <ul className="mt-3 space-y-1 text-sm text-green-800">
                  {testResult.users?.slice(0, 5).map((user, i) => (
                    <li key={i}>
                      {user.name} ({user.email})
                    </li>
                  ))}
                  {(testResult.users?.length || 0) > 5 && (
                    <li className="text-green-600">
                      ...and {(testResult.users?.length || 0) - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}

            {testResult?.success && (
              <div className="text-center pt-4">
                <button
                  onClick={handleComplete}
                  disabled={isLoading}
                  className="btn-primary"
                >
                  {isLoading ? 'Finishing...' : 'Complete Setup'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
