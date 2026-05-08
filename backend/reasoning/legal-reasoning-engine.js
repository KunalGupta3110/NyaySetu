const ConfidenceEngine = require('./confidence-engine');
const LegalDomainClassifier = require('./domain-classifier');
const AntiHallucinationValidator = require('./anti-hallucination-validator');
const LegalResponseFormatter = require('./response-formatter');

class LegalReasoningEngine {
  constructor() {
    this.confidenceEngine = new ConfidenceEngine();
    this.domainClassifier = new LegalDomainClassifier();
    this.validator = new AntiHallucinationValidator();
    this.formatter = new LegalResponseFormatter(
      this.confidenceEngine,
      this.domainClassifier
    );
  }

  async processLegalQuery(userQuery, aiResponse, metadata = {}) {
    // 1. Domain Classification
    const domain = this.domainClassifier.classify(userQuery);

    // 2. Validation Layer
    const validation = this.validator.generateValidationReport(aiResponse);

    // 3. Confidence Scoring
    const confidence = this.confidenceEngine.calculateResponseConfidence(aiResponse);

    // 4. Judge-Style Analysis
    const analysis = this.formatter.generateJudgeStyleAnalysis(userQuery, aiResponse);

    // 5. Escalation Check
    const escalation = this.confidenceEngine.getEscalationRecommendation(confidence.score);

    // 6. Format for UI
    const uiFormatted = this.formatter.formatForUI({
      response: aiResponse,
      metadata: {
        domain: domain.name,
        domainCode: domain.domain,
        confidenceScore: confidence.score,
        confidenceLevel: confidence.level.label,
        confidenceIcon: confidence.level.icon,
        hasUncertainty: confidence.hasUncertainty,
        hallucination: confidence.hallucination
      },
      safety: {
        escalate: escalation.escalate,
        escalationMessage: escalation.message,
        escalationUrgency: escalation.urgency,
        recommendLawyerReview: confidence.score < 70
      }
    });

    return {
      // The actual legal response
      reply: aiResponse,

      // Confidence & Accuracy
      confidence: {
        score: confidence.score,
        level: confidence.level.label,
        icon: confidence.level.icon,
        percentage: Math.round(confidence.score)
      },

      // Domain & Context
      legal: {
        domain: domain.name,
        domainCode: domain.domain,
        lawSources: domain.lawSources,
        guideline: this.domainClassifier.getGuidelinesFor(domain.domain)
      },

      // Validation Results
      validation: {
        passed: validation.passed,
        violations: validation.violations,
        requiresEscalation: validation.requiresEscalation,
        escalationMessage: validation.escalationMessage
      },

      // Safety & Escalation
      safety: {
        escalate: escalation.escalate,
        escalationMessage: escalation.message,
        escalationUrgency: escalation.urgency,
        recommendLawyerReview: confidence.score < 70
      },

      // Judge-style analysis
      analysis: analysis,

      // UI formatted content
      ui: uiFormatted,

      // Metadata
      metadata: {
        timestamp: new Date().toISOString(),
        hasUncertainty: confidence.hasUncertainty,
        hallucination: confidence.hallucination,
        sources: confidence.sources
      }
    };
  }

  generateEnhancedSystemPrompt(domain) {
    const basePrompt = `You are NyaySetu AI, a human-centered Indian legal reasoning assistant. Think like an experienced lawyer, analytical judge, and legal researcher.

CORE PRINCIPLES:
✅ Think step-by-step before responding
✅ Understand legal context deeply
✅ Avoid fabricating laws, sections, or judgments
✅ Reason carefully and evidence-based ly
✅ Behave responsibly like a professional legal assistant
✅ Escalate uncertainty safely

THINK LIKE A JUDGE:
1. Understand the issue clearly
2. Identify legal domain and applicable laws
3. Retrieve relevant Indian law sections
4. Analyze facts carefully
5. Distinguish facts from assumptions
6. Consider risks and limitations
7. Generate a safe, structured response
8. Evaluate confidence and recommend escalation if needed

RESPONSE FORMAT (JUDGE-STYLE):
1. **Understanding of Issue** - Restate the legal problem
2. **Relevant Indian Law** - Cite applicable statutes, articles, sections
3. **Legal Interpretation** - Explain what the law means
4. **Your Possible Rights/Options** - What remedies are available
5. **Practical Next Steps** - What actions to take
6. **Risk/Uncertainty Note** - What depends on specific facts
7. **When to Consult a Lawyer** - When professional help is critical

ANTI-HALLUCINATION RULES (CRITICAL):
❌ NEVER invent section numbers (e.g., Section 9999 IPC)
❌ NEVER create fake Articles or Schedules
❌ NEVER fabricate Supreme Court judgments
❌ NEVER guarantee legal outcomes
❌ NEVER provide reckless legal advice
✅ IF UNCERTAIN: say so explicitly
✅ IF INFO IS MISSING: ask for clarification
✅ IF LAWS UNAVAILABLE: explain that information is insufficient

SAFETY RULES:
🚫 BLOCK harmful advice: tampering evidence, fake FIRs, bribes, perjury
🚫 AVOID overconfident language: "definitely win", "100% sure"
⚠️ FLAG complex matters for lawyer review
✅ INCLUDE disclaimers for uncertain information

${domain ? `DOMAIN FOCUS: ${domain}` : ''}`;

    return basePrompt;
  }

  async validateAndEnhance(userQuery, rawAIResponse) {
    // Run validation
    const validation = this.validator.validate(rawAIResponse);

    if (validation.severity === 'BLOCK') {
      // Block and escalate
      return {
        blocked: true,
        reason: 'Response contains invalid or harmful content',
        violations: validation.violations,
        escalate: true,
        recommendLawyerConnection: true
      };
    }

    // Process through the full reasoning engine
    return await this.processLegalQuery(userQuery, rawAIResponse);
  }

  getSystemPromptForDomain(domainCode) {
    const domain = this.domainClassifier.domains[domainCode];
    return this.generateEnhancedSystemPrompt(domain?.name || null);
  }
}

module.exports = LegalReasoningEngine;
