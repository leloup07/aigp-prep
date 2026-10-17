import { content } from '../content';
import { BANKS, type BankId } from '../types';

export const BANK_LABEL = Object.fromEntries(BANKS.map((b) => [b.id, b.label])) as Record<BankId, string>;
export const compName = (c: string) => content.compNames[c] ?? '';
