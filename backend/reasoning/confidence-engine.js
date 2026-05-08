const CONFIDENCE_LEVELS = {
  HIGH: { score: 90, label: 'High Confidence', color: '#10B981', icon: '✅' },
  MEDIUM: { score: 70, label: 'Medium Confidence', color: '#F59E0B', icon: '⚠️' },
  LOW: { score: 40, label: 'Low Confidence', color: '#EF4444', icon: '❌' }
};

class ConfidenceEngine {
  constructor() {
    this.legalSourceWeights = {
      ipc: 1.0,
      bnsPc: 0.95,
      civilProcedure: 0.9,
      constitutionalProvisions: 1.0,
      supremeCourtPrecedent: 0.98,
      highCourtPrecedent: 0.85,
      statute: 0.9,
      legalNotice: 0.7,
      judicialInterpretation: 0.88,
      administrativeOrder: 0.75
    };

    this.factVerificationWeights = {
      userProvided: 0.6,
      documentSupported: 0.9,
      witnessStatement: 0.75,
      videoEvidence: 0.95,
      governmentRecord: 0.99,
      unverified: 0.3
    };
  }

  calculateResponseConfidence(response) {
    let sources = 0;
    let cited = 0;
    let factualAccuracy = 0;
    let hallucination = 0;

    // Check for legal sources
    const sourcePatterns = [
      /Section \d+[\w\s]*(IPC|BNS|Indian Penal Code|Bharatiya Nyaya Sanhita)/gi,
      /Article \d+[\s]*(Constitution)/gi,
      /Schedule [\w]*(Constitution)/gi,
      /Supreme Court|High Court|Judgment|Precedent/gi,
      /Act[\s,][\d\w]*(Rights|Protection|Procedure)/gi
    ];

    sourcePatterns.forEach(pattern => {
      if (pattern.test(response)) {
        sources++;
        cited += pattern.test(response) ? 1 : 0;
      }
    });

    // Anti-hallucination check
    const fabricationPatterns = [
      /Section \d{4,}/i, // Suspicious high section numbers
      /invented|fabricated|not found in|doesn't exist/i,
      /guarantee|definitely|will certainly/i // Over-confident language
    ];

    fabricationPatterns.forEach(pattern => {
      if (pattern.test(response)) hallucination++;
    });

    // Check for uncertainty acknowledgment
    const uncertaintyMarkers = [
      /uncertain|may|could|might|subject to|depends on|fact-specific/i,
      /recommend.*lawyer|consult.*advocate|professional review/i,
      /information insufficient|more details needed|clarification/i
    ];

    let uncertaintyScore = 0;
    uncertaintyMarkers.forEach(marker => {
      if (marker.test(response)) uncertaintyScore++;
    });

    // Calculate final confidence
    const sourceScore = sources > 0 ? Math.min(sources * 15, 40) : 0;
    const uncertaintyPenalty = hallucination > 0 ? -50 : 0;
    const caution Bonus = uncertaintyScore > 0 ? 15 : 0;

    const confidence = Math.max(
      30,
      sourceScore + cautionBonus + uncertaintyPenalty
    );

    return {
      score: Math.min(confidence, 100),
      level: this.getConfidenceLevel(confidence),
      sources: sources,
      hallucination: hallucination > 0,
      hasUncertainty: uncertaintyScore > 0
    };
  }

  getConfidenceLevel(score) {
    if (score >= 85) return CONFIDENCE_LEVELS.HIGH;
    if (score >= 65) return CONFIDENCE_LEVELS.MEDIUM;
    return CONFIDENCE_LEVELS.LOW;
  }

  scoreSourceCredibility(sourceType) {
    return this.legalSourceWeights[sourceType] || 0.5;
  }

  scoreFact Verification(verificationStatus) {
    return this.factVerificationWeights[verificationStatus] || 0.3;
  }

  generateConfidenceLabel(score) {
    const level = this.getConfidenceLevel(score);
    return `${level.icon} ${level.label} (${Math.round(score)}%)`;
  }

  getEscalationRecommendation(score) {
    if (score < 50) {
      return {
        escalate: true,
        message: 'Legal complexity detected. Lawyer review strongly recommended.',
        urgency: 'CRITICAL'
      };
    }
    if (score < 70) {
      return {
        escalate: true,
        message: 'Uncertainty in response. Consult a qualified lawyer for verification.',
        urgency: 'HIGH'
      };
    }
    return {
      escalate: false,
      message: 'General legal information provided. Not a substitute for professional counsel.',
      urgency: 'NORMAL'
    };
  }
}

module.exports = ConfidenceEngine;
