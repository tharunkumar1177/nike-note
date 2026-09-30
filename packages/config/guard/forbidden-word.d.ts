export declare const FORBIDDEN_WORD_PATTERN: RegExp;

export interface ForbiddenWordFile {
  path: string;
  content: string;
}

export interface ForbiddenWordViolation {
  path: string;
  line: number;
  match: string;
}

export declare function findViolations(
  files: ForbiddenWordFile[],
): ForbiddenWordViolation[];
