import sanitizeHtml from 'sanitize-html';
import { TEMPLATE_VARIABLES, type TemplateVariable, type EmployeeData } from '../types/index.js';

// ============================================================================
// Sanitizer Configuration
// ============================================================================

/**
 * Strict sanitization configuration for Gmail-compatible signatures.
 * Only allows safe HTML elements with inline styles.
 */
export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'table',
    'tbody',
    'tr',
    'td',
    'img',
    'a',
    'span',
    'div',
    'br',
    'b',
    'strong',
    'i',
    'em',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    '*': ['style'],
  },
  allowedSchemes: ['https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    a: ['https', 'mailto', 'tel'],
    img: ['https'], // Only HTTPS for images
  },
  // Block data URIs (base64 images)
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  transformTags: {
    a: (tagName, attribs) => {
      // Ensure all links open in new tab
      return {
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      };
    },
  },
  // Remove any scripts or event handlers
  exclusiveFilter: (frame) => {
    // Remove elements with event handlers
    for (const attr of Object.keys(frame.attribs || {})) {
      if (attr.startsWith('on')) {
        return true;
      }
    }
    return false;
  },
};

/**
 * Sanitizes HTML content for safe email signature use.
 */
export function sanitizeSignatureHtml(html: string): string {
  // First pass: sanitize with strict rules
  let sanitized = sanitizeHtml(html, SANITIZE_OPTIONS);

  // Remove any remaining javascript: or data: URLs that might have slipped through
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:/gi, '');

  // Ensure max width constraint
  if (!sanitized.includes('max-width')) {
    sanitized = `<div style="max-width: 600px;">${sanitized}</div>`;
  }

  return sanitized;
}

/**
 * Validates that HTML is safe for use as a signature.
 * Returns validation errors if any issues are found.
 */
export function validateSignatureHtml(html: string): string[] {
  const errors: string[] = [];

  // Check for script tags (should be removed by sanitizer, but double-check)
  if (/<script/i.test(html)) {
    errors.push('Script tags are not allowed');
  }

  // Check for event handlers
  if (/\bon\w+\s*=/i.test(html)) {
    errors.push('Event handlers (onclick, onload, etc.) are not allowed');
  }

  // Check for javascript: URLs
  if (/javascript:/i.test(html)) {
    errors.push('JavaScript URLs are not allowed');
  }

  // Check for data: URLs (base64 images)
  if (/data:/i.test(html)) {
    errors.push('Data URLs (base64 images) are not allowed. Use HTTPS URLs instead.');
  }

  // Check for non-HTTPS image URLs
  const imgSrcMatches = html.matchAll(/src\s*=\s*["']([^"']+)["']/gi);
  for (const match of imgSrcMatches) {
    const url = match[1];
    if (url && !url.startsWith('https://') && !url.startsWith('{{')) {
      errors.push(`Image URL must use HTTPS: ${url}`);
    }
  }

  // Check for overly long content (Gmail has limits)
  if (html.length > 50000) {
    errors.push('Signature HTML is too long (max 50,000 characters)');
  }

  return errors;
}

// ============================================================================
// Template Rendering
// ============================================================================

/**
 * Renders a template with employee data.
 */
export function renderTemplate(
  templateHtml: string,
  employee: EmployeeData
): string {
  const variables: Record<TemplateVariable, string> = {
    '{{fullName}}': employee.fullName || '',
    '{{firstName}}': employee.givenName || '',
    '{{lastName}}': employee.familyName || '',
    '{{title}}': employee.title || '',
    '{{department}}': employee.department || '',
    '{{email}}': employee.primaryEmail || '',
    '{{phone}}': employee.phone || '',
    '{{mobile}}': employee.mobilePhone || '',
    '{{location}}': employee.location || '',
  };

  let rendered = templateHtml;

  for (const [variable, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(escapeRegExp(variable), 'g'), value);
  }

  return rendered;
}

/**
 * Extracts variables used in a template.
 */
export function extractTemplateVariables(templateHtml: string): string[] {
  const variablePattern = /\{\{(\w+)\}\}/g;
  const found: string[] = [];
  let match;

  while ((match = variablePattern.exec(templateHtml)) !== null) {
    const fullMatch = `{{${match[1]}}}`;
    if (!found.includes(fullMatch)) {
      found.push(fullMatch);
    }
  }

  return found;
}

/**
 * Validates that all variables in template are valid.
 */
export function validateTemplateVariables(templateHtml: string): {
  valid: boolean;
  unknownVariables: string[];
} {
  const used = extractTemplateVariables(templateHtml);
  const validVariables = TEMPLATE_VARIABLES.map((v) => v.key);
  const unknownVariables = used.filter((v) => !validVariables.includes(v as TemplateVariable));

  return {
    valid: unknownVariables.length === 0,
    unknownVariables,
  };
}

// ============================================================================
// Plain Text Generation
// ============================================================================

/**
 * Converts HTML signature to plain text fallback.
 */
export function generatePlainText(html: string): string {
  let text = html;

  // Replace common block elements with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>/gi, ' | ');

  // Extract link text and URLs
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

// ============================================================================
// Default Template
// ============================================================================

/**
 * Returns a professional default signature template.
 */
export function getDefaultTemplate(): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 14px; color: #333333; max-width: 600px;">
  <tbody>
    <tr>
      <td style="padding-bottom: 12px;">
        <strong style="font-size: 16px; color: #1a1a1a;">{{fullName}}</strong>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom: 8px; color: #666666;">
        {{title}}{{department}}
      </td>
    </tr>
    <tr>
      <td style="padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
        <span style="color: #666666;">{{email}}</span>
        <span style="color: #999999; padding: 0 8px;">|</span>
        <span style="color: #666666;">{{phone}}</span>
      </td>
    </tr>
    <tr>
      <td style="padding-top: 12px;">
        <span style="font-size: 12px; color: #999999;">
          This email may contain confidential information.
        </span>
      </td>
    </tr>
  </tbody>
</table>`;
}

// ============================================================================
// Utility Functions
// ============================================================================

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates a signature hash for change detection.
 */
export function hashSignature(html: string): string {
  // Simple hash for change detection (not cryptographic)
  let hash = 0;
  for (let i = 0; i < html.length; i++) {
    const char = html.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
