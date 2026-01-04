import type { RuleType, EmployeeData, TemplateData, AssignmentRuleData } from '../types/index.js';

// ============================================================================
// Rule Resolution
// ============================================================================

export interface RuleWithTemplate extends AssignmentRuleData {
  template: TemplateData;
}

export interface ResolvedAssignment {
  employee: EmployeeData;
  template: TemplateData;
  rule: AssignmentRuleData;
  matchType: RuleType;
}

/**
 * Determines the best matching template for an employee based on assignment rules.
 *
 * Priority order (highest to lowest):
 * 1. USER_OVERRIDE - Direct assignment to specific user
 * 2. ORG_UNIT - Match based on org unit path (most specific wins)
 * 3. TENANT_DEFAULT - Fallback default for tenant
 *
 * @param employee - The employee to match
 * @param rules - All active rules for the tenant
 * @returns The matching rule with template, or null if no match
 */
export function resolveTemplateForEmployee(
  employee: EmployeeData,
  rules: RuleWithTemplate[]
): ResolvedAssignment | null {
  // Filter to active rules only
  const activeRules = rules.filter((r) => r.isActive && r.template.isActive);

  // Priority 1: Check for user override
  const userOverride = activeRules.find(
    (r) => r.type === 'USER_OVERRIDE' && r.employeeId === employee.id
  );

  if (userOverride) {
    return {
      employee,
      template: userOverride.template,
      rule: userOverride,
      matchType: 'USER_OVERRIDE',
    };
  }

  // Priority 2: Find best matching org unit
  const orgUnitRules = activeRules
    .filter((r) => r.type === 'ORG_UNIT' && r.orgUnitPath)
    .sort((a, b) => {
      // Sort by path length descending (most specific first)
      const aLen = a.orgUnitPath?.length || 0;
      const bLen = b.orgUnitPath?.length || 0;
      if (bLen !== aLen) return bLen - aLen;
      // Then by priority descending
      return b.priority - a.priority;
    });

  for (const rule of orgUnitRules) {
    if (matchesOrgUnit(employee.orgUnitPath, rule.orgUnitPath!)) {
      return {
        employee,
        template: rule.template,
        rule,
        matchType: 'ORG_UNIT',
      };
    }
  }

  // Priority 3: Fall back to tenant default
  const tenantDefault = activeRules
    .filter((r) => r.type === 'TENANT_DEFAULT')
    .sort((a, b) => b.priority - a.priority)[0];

  if (tenantDefault) {
    return {
      employee,
      template: tenantDefault.template,
      rule: tenantDefault,
      matchType: 'TENANT_DEFAULT',
    };
  }

  return null;
}

/**
 * Checks if an employee's org unit path matches a rule's org unit path.
 * Uses prefix matching, so /Engineering matches /Engineering/Frontend.
 */
export function matchesOrgUnit(
  employeeOrgUnit: string,
  ruleOrgUnit: string
): boolean {
  // Normalize paths
  const normalizedEmployee = normalizeOrgUnitPath(employeeOrgUnit);
  const normalizedRule = normalizeOrgUnitPath(ruleOrgUnit);

  // Check if employee path starts with rule path
  return (
    normalizedEmployee === normalizedRule ||
    normalizedEmployee.startsWith(normalizedRule + '/')
  );
}

/**
 * Normalizes an org unit path for consistent matching.
 */
export function normalizeOrgUnitPath(path: string): string {
  // Ensure leading slash, remove trailing slash
  let normalized = path.trim();

  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

// ============================================================================
// Batch Resolution
// ============================================================================

/**
 * Resolves templates for multiple employees efficiently.
 */
export function resolveTemplatesForEmployees(
  employees: EmployeeData[],
  rules: RuleWithTemplate[]
): Map<string, ResolvedAssignment | null> {
  const results = new Map<string, ResolvedAssignment | null>();

  for (const employee of employees) {
    results.set(employee.id, resolveTemplateForEmployee(employee, rules));
  }

  return results;
}

/**
 * Gets all employees affected by a specific rule.
 */
export function getEmployeesAffectedByRule(
  rule: AssignmentRuleData,
  employees: EmployeeData[]
): EmployeeData[] {
  switch (rule.type) {
    case 'USER_OVERRIDE':
      return employees.filter((e) => e.id === rule.employeeId);

    case 'ORG_UNIT':
      if (!rule.orgUnitPath) return [];
      return employees.filter((e) =>
        matchesOrgUnit(e.orgUnitPath, rule.orgUnitPath!)
      );

    case 'TENANT_DEFAULT':
      // All employees are potentially affected
      return employees;

    default:
      return [];
  }
}

// ============================================================================
// Deployment Planning
// ============================================================================

export interface DeploymentPlan {
  totalEmployees: number;
  affectedEmployees: number;
  byTemplate: Map<string, string[]>; // templateId -> employeeIds
  noMatch: string[]; // employeeIds with no matching template
}

/**
 * Creates a deployment plan showing which templates will be deployed to which employees.
 */
export function createDeploymentPlan(
  employees: EmployeeData[],
  rules: RuleWithTemplate[]
): DeploymentPlan {
  const byTemplate = new Map<string, string[]>();
  const noMatch: string[] = [];

  for (const employee of employees) {
    const assignment = resolveTemplateForEmployee(employee, rules);

    if (assignment) {
      const existing = byTemplate.get(assignment.template.id) || [];
      existing.push(employee.id);
      byTemplate.set(assignment.template.id, existing);
    } else {
      noMatch.push(employee.id);
    }
  }

  return {
    totalEmployees: employees.length,
    affectedEmployees: employees.length - noMatch.length,
    byTemplate,
    noMatch,
  };
}

// ============================================================================
// Rule Validation
// ============================================================================

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a rule configuration.
 */
export function validateRule(
  rule: Partial<AssignmentRuleData>,
  existingRules: AssignmentRuleData[]
): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type-specific validation
  switch (rule.type) {
    case 'USER_OVERRIDE':
      if (!rule.employeeId) {
        errors.push('User override rule requires an employee ID');
      }
      // Check for duplicate user override
      const existingOverride = existingRules.find(
        (r) =>
          r.type === 'USER_OVERRIDE' &&
          r.employeeId === rule.employeeId &&
          r.id !== rule.id
      );
      if (existingOverride) {
        errors.push('A user override already exists for this employee');
      }
      break;

    case 'ORG_UNIT':
      if (!rule.orgUnitPath) {
        errors.push('Org unit rule requires an org unit path');
      } else {
        // Check for overlapping org unit rules
        const overlapping = existingRules.filter(
          (r) =>
            r.type === 'ORG_UNIT' &&
            r.orgUnitPath &&
            r.id !== rule.id &&
            (matchesOrgUnit(rule.orgUnitPath!, r.orgUnitPath) ||
              matchesOrgUnit(r.orgUnitPath, rule.orgUnitPath!))
        );
        if (overlapping.length > 0) {
          warnings.push(
            `This rule overlaps with ${overlapping.length} existing org unit rule(s). Priority will determine which applies.`
          );
        }
      }
      break;

    case 'TENANT_DEFAULT':
      // Check for existing tenant default
      const existingDefault = existingRules.find(
        (r) => r.type === 'TENANT_DEFAULT' && r.id !== rule.id
      );
      if (existingDefault) {
        warnings.push(
          'A tenant default already exists. This will be used based on priority.'
        );
      }
      break;

    default:
      if (!rule.type) {
        errors.push('Rule type is required');
      }
  }

  // Template validation
  if (!rule.templateId) {
    errors.push('Template ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Org Unit Tree
// ============================================================================

export interface OrgUnitNode {
  path: string;
  name: string;
  employeeCount: number;
  children: OrgUnitNode[];
}

/**
 * Builds an org unit tree from employee data.
 */
export function buildOrgUnitTree(employees: EmployeeData[]): OrgUnitNode {
  const root: OrgUnitNode = {
    path: '/',
    name: '/',
    employeeCount: 0,
    children: [],
  };

  const pathCounts = new Map<string, number>();

  // Count employees per path
  for (const employee of employees) {
    const path = normalizeOrgUnitPath(employee.orgUnitPath);
    pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
  }

  // Build tree
  for (const [path, count] of pathCounts) {
    if (path === '/') {
      root.employeeCount = count;
      continue;
    }

    const parts = path.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';

    for (const part of parts) {
      currentPath += '/' + part;

      let child = current.children.find((c) => c.path === currentPath);
      if (!child) {
        child = {
          path: currentPath,
          name: part,
          employeeCount: 0,
          children: [],
        };
        current.children.push(child);
      }

      if (currentPath === path) {
        child.employeeCount = count;
      }

      current = child;
    }
  }

  // Sort children alphabetically
  function sortChildren(node: OrgUnitNode): void {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  sortChildren(root);

  return root;
}
