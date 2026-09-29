import { InvalidArgumentError } from 'commander';

export function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError(`invalid positive integer: ${value}`);
  }
  return parsed;
}

export function parseWaitSeconds(value: string): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < 0 || parsed > 60) {
    throw new InvalidArgumentError(`wait must be an integer from 0 to 60: ${value}`);
  }
  return parsed;
}

export function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`invalid positive number: ${value}`);
  }
  return parsed;
}
