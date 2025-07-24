export interface FHIRPathConfiguration {
  validateEnable: boolean;
  validateDelay: number;
  fhirVersion: 'R4' | 'STU3' | 'DSTU2';
  traceServer: 'off' | 'messages' | 'verbose';
}

export interface ValidationRequest {
  uri: string;
  content: string;
  resourceType?: string;
}

export interface ValidationResponse {
  errors: ValidationError[];
}

export interface ValidationError {
  message: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  length: number;
}

export const FHIRPATH_LANGUAGE_ID = 'fhirpath';
export const FHIRPATH_FILE_EXTENSIONS = ['.fhirpath', '.fhir'];