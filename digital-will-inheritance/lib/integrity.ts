import { createHash } from "node:crypto";
export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
export function validateAllocations(values: number[]) { if (!values.length || values.some(v => !Number.isInteger(v) || v <= 0) || values.reduce((a,b)=>a+b,0) !== 10000) throw new Error("Beneficiary allocations must total exactly 100% (10,000 basis points)."); }
