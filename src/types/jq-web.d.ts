declare module 'jq-web' {
  const jq: Promise<{
    raw(input: string, filter: string, flags?: string[]): string;
    json(input: unknown, filter: string): unknown;
  }>;

  export default jq;
}
