import { InvalidArgumentError } from 'commander';

export function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError(`invalid positive integer: ${value}`);
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
