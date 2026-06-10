import { getAddress, hexToBigInt, keccak256, size, slice, toBytes, type Address, type Hex } from 'viem'

/**
 * Self-contained verification engine for OurGlass subscription delegations.
 *
 * This file has no dependency on the OurGlass app. Its trust anchor — the set of
 * canonical, audited contract addresses — is vendored below on purpose: a
 * verifier must never fetch what it verifies against from a source the attacker
 * could control. Cross-check the addresses against MetaMask's published list:
 * https://github.com/MetaMask/delegation-framework/blob/main/documents/Deployments.md
 *
 * Enforcer terms layouts are verbatim from the audited framework:
 *  - ERC20PeriodTransferEnforcer: 116 bytes
 *      [0:20] token, [20:52] periodAmount, [52:84] periodDuration, [84:116] startDate
 *  - TimestampEnforcer: 32 bytes
 *      [0:16] afterThreshold, [16:32] beforeThreshold
 */

function lower(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) out[k.toLowerCase()] = v
  return out
}

// MetaMask Delegation Framework v1.3.0 — deterministic across every chain.
export const CANONICAL_CONTRACTS: Record<string, string> = lower({
  '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3': 'DelegationManager',
  '0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9': 'NativeTokenPeriodTransferEnforcer',
  '0x474e3Ae7E169e940607cC624Da8A15Eb120139aB': 'ERC20PeriodTransferEnforcer',
  '0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320': 'NativeTokenTransferAmountEnforcer',
  '0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc': 'ERC20TransferAmountEnforcer',
  '0xeaA1bE91F0ea417820a765df9C5BE542286BFfDC': 'ERC20MultiOperationIncreaseBalanceEnforcer',
  '0x92Bf12322527cAA612fd31a0e810472BBB106A8F': 'ValueLteEnforcer',
  '0x1046bb45C8d673d4ea75321280DB34899413c069': 'TimestampEnforcer',
  '0x7F20f61b1f09b08D970938F6fa563634d65c4EeB': 'AllowedTargetsEnforcer',
  '0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5': 'AllowedMethodsEnforcer',
  '0x04658B29F6b82ed55274221a06Fc97D318E25416': 'LimitedCallsEnforcer',
  '0x44B8C6ae3C304213c3e298495e12497Ed3E56E41': 'ArgsEqualityCheckEnforcer',
  '0x99F2e9bF15ce5eC84685604836F71aB835DBBdED': 'ExactCalldataEnforcer',
  '0xc2b0d624c1c4319760C96503BA27C347F3260f55': 'AllowedCalldataEnforcer',
  '0xE144b0b2618071B4E56f746313528a669c7E65c5': 'RedeemerEnforcer',
  '0x5e4b49156D23D890e7DC264c378a443C2d22A80E': 'DelegationMetaSwapAdapter',
})

export function canonicalName(address: string): string | null {
  return CANONICAL_CONTRACTS[address.toLowerCase()] ?? null
}

// ── Agreement hashing (must match the OurGlass app exactly) ──────────────────

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

export function hashTerms(terms: unknown): Hex {
  return keccak256(toBytes(canonicalize(terms)))
}

// ── Caveat decoding ──────────────────────────────────────────────────────────

export interface Erc20PeriodScope {
  kind: 'erc20PeriodTransfer'
  token: Address
  periodAmount: bigint
  periodDuration: bigint
  startDate: bigint
}

export interface TimestampScope {
  kind: 'timestamp'
  afterThreshold: bigint
  beforeThreshold: bigint
}

export type CaveatScope = Erc20PeriodScope | TimestampScope

export function decodeErc20PeriodTransferTerms(terms: Hex): Erc20PeriodScope {
  if (size(terms) !== 116) throw new Error(`expected 116-byte terms, got ${size(terms)}`)
  return {
    kind: 'erc20PeriodTransfer',
    token: getAddress(slice(terms, 0, 20)),
    periodAmount: hexToBigInt(slice(terms, 20, 52)),
    periodDuration: hexToBigInt(slice(terms, 52, 84)),
    startDate: hexToBigInt(slice(terms, 84, 116)),
  }
}

export function decodeTimestampTerms(terms: Hex): TimestampScope {
  if (size(terms) !== 32) throw new Error(`expected 32-byte terms, got ${size(terms)}`)
  return {
    kind: 'timestamp',
    afterThreshold: hexToBigInt(slice(terms, 0, 16)),
    beforeThreshold: hexToBigInt(slice(terms, 16, 32)),
  }
}

export function periodLabel(seconds: bigint): string {
  const labels: Record<string, string> = {
    '60': 'minutely',
    '3600': 'hourly',
    '86400': 'daily',
    '604800': 'weekly',
    '2592000': 'monthly',
  }
  return labels[seconds.toString()] ?? `every ${seconds.toString()}s`
}

// ── Report shapes ────────────────────────────────────────────────────────────

export interface CaveatCheck {
  enforcer: Address
  name: string | null
  audited: boolean
  scope: CaveatScope | null
}

export interface DelegationReport {
  kind: 'delegation'
  delegate: Address
  delegator: Address
  salt: Hex
  caveats: CaveatCheck[]
  allEnforcersAudited: boolean
  saltBindsAgreement: boolean | null
}

export interface AgreementReport {
  kind: 'agreement'
  hashConsistent: boolean
  computedHash: Hex
  declaredHash: Hex
  terms: Record<string, unknown>
}

export type VerifyResult =
  | { ok: false; error: string }
  | { ok: true; report: DelegationReport | AgreementReport }

interface RawDelegation {
  delegate: Address
  delegator: Address
  salt: Hex
  caveats: { enforcer: Address; terms: Hex }[]
}

export function analyze(json: string): VerifyResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Not valid JSON.' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Expected a JSON object.' }
  const obj = parsed as Record<string, unknown>

  if (isAgreement(obj)) return analyzeAgreement(obj)

  const delegation = extractDelegation(obj)
  if (!delegation) {
    return { ok: false, error: 'Unrecognized shape: paste a subscription record (Copy JSON) or an agreement document.' }
  }
  const meta = obj.meta as Record<string, unknown> | undefined
  return analyzeDelegation(delegation, meta)
}

function analyzeAgreement(obj: Record<string, unknown>): VerifyResult {
  const terms = obj.terms
  const declaredHash = obj.termsHash
  if (!terms || typeof terms !== 'object' || typeof declaredHash !== 'string') {
    return { ok: false, error: 'Agreement is missing terms or termsHash.' }
  }
  const computedHash = hashTerms(terms)
  return {
    ok: true,
    report: {
      kind: 'agreement',
      hashConsistent: computedHash.toLowerCase() === declaredHash.toLowerCase(),
      computedHash,
      declaredHash: declaredHash as Hex,
      terms: terms as Record<string, unknown>,
    },
  }
}

function analyzeDelegation(d: RawDelegation, meta: Record<string, unknown> | undefined): VerifyResult {
  const caveats: CaveatCheck[] = d.caveats.map((c) => {
    const name = canonicalName(c.enforcer)
    return { enforcer: c.enforcer, name, audited: name !== null, scope: decodeScope(name, c.terms) }
  })
  const allEnforcersAudited = caveats.length > 0 && caveats.every((c) => c.audited)

  let saltBindsAgreement: boolean | null = null
  const agreement = meta?.agreement as { termsHash?: string } | undefined
  if (agreement?.termsHash) {
    saltBindsAgreement = d.salt.toLowerCase() === agreement.termsHash.toLowerCase()
  }

  return {
    ok: true,
    report: { kind: 'delegation', delegate: d.delegate, delegator: d.delegator, salt: d.salt, caveats, allEnforcersAudited, saltBindsAgreement },
  }
}

function decodeScope(name: string | null, terms: Hex): CaveatScope | null {
  try {
    if (name === 'ERC20PeriodTransferEnforcer') return decodeErc20PeriodTransferTerms(terms)
    if (name === 'TimestampEnforcer') return decodeTimestampTerms(terms)
  } catch {
    return null
  }
  return null
}

function isAgreement(obj: Record<string, unknown>): boolean {
  return obj.schema === 'safe-subscriptions/agreement@1' || (typeof obj.termsHash === 'string' && typeof obj.terms === 'object')
}

function extractDelegation(obj: Record<string, unknown>): RawDelegation | null {
  const source = (obj.delegation as Record<string, unknown> | undefined) ?? obj
  const { delegate, delegator, salt, caveats } = source
  if (typeof delegate !== 'string' || typeof delegator !== 'string' || typeof salt !== 'string' || !Array.isArray(caveats)) {
    return null
  }
  const decoded = caveats.map((c) => ({
    enforcer: (c as { enforcer: Address }).enforcer,
    terms: (c as { terms: Hex }).terms,
  }))
  return { delegate: delegate as Address, delegator: delegator as Address, salt: salt as Hex, caveats: decoded }
}
