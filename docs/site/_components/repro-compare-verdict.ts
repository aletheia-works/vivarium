import validateVerdictRaw from '../_generated/validators/verdict-validator.mjs';

export type VerdictLiteral = 'reproduced' | 'unreproduced';

export interface VerdictV1 {
  contract: 'v1';
  verdict: VerdictLiteral;
  exit_code: number;
  image_tag: string;
  image_digest: string;
  captured_at: string;
  stdout: string;
  stderr_tail: string;
}

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: VerdictV1 }
  | { ok: false; error: ValidationError };

export type Side = 'branch' | 'original';

export interface SideError extends ValidationError {
  side: Side;
}

interface AjvErrorObject {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

interface AjvValidateFn {
  (data: unknown): boolean;
  errors?: AjvErrorObject[] | null;
}

const validateVerdictAjv = validateVerdictRaw as unknown as AjvValidateFn;

function ajvErrorToValidationError(err: AjvErrorObject): ValidationError {
  if (
    err.keyword === 'required' &&
    typeof err.params.missingProperty === 'string'
  ) {
    const parent = err.instancePath || '';
    return {
      path: `${parent}/${err.params.missingProperty}`,
      message: 'required field missing',
    };
  }
  return {
    path: err.instancePath || '/',
    message: err.message ?? `invalid (${err.keyword})`,
  };
}

export function validateVerdict(raw: unknown): ValidationResult {
  if (validateVerdictAjv(raw)) {
    return { ok: true, data: raw as VerdictV1 };
  }
  const firstErr = validateVerdictAjv.errors?.[0];
  return {
    ok: false,
    error: firstErr
      ? ajvErrorToValidationError(firstErr)
      : { path: '/', message: 'invalid verdict shape' },
  };
}

export function parseVerdict(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: {
        path: '/',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
  return validateVerdict(raw);
}

const BUNDLE_FILES: Record<string, Side> = {
  'branch-fix-verdict.json': 'branch',
  'original-verdict.json': 'original',
};

export async function readVerdictBundle(zipFile: Blob): Promise<{
  verdicts: Partial<Record<Side, VerdictV1>>;
  errors: SideError[];
}> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipFile);
  const verdicts: Partial<Record<Side, VerdictV1>> = {};
  const errors: SideError[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const side = BUNDLE_FILES[entry.name.split('/').pop() ?? entry.name];
    if (!side) continue;
    const result = parseVerdict(await entry.async('text'));
    if (result.ok) verdicts[side] = result.data;
    else errors.push({ side, ...result.error });
  }
  return { verdicts, errors };
}

export async function fetchVerdict(url: string): Promise<ValidationResult> {
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  } catch {
    return { ok: false, error: { path: '/', message: 'network error' } };
  }
  if (!res.ok) {
    return { ok: false, error: { path: '/', message: `http ${res.status}` } };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    return {
      ok: false,
      error: {
        path: '/',
        message: err instanceof Error ? err.message : 'json parse failed',
      },
    };
  }
  return validateVerdict(body);
}
