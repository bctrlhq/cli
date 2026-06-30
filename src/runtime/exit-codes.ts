export const ExitCode = {
  Ok: 0,
  Error: 1,
  Cancel: 2,
  Auth: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
