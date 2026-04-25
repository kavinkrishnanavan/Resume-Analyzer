export const skillOntology = {
  technical: new Set([
    "javascript",
    "typescript",
    "node.js",
    "react",
    "html",
    "css",
    "python",
    "java",
    "c#",
    "sql",
    "rest",
    "graphql",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "ci/cd",
    "microservices"
  ]),
  tools: new Set([
    "git",
    "github",
    "jira",
    "workday",
    "cornerstone",
    "taleo",
    "excel",
    "power bi",
    "tableau",
    "aspen hysys",
    "hysys"
  ]),
  domain: new Set([
    "process simulation",
    "oil & gas",
    "fintech",
    "healthcare",
    "e-commerce",
    "supply chain",
    "manufacturing"
  ]),
  certifications: new Set([
    "aws certified solutions architect",
    "pmp",
    "csm",
    "itil"
  ])
};

export const skillAliases = {
  "aspen hysys": "process simulation",
  hysys: "process simulation",
  "process simulator": "process simulation",
  "nodejs": "node.js",
  "node": "node.js",
  "react.js": "react",
  "reactjs": "react",
  "js": "javascript",
  "ts": "typescript",
  "amazon web services": "aws",
  "ms azure": "azure",
  "ci cd": "ci/cd",
  "continuous integration": "ci/cd",
  "continuous delivery": "ci/cd"
};

export const skillPatterns = [
  /\bnode\.?js\b/gi,
  /\breact(?:\.js)?\b/gi,
  /\btypescript\b/gi,
  /\bjavascript\b/gi,
  /\bhtml\b/gi,
  /\bcss\b/gi,
  /\bexpress\b/gi,
  /\brest\b/gi,
  /\bgraphql\b/gi,
  /\baws\b/gi,
  /\bazure\b/gi,
  /\bgcp\b/gi,
  /\bdocker\b/gi,
  /\bkubernetes\b/gi,
  /\bci\/?cd\b/gi,
  /\bgit(?:hub)?\b/gi,
  /\bworkday\b/gi,
  /\bcornerstone\b/gi,
  /\btaleo\b/gi,
  /\baspen hysys\b/gi,
  /\bhysys\b/gi,
  /\bprocess simulation\b/gi,
  /\bpower bi\b/gi,
  /\btableau\b/gi
];

