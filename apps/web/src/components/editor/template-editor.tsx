'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Employee {
  id: string;
  fullName: string;
  primaryEmail: string;
  title?: string | null;
  department?: string | null;
}

interface TemplateEditorProps {
  templateId?: string;
  templateName: string;
  initialHtml: string;
  employees: Employee[];
  defaultEmployeeId?: string;
}

const VARIABLES = [
  { key: '{{fullName}}', label: 'Full Name', example: 'John Smith' },
  { key: '{{firstName}}', label: 'First Name', example: 'John' },
  { key: '{{lastName}}', label: 'Last Name', example: 'Smith' },
  { key: '{{title}}', label: 'Job Title', example: 'Marketing Manager' },
  { key: '{{department}}', label: 'Department', example: 'Marketing' },
  { key: '{{email}}', label: 'Email', example: 'john@company.com' },
  { key: '{{phone}}', label: 'Phone', example: '+1 555-0123' },
  { key: '{{mobile}}', label: 'Mobile', example: '+1 555-0124' },
  { key: '{{location}}', label: 'Location', example: 'New York' },
];

export function TemplateEditor({
  templateId,
  templateName,
  initialHtml,
  employees,
  defaultEmployeeId,
}: TemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(templateName);
  const [html, setHtml] = useState(initialHtml);
  const [previewEmployeeId, setPreviewEmployeeId] = useState(defaultEmployeeId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Get preview data based on selected employee
  const previewEmployee = employees.find((e) => e.id === previewEmployeeId);
  const previewData = previewEmployee
    ? {
        fullName: previewEmployee.fullName,
        firstName: previewEmployee.fullName.split(' ')[0],
        lastName: previewEmployee.fullName.split(' ').slice(1).join(' '),
        title: previewEmployee.title || 'Job Title',
        department: previewEmployee.department || 'Department',
        email: previewEmployee.primaryEmail,
        phone: '+1 555-0123',
        mobile: '',
        location: '',
      }
    : {
        fullName: 'John Smith',
        firstName: 'John',
        lastName: 'Smith',
        title: 'Marketing Manager',
        department: 'Marketing',
        email: 'john.smith@company.com',
        phone: '+1 555-0123',
        mobile: '+1 555-0124',
        location: 'New York',
      };

  // Render preview with variable substitution
  const renderPreview = useCallback(() => {
    let preview = html;
    Object.entries(previewData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return preview;
  }, [html, previewData]);

  // Insert variable at cursor position
  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('html-editor') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newHtml = html.substring(0, start) + variable + html.substring(end);
      setHtml(newHtml);
      // Reset cursor position after React updates
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  // Save template
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: templateId,
          name,
          htmlContent: html,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <div className="space-y-4">
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <label className="label">Signature Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Company Signature"
            />
          </div>

          <div className="p-4 border-b border-gray-200">
            <label className="label">Insert Variable</label>
            <div className="flex flex-wrap gap-2">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 transition-colors"
                  title={`Insert ${v.label} (${v.example})`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            <label className="label">HTML Code</label>
            <textarea
              id="html-editor"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="w-full h-80 font-mono text-sm p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter your signature HTML..."
            />
            <p className="mt-2 text-xs text-gray-500">
              Use table layouts and inline styles for best Gmail compatibility.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard/signature" className="btn-secondary">
            Cancel
          </Link>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Saved
              </span>
            )}
            {error && <span className="text-sm text-red-600">{error}</span>}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Signature'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-4">
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Live Preview</label>
              <select
                value={previewEmployeeId}
                onChange={(e) => setPreviewEmployeeId(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1"
              >
                <option value="">Sample User</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-6">
            {/* Email mockup */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Email header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-700">
                      {previewData.fullName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {previewData.fullName}
                    </div>
                    <div className="text-xs text-gray-500">{previewData.email}</div>
                  </div>
                </div>
              </div>

              {/* Email body */}
              <div className="p-4 bg-white">
                <div className="text-gray-600 text-sm mb-6">
                  <p>Hi there,</p>
                  <p className="mt-2">
                    This is how your email signature will appear at the bottom
                    of every email.
                  </p>
                  <p className="mt-4">Best regards,</p>
                </div>

                {/* Signature */}
                <div className="border-t border-gray-100 pt-4">
                  <div
                    className="signature-preview"
                    dangerouslySetInnerHTML={{ __html: renderPreview() }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="card p-4">
          <h3 className="font-medium text-gray-900 mb-2">Tips for Gmail</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Use <code className="bg-gray-100 px-1 rounded">table</code> layouts for consistent formatting</li>
            <li>• Keep width under 600px for mobile compatibility</li>
            <li>• Use inline <code className="bg-gray-100 px-1 rounded">style</code> attributes, not CSS classes</li>
            <li>• Only use HTTPS URLs for images</li>
            <li>• Avoid JavaScript and external fonts</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
