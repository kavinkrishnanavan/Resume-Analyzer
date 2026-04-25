import { atsProfiles } from "./atsProfiles.js";
import { runAtsScoring } from "./scoreEngine.js";

export function analyzeAgainstJd({ cvText, jdText, atsType }) {
  const profile = atsProfiles[atsType];
  const fullProfile = { ...profile, key: atsType };

  const result = runAtsScoring({
    cvText,
    jdText,
    profile: fullProfile
  });

  const missingSkills = result.breakdown.skillMatch.missing;
  const matchedSkills = result.breakdown.skillMatch.matched;

  return {
    atsType,
    atsScore: result.finalScore,
    missingSkills,
    matchedSkills,
    breakdown: result.breakdown,
    extracted: result.extracted,
    parsedResume: result.parsedResume
  };
}

