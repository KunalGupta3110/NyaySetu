class LegalResponseFormatter {
  constructor(confidenceEngine, domainClassifier) {
    this.confidenceEngine = confidenceEngine;
    this.domainClassifier = domainClassifier;
  }

  formatStructuredResponse(aiResponse, query, metadata = {}) {
    const domain = this.domainClassifier.classify(query);
    const confidence = this.confidenceEngine.calculateResponseConfidence(aiResponse);
    const escalation = this.confidenceEngine.getEscalationRecommendation(confidence.score);

    return {
      // Response content
      response: aiResponse,

      // Metadata
      metadata: {
        domain: domain.name,
        domainCode: domain.domain,
        confidenceScore: confidence.score,
        confidenceLevel: confidence.level.label,
        confidenceIcon: confidence.level.icon,
        hasUncertainty: confidence.hasUncertainty,
        hallucination: confidence.hallucination,
        timestamp: new Date().toISOString()
      },

      // Safety information
      safety: {
        escalate: escalation.escalate,
        escalationMessage: escalation.message,
        escalationUrgency: escalation.urgency,
        recommendLawyerReview: confidence.score < 70
      },

      // Guidance
      guidance: {
        domainGuideline: this.domainClassifier.getGuidelinesFor(domain.domain),
        nextSteps: this.generateNextSteps(domain.domain, confidence.score),
        legalSources: domain.lawSources
      },

      // UI hints
      ui: {
        badge: this.generateConfidenceBadge(confidence),
        alertLevel: this.getAlertLevel(confidence.score),
        emphasizeDisclaimer: confidence.score < 70
      }
    };
  }

  generateJudgeStyleAnalysis(query, aiResponse) {
    return {
      // 1. Issue Understanding
      issueAnalysis: {
        headline: this.extractHeadline(aiResponse),
        keyFacts: this.extractKeyFacts(query),
        legalQuestions: this.extractLegalQuestions(aiResponse)
      },

      // 2. Legal Framework
      legalFramework: {
        applicableLaws: this.extractApplicableLaws(aiResponse),
        judicialPrinciples: this.extractPrinciples(aiResponse),
        precedentCitations: this.extractPrecedents(aiResponse)
      },

      // 3. Reasoning Analysis
      reasoning: {
        logicalFlow: this.analyzeLogicalFlow(aiResponse),
        factAnalysis: this.analyzeFacts(aiResponse),
        legalInterpretation: this.analyzeLegalInterpretation(aiResponse)
      },

      // 4. Conclusion & Risk Assessment
      conclusion: {
        possibleOutcomes: this.extractOutcomes(aiResponse),
        uncertaintyFactors: this.extractUncertainties(aiResponse),
        recommendedAction: this.extractRecommendedActions(aiResponse),
        riskLevel: this.assessRiskLevel(aiResponse)
      }
    };
  }

  formatForUI(enrichedResponse) {
    return {
      mainResponse: enrichedResponse.response,

      confidenceBadge: {
        text: enrichedResponse.metadata.confidenceLevel,
        icon: enrichedResponse.metadata.confidenceIcon,
        percentage: enrichedResponse.metadata.confidenceScore,
        color: this.getColorForConfidence(enrichedResponse.metadata.confidenceScore),
        tooltip: this.getConfidenceTooltip(enrichedResponse.metadata.confidenceScore)
      },

      disclaimer: this.generateDisclaimer(enrichedResponse),

      actionItems: [
        {
          type: 'lawyer',
          label: enrichedResponse.safety.recommendLawyerReview ? '👨‍⚖️ Consult a Lawyer' : '👨‍⚖️ Connect with Lawyer',
          priority: enrichedResponse.safety.recommendLawyerReview ? 'HIGH' : 'NORMAL'
        },
        {
          type: 'document',
          label: '📄 Generate Legal Document',
          priority: 'NORMAL'
        }
      ],

      alerts: this.generateAlerts(enrichedResponse)
    };
  }

  generateDisclaimer(enrichedResponse) {
    const baseDisclaimer = 'This is general legal information, not a substitute for professional legal advice.';

    if (enrichedResponse.safety.escalate) {
      return `⚠️ ${enrichedResponse.safety.escalationMessage} ${baseDisclaimer}`;
    }

    if (enrichedResponse.metadata.confidenceScore < 70) {
      return `ℹ️ Information is uncertain. ${baseDisclaimer} A lawyer should review this matter.`;
    }

    return `ℹ️ ${baseDisclaimer} Always consult a qualified advocate for your specific case.`;
  }

  generateAlerts(enrichedResponse) {
    const alerts = [];

    if (enrichedResponse.safety.escalate) {
      alerts.push({
        type: 'escalation',
        severity: enrichedResponse.safety.escalationUrgency,
        message: enrichedResponse.safety.escalationMessage,
        icon: '🚨'
      });
    }

    if (enrichedResponse.metadata.hallucination) {
      alerts.push({
        type: 'validation',
        severity: 'HIGH',
        message: 'Response contains claims that need verification',
        icon: '⚠️'
      });
    }

    if (enrichedResponse.metadata.hasUncertainty) {
      alerts.push({
        type: 'uncertainty',
        severity: 'NORMAL',
        message: 'This response contains uncertain elements that depend on specific facts',
        icon: 'ℹ️'
      });
    }

    return alerts;
  }

  generateNextSteps(domain, confidence) {
    const steps = [
      'Gather all relevant documents and evidence',
      'Document timeline of events',
      'Identify all parties involved'
    ];

    if (domain === 'CRIMINAL') {
      steps.push('Do not discuss the matter without legal counsel');
      steps.push('Know your constitutional rights');
    }

    if (confidence < 70) {
      steps.unshift('Consult a qualified lawyer immediately');
    }

    return steps;
  }

  generateConfidenceBadge(confidence) {
    return `${confidence.level.icon} ${confidence.level.label} (${Math.round(confidence.score)}%)`;
  }

  getAlertLevel(score) {
    if (score >= 85) return 'info';
    if (score >= 65) return 'warning';
    return 'error';
  }

  getColorForConfidence(score) {
    if (score >= 85) return '#10B981'; // Green
    if (score >= 65) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  }

  getConfidenceTooltip(score) {
    if (score >= 85) return 'Well-grounded in legal sources and evidence';
    if (score >= 65) return 'Partially grounded; clarification may be needed';
    return 'Low confidence; lawyer review strongly recommended';
  }

  // Helper extraction methods
  extractHeadline(text) {
    const firstLine = text.split('\n')[0];
    return firstLine.substring(0, 100) + (firstLine.length > 100 ? '...' : '');
  }

  extractKeyFacts(query) {
    return query.split(/[.!?]/).filter(s => s.trim().length > 10).slice(0, 3);
  }

  extractLegalQuestions(text) {
    return text.match(/\?/g) ? text.split('?').filter(s => s.includes('could') || s.includes('can') || s.includes('should')).slice(0, 2) : [];
  }

  extractApplicableLaws(text) {
    const laws = [];
    const patterns = [
      /Section (\d+)[\s\w]*(IPC|BNS|CrPC|CPC)/gi,
      /Article (\d+)/gi,
      /(Indian Constitution|Penal Code|Procedure Code)/gi
    ];
    patterns.forEach(p => {
      const matches = text.matchAll(p);
      Array.from(matches).forEach(m => laws.push(m[0]));
    });
    return [...new Set(laws)];
  }

  extractPrinciples(text) {
    const principles = [];
    if (text.match(/burden of proof/i)) principles.push('Burden of Proof');
    if (text.match(/reasonable doubt/i)) principles.push('Reasonable Doubt');
    if (text.match(/due process/i)) principles.push('Due Process');
    if (text.match(/natural justice/i)) principles.push('Natural Justice');
    return principles;
  }

  extractPrecedents(text) {
    return text.match(/\b\w+\s+v\.\s+\w+/g) || [];
  }

  analyzeLogicalFlow(text) {
    return text.split(/Therefore|Hence|Thus|In conclusion/).length - 1 > 0 ? 'Structured' : 'Narrative';
  }

  analyzeFacts(text) {
    return text.match(/fact|evidence|document/gi)?.length || 0 > 3 ? 'Evidence-based' : 'General';
  }

  analyzeLegalInterpretation(text) {
    return text.match(/according to|Section|Article|Constitution/gi)?.length || 0 > 2 ? 'Legally grounded' : 'Interpretive';
  }

  extractOutcomes(text) {
    const outcomes = [];
    if (text.match(/entitled/i)) outcomes.push('Legally entitled to relief');
    if (text.match(/may claim/i)) outcomes.push('May file legal claim');
    if (text.match(/liable/i)) outcomes.push('Potential liability');
    return outcomes;
  }

  extractUncertainties(text) {
    return text.match(/may|might|could|depends|subject to/gi)?.length || 0;
  }

  extractRecommendedActions(text) {
    const actions = [];
    if (text.match(/file.*petition/i)) actions.push('File petition/application');
    if (text.match(/notice/i)) actions.push('Issue legal notice');
    if (text.match(/consult.*lawyer/i)) actions.push('Consult a lawyer');
    return actions;
  }

  assessRiskLevel(text) {
    const criminalKeywords = /crime|arrest|imprisonment|criminal/gi;
    const matches = text.match(criminalKeywords)?.length || 0;
    if (matches > 3) return 'HIGH';
    if (matches > 1) return 'MEDIUM';
    return 'LOW';
  }
}

module.exports = LegalResponseFormatter;
