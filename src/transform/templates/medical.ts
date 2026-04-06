// ── Medical Template ─────────────────────────────────────────────────
//
// Generates AI-optimized markdown for medical/healthcare sites:
// clinics, hospitals, medical practices.
//
// Schema.org types: MedicalOrganization, MedicalProcedure, Physician,
// MedicalClinic

import { buildSchemaBlock } from '../schema-injector.js';

// ── Types ────────────────────────────────────────────────────────────

export interface OpeningHours {
  dayOfWeek: string;
  opens: string;
  closes: string;
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface PhysicianData {
  name: string;
  medicalSpecialty?: string;
  qualifications?: string[];
  description?: string;
  image?: string;
}

export interface MedicalProcedureData {
  name: string;
  procedureType?: string;
  followup?: string;
  howPerformed?: string;
  description?: string;
}

export interface MedicalDepartment {
  name: string;
  procedures: MedicalProcedureData[];
  description?: string;
}

export interface BranchClinic {
  name: string;
  address?: string;
  telephone?: string;
  openingHours?: OpeningHours[];
  description?: string;
}

export interface MedicalPageData {
  /** Clinic / hospital name. */
  name: string;
  /** Medical specialties (e.g. ["産婦人科", "婦人科"]). */
  medicalSpecialty: string[];
  /** Physical address. */
  address?: string;
  /** Phone number. */
  telephone?: string;
  /** Official website URL. */
  url?: string;
  /** Fax number. */
  faxNumber?: string;
  /** Email address. */
  email?: string;
  /** General description / summary. */
  description?: string;

  /** Departments and their procedures/services. */
  departments: MedicalDepartment[];
  /** Doctors / physicians. */
  physicians: PhysicianData[];

  /** Opening hours specification. */
  openingHours?: OpeningHours[];
  /** Geographic coordinates. */
  geo?: GeoCoordinates;
  /** Access directions / parking / nearest station. */
  accessDescription?: string;

  /** Branch clinics / satellite locations. */
  branches?: BranchClinic[];

  /** Page URL for front matter. */
  pageUrl?: string;
  /** Page path for front matter. */
  pagePath?: string;
}

// ── Template ────────────────────────────────────────────────────────

/**
 * Generate an AI-optimized markdown page for a medical organization.
 *
 * Follows the spec format:
 * - MedicalOrganization schema at top
 * - Departments/services with MedicalProcedure schemas
 * - Physician profiles
 * - Access & hours with MedicalClinic schema
 * - Branch clinics
 */
export function medicalTemplate(data: MedicalPageData): string {
  const parts: string[] = [];

  // Front matter
  if (data.pageUrl || data.pagePath) {
    parts.push(buildFrontMatter(data));
  }

  // Title
  parts.push(`# ${data.name}`);

  // MedicalOrganization schema block
  const orgProperties: Record<string, unknown> = {
    name: data.name,
    medicalSpecialty: data.medicalSpecialty.join(', '),
  };
  if (data.address) orgProperties['address'] = data.address;
  if (data.telephone) orgProperties['telephone'] = data.telephone;
  if (data.url) orgProperties['url'] = data.url;
  if (data.faxNumber) orgProperties['faxNumber'] = data.faxNumber;
  if (data.email) orgProperties['email'] = data.email;

  parts.push(buildSchemaBlock('MedicalOrganization', orgProperties));

  // Description
  if (data.description) {
    parts.push(data.description);
  }

  // Departments / Services
  if (data.departments.length > 0) {
    parts.push('## 診療科目');

    for (const dept of data.departments) {
      parts.push(`### ${dept.name}`);

      for (const proc of dept.procedures) {
        const procProperties: Record<string, unknown> = {
          name: proc.name,
        };
        if (proc.procedureType) procProperties['procedureType'] = proc.procedureType;
        if (proc.followup) procProperties['followup'] = proc.followup;
        if (proc.howPerformed) procProperties['howPerformed'] = proc.howPerformed;

        parts.push(buildSchemaBlock('MedicalProcedure', procProperties));

        if (proc.description) {
          parts.push(proc.description);
        }
      }

      if (dept.description) {
        parts.push(dept.description);
      }
    }
  }

  // Physicians
  if (data.physicians.length > 0) {
    parts.push('## 医師紹介');

    for (const physician of data.physicians) {
      parts.push(`### ${physician.name}`);

      const physicianProperties: Record<string, unknown> = {
        name: physician.name,
      };
      if (physician.medicalSpecialty) {
        physicianProperties['medicalSpecialty'] = physician.medicalSpecialty;
      }
      if (physician.qualifications && physician.qualifications.length > 0) {
        physicianProperties['qualifications'] = physician.qualifications.join(', ');
      }

      parts.push(buildSchemaBlock('Physician', physicianProperties));

      if (physician.description) {
        parts.push(physician.description);
      }
    }
  }

  // Access & Hours
  parts.push('## アクセス・診療時間');

  const clinicProperties: Record<string, unknown> = {};

  if (data.openingHours && data.openingHours.length > 0) {
    clinicProperties['openingHoursSpecification'] = data.openingHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  if (data.geo) {
    clinicProperties['geo'] = {
      latitude: data.geo.latitude,
      longitude: data.geo.longitude,
    };
  }

  if (data.address) clinicProperties['address'] = data.address;
  if (data.telephone) clinicProperties['telephone'] = data.telephone;

  if (Object.keys(clinicProperties).length > 0) {
    parts.push(buildSchemaBlock('MedicalClinic', clinicProperties));
  }

  if (data.accessDescription) {
    parts.push(data.accessDescription);
  }

  // Branch clinics
  if (data.branches && data.branches.length > 0) {
    parts.push('## 分院・関連施設');

    for (const branch of data.branches) {
      parts.push(`### ${branch.name}`);

      const branchProperties: Record<string, unknown> = {
        name: branch.name,
      };
      if (branch.address) branchProperties['address'] = branch.address;
      if (branch.telephone) branchProperties['telephone'] = branch.telephone;
      if (branch.openingHours && branch.openingHours.length > 0) {
        branchProperties['openingHoursSpecification'] = branch.openingHours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          opens: h.opens,
          closes: h.closes,
        }));
      }

      parts.push(buildSchemaBlock('MedicalClinic', branchProperties));

      if (branch.description) {
        parts.push(branch.description);
      }
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildFrontMatter(data: MedicalPageData): string {
  const lines: string[] = ['---'];
  if (data.pageUrl) lines.push(`url: ${data.pageUrl}`);
  if (data.pagePath) lines.push(`path: ${data.pagePath}`);
  lines.push(`title: "${data.name.replace(/"/g, '\\"')}"`);
  lines.push(`type: medical`);
  lines.push('---');
  return lines.join('\n');
}
