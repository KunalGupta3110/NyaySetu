class LegalDomainClassifier {
  constructor() {
    this.domains = {
      CRIMINAL: {
        name: 'Criminal Law',
        keywords: ['crime', 'arrest', 'fir', 'police', 'charge', 'ipc', 'bns', 'criminal', 'conviction', 'bail', 'murder', 'theft', 'assault', 'harassment'],
        sections: /Section \d+[\s\w]*(IPC|BNS|Bharatiya Nyaya Sanhita)/gi,
        lawSources: ['IPC', 'BNS', 'CrPC', 'Criminal Procedure Code']
      },
      CIVIL: {
        name: 'Civil Law',
        keywords: ['contract', 'dispute', 'property', 'compensation', 'damages', 'civil', 'suit', 'plaintiff', 'defendant', 'liability'],
        sections: /Section \d+[\s\w]*(CPC|Civil Procedure Code)/gi,
        lawSources: ['CPC', 'Contract Act', 'Tort Law']
      },
      PROPERTY: {
        name: 'Property Law',
        keywords: ['property', 'land', 'real estate', 'inheritance', 'ownership', 'lease', 'tenant', 'landlord', 'partition'],
        sections: /Section \d+[\s\w]*(Transfer of Property|Registration|Land)/gi,
        lawSources: ['Transfer of Property Act', 'Registration Act', 'Land Laws']
      },
      FAMILY: {
        name: 'Family Law',
        keywords: ['marriage', 'divorce', 'custody', 'maintenance', 'alimony', 'succession', 'inheritance', 'dowry', 'domestic violence'],
        sections: /Section \d+[\s\w]*(Dowry|Domestic Violence|Maintenance|Adoption)/gi,
        lawSources: ['Hindu Marriage Act', 'Protection of Women from DV Act', 'Successio n Act']
      },
      LABOR: {
        name: 'Employment & Labor Law',
        keywords: ['employment', 'salary', 'wrongful termination', 'workplace', 'labor', 'wages', 'discrimination', 'overtime', 'gratuity'],
        sections: /Section \d+[\s\w]*(Labor Code|Employment|Wages)/gi,
        lawSources: ['Labor Code', 'Employment Law', 'Wage Act']
      },
      CONSUMER: {
        name: 'Consumer Protection Law',
        keywords: ['consumer', 'product', 'defective', 'warranty', 'refund', 'cheating', 'false advertising', 'service quality'],
        sections: /Section \d+[\s\w]*(Consumer Protection Act)/gi,
        lawSources: ['Consumer Protection Act 2019']
      },
      CYBER: {
        name: 'Cyber & IT Law',
        keywords: ['cyber', 'hacking', 'data breach', 'online fraud', 'digital', 'it act', 'identity theft', 'ransomware'],
        sections: /Section \d+[\s\w]*(Information Technology|Cyber)/gi,
        lawSources: ['IT Act 2000', 'Cyber Law']
      },
      TAX: {
        name: 'Tax Law',
        keywords: ['tax', 'gst', 'income tax', 'assessment', 'deduction', 'compliance', 'filing', 'audit'],
        sections: /Section \d+[\s\w]*(Income Tax|GST)/gi,
        lawSources: ['Income Tax Act', 'GST Law']
      },
      CORPORATE: {
        name: 'Corporate & Business Law',
        keywords: ['company', 'corporate', 'business', 'incorporation', 'shareholder', 'partnership', 'merger', 'acquisition'],
        sections: /Section \d+[\s\w]*(Companies|Business)/gi,
        lawSources: ['Companies Act', 'Business Law']
      },
      CONSTITUTIONAL: {
        name: 'Constitutional Law',
        keywords: ['constitution', 'fundamental rights', 'article', 'amendment', 'statutory', 'laws', 'rights'],
        sections: /Article \d+[\s]*(Constitution)/gi,
        lawSources: ['Indian Constitution']
      }
    };
  }

  classify(query) {
    const lowerQuery = query.toLowerCase();
    const scores = {};

    Object.entries(this.domains).forEach(([domainKey, domain]) => {
      let score = 0;

      // Keyword matching
      domain.keywords.forEach(keyword => {
        if (lowerQuery.includes(keyword)) score += 2;
      });

      // Section pattern matching
      if (domain.sections.test(query)) score += 3;

      scores[domainKey] = score;
    });

    const topDomain = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return topDomain ? {
      domain: topDomain[0],
      name: this.domains[topDomain[0]].name,
      confidence: Math.min(topDomain[1] / 5, 1),
      lawSources: this.domains[topDomain[0]].lawSources
    } : {
      domain: 'GENERAL',
      name: 'General Legal Issue',
      confidence: 0.3,
      lawSources: []
    };
  }

  getRelevantSources(domain) {
    return this.domains[domain]?.lawSources || [];
  }

  getGuidelinesFor(domain) {
    const guidelines = {
      CRIMINAL: 'Focus on constitutional rights, arrest procedures, and due process. Always recommend immediate lawyer consultation.',
      CIVIL: 'Clarify burden of proof, evidence requirements, and remedy avail able.',
      PROPERTY: 'Verify ownership documentation, registration details, and title clarity.',
      FAMILY: 'Address statutory protections and procedural requirements.',
      LABOR: 'Emphasize employee statutory rights and grievance procedures.',
      CONSUMER: 'Reference Consumer Protection Act 2019 protections and remedies.',
      CYBER: 'Highlight digital evidence preservation and IT Act provisions.',
      TAX: 'Recommend qualified tax advisor for compliance strategies.',
      CORPORATE: 'Consult company law experts for governance matters.',
      CONSTITUTIONAL: 'Reference relevant Articles and Supreme Court interpretations.'
    };
    return guidelines[domain] || 'Consult with qualified legal professional.';
  }
}

module.exports = LegalDomainClassifier;
