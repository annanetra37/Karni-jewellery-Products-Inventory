-- Track money moved from the bank (card revenue) into the safe.
ALTER TYPE "SafeTxType" ADD VALUE IF NOT EXISTS 'BANK_TO_SAFE';
