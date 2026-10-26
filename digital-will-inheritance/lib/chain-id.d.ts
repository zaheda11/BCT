export function assertHardhatChainId(provider: { send(method: string, params: unknown[]): Promise<unknown> }): Promise<void>;
export class ChainValidationError extends Error {}
