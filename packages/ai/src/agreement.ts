import { evidenceMatchesContext, supportsHighConsensusCitations, type DirectionalEvidence } from './core-pure';
import type { InterpretationPayload } from './payload';
import { resolveCitation } from './signalIds';

/** Shared affirmative-claim gate for all three AI validators. */
export function hasHighConsensusClaim(text: string): boolean {
  return text.split(/[。！？!?\n；;]/).some(sentence => sentence.includes('高共識') &&
    !/(?:不算|不是|不構成|不能稱(?:為)?|不能說(?:是)?|沒有|無法確認|無法稱(?:為)?|未達到|未形成|不足以稱(?:為)?)[^。！？!?\n；;]{0,12}高共識|高共識(?:不成立|不足|未成立)/.test(sentence));
}

export function payloadAgreementEvidence(payload: InterpretationPayload): DirectionalEvidence[] {
  if (payload.payloadVersion < 2) return [];
  const out: DirectionalEvidence[] = [];
  const timeline = payload.timeline;
  if (timeline) for (const cell of [...timeline.years, ...timeline.months]) {
    for (const domain of cell.domains) if (evidenceMatchesContext(domain.directionalEvidence, {
      domain: domain.domain, window: cell.window, thresholds: timeline.thresholds, systems: domain.systems,
    })) out.push(domain.directionalEvidence);
  }
  const question = payload.question;
  if (question) for (const item of question.top) {
    for (const proof of item.directionalEvidence ?? []) if (evidenceMatchesContext(proof, {
      domain: proof.domain, window: item.window, thresholds: question.thresholds,
    })) out.push(proof);
  }
  return out;
}

export function payloadSupportsHighConsensus(payload: InterpretationPayload, citedIds: readonly string[]): boolean {
  const byId = new Map(payload.signals.map(signal => [signal.id, signal]));
  const available = [...byId.keys()];
  const citations = citedIds.flatMap(cited => {
    const id = resolveCitation(cited, available);
    const signal = id === null ? undefined : byId.get(id);
    return signal ? [signal] : [];
  });
  return supportsHighConsensusCitations(payloadAgreementEvidence(payload), citations);
}
