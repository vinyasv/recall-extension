/**
 * RAG Evaluation Dataset
 *
 * Contains questions and expected answer attributes for evaluating RAG quality.
 * Each test case includes:
 * - question: The user's question
 * - expectedSources: URLs or domains that should be cited
 * - expectedKeywords: Key terms that should appear in the answer
 * - category: Type of question (factual, temporal, conceptual, etc.)
 * - difficulty: easy, medium, hard
 */

export interface RAGTestCase {
  id: string;
  question: string;
  category: 'factual' | 'temporal' | 'conceptual' | 'aggregation' | 'comparison';
  difficulty: 'easy' | 'medium' | 'hard';

  // Expected answer attributes (for evaluation)
  expectedSources?: string[]; // URLs or domains that should be cited
  expectedKeywords?: string[]; // Keywords that should appear in answer
  shouldNotAnswer?: boolean; // True if there's insufficient information

  // Optional: Ground truth answer for reference
  groundTruth?: string;

  // Context: What pages need to be indexed for this test to work
  requiredPages?: {
    url: string;
    title: string;
    description: string;
  }[];
}

/**
 * Example RAG evaluation dataset
 *
 * To use this:
 * 1. Index the required pages by visiting them
 * 2. Run the eval script
 * 3. Compare RAG answers against expected attributes
 */
export const RAG_EVAL_DATASET: RAGTestCase[] = [
  // ===== FACTUAL QUESTIONS =====
  {
    id: 'factual-001',
    question: 'What is React?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['javascript', 'library', 'ui', 'component', 'facebook', 'meta'],
    expectedSources: ['react.dev', 'reactjs.org'],
    groundTruth: 'React is a JavaScript library for building user interfaces, developed by Meta/Facebook',
    requiredPages: [
      {
        url: 'https://react.dev/',
        title: 'React',
        description: 'React official documentation homepage'
      }
    ]
  },

  {
    id: 'factual-002',
    question: 'What is TypeScript?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['javascript', 'typed', 'superset', 'microsoft', 'types', 'compile'],
    expectedSources: ['typescriptlang.org'],
    groundTruth: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript',
    requiredPages: [
      {
        url: 'https://www.typescriptlang.org/',
        title: 'TypeScript',
        description: 'TypeScript official documentation'
      }
    ]
  },

  {
    id: 'factual-003',
    question: 'What is Node.js?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['javascript', 'runtime', 'server', 'v8', 'asynchronous'],
    expectedSources: ['nodejs.org'],
    groundTruth: 'Node.js is a JavaScript runtime built on Chrome V8 engine',
    requiredPages: [
      {
        url: 'https://nodejs.org/',
        title: 'Node.js',
        description: 'Node.js official website'
      }
    ]
  },

  {
    id: 'factual-004',
    question: 'What is Python?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['programming', 'language', 'interpreted', 'high-level', 'dynamic'],
    expectedSources: ['python.org'],
    groundTruth: 'Python is a high-level, interpreted programming language',
    requiredPages: [
      {
        url: 'https://www.python.org/',
        title: 'Python',
        description: 'Python official website'
      }
    ]
  },

  {
    id: 'factual-005',
    question: 'What is Git?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['version', 'control', 'distributed', 'repository', 'commit'],
    expectedSources: ['git-scm.com'],
    groundTruth: 'Git is a distributed version control system',
    requiredPages: [
      {
        url: 'https://git-scm.com/',
        title: 'Git',
        description: 'Git official website'
      }
    ]
  },

  {
    id: 'factual-006',
    question: 'What is Tailwind CSS?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['css', 'utility', 'framework', 'classes', 'styling'],
    expectedSources: ['tailwindcss.com'],
    groundTruth: 'Tailwind CSS is a utility-first CSS framework',
    requiredPages: [
      {
        url: 'https://tailwindcss.com/',
        title: 'Tailwind CSS',
        description: 'Tailwind CSS documentation'
      }
    ]
  },

  {
    id: 'factual-007',
    question: 'What is PostgreSQL?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['database', 'sql', 'relational', 'open', 'source'],
    expectedSources: ['postgresql.org'],
    groundTruth: 'PostgreSQL is an open source relational database',
    requiredPages: [
      {
        url: 'https://www.postgresql.org/',
        title: 'PostgreSQL',
        description: 'PostgreSQL official website'
      }
    ]
  },

  {
    id: 'factual-008',
    question: 'What is Docker?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['container', 'platform', 'deploy', 'application', 'image'],
    expectedSources: ['docker.com'],
    groundTruth: 'Docker is a platform for developing, shipping, and running applications in containers',
    requiredPages: [
      {
        url: 'https://www.docker.com/',
        title: 'Docker',
        description: 'Docker official website'
      }
    ]
  },

  {
    id: 'factual-009',
    question: 'What is GraphQL?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['query', 'language', 'api', 'data', 'facebook'],
    expectedSources: ['graphql.org'],
    groundTruth: 'GraphQL is a query language for APIs',
    requiredPages: [
      {
        url: 'https://graphql.org/',
        title: 'GraphQL',
        description: 'GraphQL official website'
      }
    ]
  },

  {
    id: 'factual-010',
    question: 'What is Rust?',
    category: 'factual',
    difficulty: 'easy',
    expectedKeywords: ['programming', 'language', 'systems', 'memory', 'safe', 'performance'],
    expectedSources: ['rust-lang.org'],
    groundTruth: 'Rust is a systems programming language focused on safety and performance',
    requiredPages: [
      {
        url: 'https://www.rust-lang.org/',
        title: 'Rust',
        description: 'Rust programming language'
      }
    ]
  },

  // ===== TEMPORAL QUESTIONS =====
  {
    id: 'temporal-001',
    question: 'What articles did I read about AI today?',
    category: 'temporal',
    difficulty: 'medium',
    expectedKeywords: [], // Will vary based on actual browsing
    expectedSources: [], // Should cite pages from today
    groundTruth: 'Depends on actual browsing history'
  },

  {
    id: 'temporal-002',
    question: 'What was the last documentation page I visited?',
    category: 'temporal',
    difficulty: 'easy',
    expectedKeywords: ['documentation', 'docs'],
    expectedSources: [], // Should cite most recent doc page
    groundTruth: 'Depends on actual browsing history'
  },

  // ===== CONCEPTUAL QUESTIONS =====
  {
    id: 'conceptual-001',
    question: 'How do React hooks work?',
    category: 'conceptual',
    difficulty: 'medium',
    expectedKeywords: ['state', 'usestate', 'useeffect', 'functional', 'component'],
    expectedSources: ['react.dev'],
    groundTruth: 'React hooks are functions that let you use state and lifecycle features in functional components',
    requiredPages: [
      {
        url: 'https://react.dev/reference/react',
        title: 'React Reference',
        description: 'React hooks documentation'
      }
    ]
  },

  {
    id: 'conceptual-002',
    question: 'How does Docker containerization work?',
    category: 'conceptual',
    difficulty: 'medium',
    expectedKeywords: ['container', 'image', 'isolate', 'layer', 'runtime'],
    expectedSources: ['docker.com', 'docs.docker.com'],
    groundTruth: 'Docker uses Linux containers to package applications with their dependencies',
    requiredPages: [
      {
        url: 'https://docs.docker.com/get-started/docker-overview/',
        title: 'Docker Overview',
        description: 'Docker architecture documentation'
      }
    ]
  },

  {
    id: 'conceptual-003',
    question: 'What is the difference between SQL and NoSQL databases?',
    category: 'conceptual',
    difficulty: 'medium',
    expectedKeywords: ['relational', 'schema', 'structured', 'flexible', 'document'],
    expectedSources: ['mongodb.com', 'postgresql.org'],
    groundTruth: 'SQL databases are relational with fixed schemas, NoSQL are flexible and schema-less',
    requiredPages: [
      {
        url: 'https://www.mongodb.com/nosql-explained',
        title: 'NoSQL Explained',
        description: 'MongoDB NoSQL explanation'
      }
    ]
  },

  {
    id: 'conceptual-004',
    question: 'How does Git branching work?',
    category: 'conceptual',
    difficulty: 'medium',
    expectedKeywords: ['branch', 'merge', 'commit', 'pointer', 'workflow'],
    expectedSources: ['git-scm.com'],
    groundTruth: 'Git branches are lightweight pointers to commits, allowing parallel development',
    requiredPages: [
      {
        url: 'https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell',
        title: 'Git Branching',
        description: 'Git branching documentation'
      }
    ]
  },

  // ===== AGGREGATION QUESTIONS =====
  {
    id: 'aggregation-001',
    question: 'What are the main features of Next.js based on what I read?',
    category: 'aggregation',
    difficulty: 'hard',
    expectedKeywords: ['server', 'rendering', 'ssr', 'static', 'routing', 'react'],
    expectedSources: ['nextjs.org'],
    groundTruth: 'Next.js features include SSR, static generation, file-based routing, and API routes',
    requiredPages: [
      {
        url: 'https://nextjs.org/',
        title: 'Next.js',
        description: 'Next.js documentation'
      }
    ]
  },

  {
    id: 'aggregation-002',
    question: 'Summarize what I learned about Chrome extensions',
    category: 'aggregation',
    difficulty: 'hard',
    expectedKeywords: ['manifest', 'background', 'content', 'script', 'api'],
    expectedSources: ['developer.chrome.com'],
    groundTruth: 'Chrome extensions use manifests, background scripts, content scripts, and Chrome APIs',
    requiredPages: [
      {
        url: 'https://developer.chrome.com/docs/extensions/',
        title: 'Chrome Extensions',
        description: 'Chrome extension documentation'
      }
    ]
  },

  // ===== COMPARISON QUESTIONS =====
  {
    id: 'comparison-001',
    question: 'What is the difference between React and Vue?',
    category: 'comparison',
    difficulty: 'hard',
    expectedKeywords: ['framework', 'library', 'component', 'virtual', 'dom'],
    expectedSources: ['react.dev', 'vuejs.org'],
    groundTruth: 'React is a library focused on UI, Vue is a progressive framework with more built-in features',
    requiredPages: [
      {
        url: 'https://react.dev/',
        title: 'React',
        description: 'React documentation'
      },
      {
        url: 'https://vuejs.org/',
        title: 'Vue.js',
        description: 'Vue.js documentation'
      }
    ]
  },

  // ===== EDGE CASES =====
  {
    id: 'edge-001',
    question: 'Who won the 2024 World Series?',
    category: 'factual',
    difficulty: 'easy',
    shouldNotAnswer: true,
    groundTruth: 'Should say no information available if not visited sports sites',
    requiredPages: []
  },

  {
    id: 'edge-002',
    question: 'What did I have for breakfast?',
    category: 'factual',
    difficulty: 'easy',
    shouldNotAnswer: true,
    groundTruth: 'Should say no information available (not in browsing history)',
    requiredPages: []
  }
];

/**
 * Helper to filter dataset by category
 */
export function getTestCasesByCategory(category: RAGTestCase['category']): RAGTestCase[] {
  return RAG_EVAL_DATASET.filter(tc => tc.category === category);
}

/**
 * Helper to filter dataset by difficulty
 */
export function getTestCasesByDifficulty(difficulty: RAGTestCase['difficulty']): RAGTestCase[] {
  return RAG_EVAL_DATASET.filter(tc => tc.difficulty === difficulty);
}

/**
 * Helper to get test cases that require specific pages
 */
export function getTestCasesRequiringPages(): RAGTestCase[] {
  return RAG_EVAL_DATASET.filter(tc => tc.requiredPages && tc.requiredPages.length > 0);
}
