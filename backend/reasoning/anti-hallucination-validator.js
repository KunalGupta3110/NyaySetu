class AntiHallucinationValidator {
  constructor() {
    // Verified Indian legal sections and acts
    this.validIndianLaws = {
      IPC: {
        maxSections: 511,
        name: 'Indian Penal Code',
        chapters: 45
      },
      BNS: {
        maxSections: 358,
        name: 'Bharatiya Nyaya Sanhita',
        chapters: 2
      },
      CrPC: {
        maxSections: 484,
        name: 'Criminal Procedure Code'
      },
      CPC: {
        maxSections: 229,
        name: 'Civil Procedure Code'
      },
      Constitution: {
        maxArticles: 395,
        maxSchedules: 12,
        name: 'Indian Constitution'
      }
    };

    this.invalidClaims = [
      /Section \d{4,}/i,
      /Article \d{4,}/i,
      /Clause \d{4,}/i,
      /Schedule \d{3,}/i
    ];

    this.overconfidentLanguage = [
      /will certainly/i,
      /guarantee you will/i,
      /you will definitely win/i,
      /you are guaranteed/i,
      /absolutely will/i,
      /100% sure/i
    ];

    this.harmfulAdvice = [
      /tamper.*evidence/i,
      /destroy.*document/i,
      /pay.*bribe/i,
      /fake.*fir/i,
      /falsif.*record/i,
      /perjury|lie.*court/i
    ];
  }

  validate(responseText) {
    const violations = [];

    // Check for invalid section numbers
    const sectionMatches = responseText.match(/Section (\d+)[\s\w]*(IPC|BNS|CrPC|CPC|Constitution)/gi) || [];
    sectionMatches.forEach(match => {
      const issue = this.validateSectionNumber(match);
      if (issue) violations.push(issue);
    });

    // Check for article violations
    const articleMatches = responseText.match(/Article (\d+)/g) || [];
    articleMatches.forEach(match => {
      const num = parseInt(match.match(/\d+/)[0]);
      if (num > this.validIndianLaws.Constitution.maxArticles) {
        violations.push({
          type: 'INVALID_ARTICLE',
          message: `Article ${num} does not exist in Indian Constitution`,
          severity: 'CRITICAL'
        });
      }
    });

    // Check for harmful advice
    this.harmfulAdvice.forEach(pattern => {
      if (pattern.test(responseText)) {
        violations.push({
          type: 'HARMFUL_ADVICE',
          message: 'Response contains potentially illegal guidance',
          severity: 'CRITICAL'
        });
      }
    });

    // Check for overconfident language
    this.overconfidentLanguage.forEach(pattern => {
      if (pattern.test(responseText)) {
        violations.push({
          type: 'OVERCONFIDENCE',
          message: 'Response uses overconfident language about legal outcomes',
          severity: 'HIGH'
        });
      }
    });

    return {
      isValid: violations.length === 0,
      violations: violations,
      severity: violations.length > 0 ? 'BLOCK' : 'SAFE'
    };
  }

  validateSectionNumber(sectionText) {
    const match = sectionText.match(/Section (\d+)[\s\w]*(IPC|BNS|CrPC|CPC)/i);
    if (!match) return null;

    const sectionNum = parseInt(match[1]);
    const lawType = match[2].toUpperCase();

    const maxSection = {
      IPC: 511,
      BNS: 358,
      CrPC: 484,
      CPC: 229
    }[lawType];

    if (maxSection && sectionNum > maxSection) {
      return {
        type: 'INVALID_SECTION',
        message: `Section ${sectionNum} does not exist in ${lawType} (max: ${maxSection})`,
        severity: 'CRITICAL'
      };
    }

    return null;
  }

  checkForFabricatedPrecedent(responseText) {
    const precedentPatterns = [
      /\b(landmark|historic|famous)\s+case\s+(?!.*v\..*\d{4})/i,
      /Supreme Court.*ruled.*(?!in|on)\s+[\w\s]{100,}/i
    ];

    return precedentPatterns.some(pattern => pattern.test(responseText));
  }

  sanitizeResponse(responseText) {
    let sanitized = responseText;

    // Remove/flag suspicious claims
    sanitized = sanitized.replace(
      /(?:According to|The law states|It is ruled) \[.*?\]/gi,
      '[This claim needs verification]'
    );

    // Add disclaimers for uncertain statements
    if (/may|might|could|possibly/i.test(sanitized)) {
      sanitized = `⚠️ UNCERTAIN: ${sanitized}`;
    }

    return sanitized;
  }

  generateValidationReport(response) {
    const validation = this.validate(response);
    return {
      passed: validation.isValid,
      violations: validation.violations,
      requiresEscalation: validation.violations.some(v => v.severity === 'CRITICAL'),
      escalationMessage: validation.violations
        .filter(v => v.severity === 'CRITICAL')
        .map(v => v.message)
        .join(' | ')
    };
  }
}

module.exports = AntiHallucinationValidator;
