import { analyze, periodLabel, type VerifyResult, type DelegationReport, type AgreementReport } from './verify'
import './style.css'

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

const input = byId<HTMLTextAreaElement>('input')
const out = byId<HTMLDivElement>('result')

byId('check').addEventListener('click', () => {
  out.innerHTML = input.value.trim() ? render(analyze(input.value)) : ''
})
byId('clear').addEventListener('click', () => {
  input.value = ''
  out.innerHTML = ''
})

function esc(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return s.replace(/[&<>"']/g, (c) => map[c])
}

function verdict(ok: boolean, label: string): string {
  return `<span class="verdict ${ok ? 'ok' : 'bad'}"><b>${ok ? 'PASS' : 'FAIL'}</b> ${esc(label)}</span>`
}

function field(label: string, value: string): string {
  return `<div class="field"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`
}

function fmtTs(s: bigint): string {
  return s === 0n ? 'none' : new Date(Number(s) * 1000).toLocaleString()
}

function render(result: VerifyResult): string {
  if (!result.ok) return `<div class="panel error">${esc(result.error)}</div>`
  return result.report.kind === 'agreement' ? renderAgreement(result.report) : renderDelegation(result.report)
}

function renderAgreement(r: AgreementReport): string {
  return `<div class="panel">
    ${verdict(r.hashConsistent, r.hashConsistent ? 'Agreement hash is self-consistent' : 'Hash MISMATCH — do not trust this agreement')}
    ${field('Computed', r.computedHash)}
    ${field('Declared', r.declaredHash)}
    <div class="k" style="margin-top:14px">Terms</div>
    <pre>${esc(JSON.stringify(r.terms, null, 2))}</pre>
  </div>`
}

function renderDelegation(r: DelegationReport): string {
  const verdicts = [verdict(r.allEnforcersAudited, r.allEnforcersAudited ? 'All enforcers are audited contracts' : 'Unaudited / unknown enforcer present')]
  if (r.saltBindsAgreement !== null) {
    verdicts.push(verdict(r.saltBindsAgreement, r.saltBindsAgreement ? 'Salt is bound to the pinned agreement' : 'Salt does NOT match the agreement'))
  }

  const caveats = r.caveats
    .map((c) => {
      let scope = ''
      if (c.scope?.kind === 'erc20PeriodTransfer') {
        scope = `<div class="scope">
          <div>token <span class="mono">${esc(c.scope.token)}</span></div>
          <div>cap <span class="mono">${c.scope.periodAmount.toString()}</span> (raw) / ${periodLabel(c.scope.periodDuration)}</div>
          <div>starts ${esc(fmtTs(c.scope.startDate))}</div>
        </div>`
      } else if (c.scope?.kind === 'timestamp') {
        scope = `<div class="scope">valid ${esc(fmtTs(c.scope.afterThreshold))} → ${esc(fmtTs(c.scope.beforeThreshold))}</div>`
      }
      return `<div class="caveat">
        <div class="caveat-head"><span class="mono">${esc(c.name ?? 'unknown enforcer')}</span>${verdict(c.audited, c.audited ? 'audited' : 'unknown')}</div>
        <div class="mono faint">${esc(c.enforcer)}</div>
        ${scope}
      </div>`
    })
    .join('')

  return `<div class="panel">
    <div class="verdicts">${verdicts.join('')}</div>
    ${field('Delegate', r.delegate)}
    ${field('Delegator', r.delegator)}
    ${field('Salt', r.salt)}
    <div class="k" style="margin-top:14px">Caveats (${r.caveats.length})</div>
    ${caveats}
  </div>`
}
