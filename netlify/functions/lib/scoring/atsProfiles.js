export const atsProfiles = {
  cornerstone: {
    name: "Cornerstone",
    weights: {
      skillMatch: 0.42,
      skillFrequency: 0.14,
      context: 0.16,
      keywordMatch: 0.09,
      formatting: 0.09,
      experienceRelevance: 0.10
    },
    strictness: {
      parsing: 0.55,
      formatting: 0.55,
      keywordExactness: 0.50
    }
  },
  workday: {
    name: "Workday",
    weights: {
      skillMatch: 0.38,
      skillFrequency: 0.15,
      context: 0.13,
      keywordMatch: 0.14,
      formatting: 0.10,
      experienceRelevance: 0.10
    },
    strictness: {
      parsing: 0.78,
      formatting: 0.62,
      keywordExactness: 0.62
    }
  },
  taleo: {
    name: "Taleo",
    weights: {
      skillMatch: 0.35,
      skillFrequency: 0.14,
      context: 0.12,
      keywordMatch: 0.19,
      formatting: 0.10,
      experienceRelevance: 0.10
    },
    strictness: {
      parsing: 0.70,
      formatting: 0.78,
      keywordExactness: 0.82
    }
  }
};

