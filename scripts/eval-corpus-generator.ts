/**
 * Test Corpus Generator with Realistic Visit Patterns
 * Generates 1000+ pages with varying visitCounts to test frequency-based ranking
 */

export interface CorpusPage {
  id: string;
  url: string;
  title: string;
  passages: Array<{ text: string; quality: number }>;
  category: string;
  tags: string[];
  visitCount: number; // NEW: Visit frequency for testing
}

/**
 * Generate a comprehensive test corpus with realistic visit patterns
 *
 * Visit Count Distribution (models real browsing behavior):
 * - Documentation/Reference sites: 10-50 visits (frequently consulted)
 * - News/Blogs: 1-5 visits (occasional reading)
 * - Random discoveries: 1 visit (one-time visits)
 * - Homepage/Common: 50-100 visits (daily visits)
 */
export function generateTestCorpus(): CorpusPage[] {
  const pages: CorpusPage[] = [];
  let idCounter = 1;

  // Helper to create pages with visit patterns
  const createPage = (
    category: string,
    id: string,
    title: string,
    passages: Array<{ text: string; quality: number }>,
    tags: string[],
    visitPattern: 'frequent' | 'occasional' | 'rare' | 'common'
  ): CorpusPage => {
    // Assign visitCount based on pattern
    let visitCount = 1;
    switch (visitPattern) {
      case 'common':    visitCount = 50 + Math.floor(Math.random() * 50); break;  // 50-100
      case 'frequent':  visitCount = 10 + Math.floor(Math.random() * 40); break;  // 10-50
      case 'occasional': visitCount = 2 + Math.floor(Math.random() * 3); break;   // 2-5
      case 'rare':      visitCount = 1; break;                                      // 1
    }

    return {
      id,
      url: `https://example.com/${category}/${id}`,
      title,
      passages,
      category,
      tags,
      visitCount
    };
  };

  // === WEB DEVELOPMENT (200 pages) ===
  // React documentation - FREQUENTLY visited
  pages.push(createPage('web-dev', 'web-1', 'React Hooks - useState and useEffect Guide',
    [
      { text: 'React Hooks revolutionized how we write components. useState lets you add state to functional components. useEffect handles side effects like data fetching and subscriptions. These hooks make code more reusable and easier to test.', quality: 0.9 },
      { text: 'The useState hook returns a stateful value and a function to update it. During the initial render, the returned state matches the value passed as the first argument. The setState function is used to update the state and triggers a re-render.', quality: 0.85 },
      { text: 'useEffect runs after every render by default. You can optimize performance by passing a dependency array. Empty array means run once on mount. Cleanup functions prevent memory leaks when components unmount.', quality: 0.8 }
    ],
    ['react', 'hooks', 'useState', 'useEffect', 'frontend'],
    'frequent'  // Documentation - frequently consulted
  ));

  pages.push(createPage('web-dev', 'web-2', 'CSS Flexbox Complete Layout Guide',
    [
      { text: 'Flexbox is a one-dimensional layout method for arranging items in rows or columns. Items flex to fill additional space or shrink to fit into smaller spaces. It makes responsive design much easier than traditional methods.', quality: 0.9 },
      { text: 'The main axis is defined by flex-direction. justify-content aligns items along the main axis. align-items works on the cross axis. Use align-self to override alignment for individual items.', quality: 0.85 },
      { text: 'Common centering pattern: display flex, justify-content center, align-items center. This centers both horizontally and vertically. flex-wrap allows items to wrap onto multiple lines.', quality: 0.8 }
    ],
    ['css', 'flexbox', 'layout', 'frontend'],
    'frequent'
  ));

  pages.push(createPage('web-dev', 'web-3', 'Next.js App Router and Server Components',
    [
      { text: 'Next.js 13 introduced the App Router with React Server Components. This new paradigm allows rendering components on the server by default, improving performance and reducing JavaScript bundle size.', quality: 0.9 },
      { text: 'Server Components can fetch data directly without an API layer. They run on the server and never ship JavaScript to the client. Use "use client" directive for components that need interactivity or browser APIs.', quality: 0.85 },
      { text: 'App Router uses file-system based routing in the app directory. layout.tsx defines shared UI, page.tsx defines unique page content. Loading states and error boundaries are built-in.', quality: 0.8 }
    ],
    ['nextjs', 'react', 'server-components', 'app-router'],
    'frequent'
  ));

  pages.push(createPage('web-dev', 'web-4', 'Tailwind CSS Utility-First Framework',
    [
      { text: 'Tailwind CSS is a utility-first framework that provides low-level utility classes. Instead of writing custom CSS, you compose designs using pre-built utilities. This approach is faster and more maintainable.', quality: 0.9 },
      { text: 'Responsive design uses breakpoint prefixes: sm:, md:, lg:, xl:. Hover states use hover: prefix. Dark mode with dark: prefix. Combine utilities for complex designs: bg-blue-500 hover:bg-blue-700 transition.', quality: 0.85 },
      { text: 'Configure theme in tailwind.config.js. Extend default colors, spacing, and breakpoints. Use @apply directive to extract component classes. PurgeCSS removes unused styles in production.', quality: 0.8 }
    ],
    ['tailwind', 'css', 'utility', 'responsive'],
    'frequent'
  ));

  pages.push(createPage('web-dev', 'web-5', 'TypeScript Interfaces vs Types Explained',
    [
      { text: 'TypeScript offers both interfaces and type aliases. Interfaces can be extended and merged, making them ideal for object shapes. Types are more flexible and can represent unions, intersections, and primitives.', quality: 0.9 },
      { text: 'Use interfaces for public API definitions that might be extended. Use types for complex type compositions and union types. Interfaces support declaration merging, types do not.', quality: 0.85 },
      { text: 'Performance is identical between interfaces and types. Choose based on use case: interfaces for objects that will be extended, types for everything else. Both support generics and index signatures.', quality: 0.8 }
    ],
    ['typescript', 'types', 'interfaces', 'javascript'],
    'frequent'
  ));

  // Add 195 more web dev pages with varying visit patterns
  for (let i = 6; i <= 200; i++) {
    const visitPattern = i % 4 === 0 ? 'frequent' : i % 3 === 0 ? 'occasional' : 'rare';
    pages.push(createPage('web-dev', `web-${i}`, `Web Development Topic ${i}`,
      [
        { text: `This is a web development article about topic ${i}. It covers modern frontend techniques and best practices.`, quality: 0.7 },
        { text: `Learn about JavaScript frameworks, CSS methodologies, and performance optimization in this comprehensive guide.`, quality: 0.6 }
      ],
      ['web', 'frontend', 'javascript'],
      visitPattern
    ));
  }

  // === DEVOPS (200 pages) ===
  pages.push(createPage('devops', 'devops-1', 'Docker Container Networking Deep Dive',
    [
      { text: 'Docker networking enables containers to communicate with each other and the outside world. Bridge networks are the default, providing isolation. Host networking removes isolation for performance. Overlay networks connect containers across hosts.', quality: 0.9 },
      { text: 'Bridge networks use a virtual switch. Each container gets its own network namespace and IP address. Port mapping exposes services to the host. Custom bridges provide better isolation and DNS resolution.', quality: 0.85 },
      { text: 'Network drivers include bridge, host, overlay, macvlan, and none. Use docker network create to create custom networks. Containers on the same network can communicate by name.', quality: 0.8 }
    ],
    ['docker', 'networking', 'containers', 'bridge'],
    'frequent'  // DevOps documentation - frequently consulted
  ));

  pages.push(createPage('devops', 'devops-2', 'Kubernetes Pods and Container Lifecycle',
    [
      { text: 'Pods are the smallest deployable units in Kubernetes. A Pod can contain one or more containers that share networking and storage. Containers in a Pod are always co-located and co-scheduled.', quality: 0.9 },
      { text: 'Pod lifecycle phases: Pending, Running, Succeeded, Failed, Unknown. Init containers run before app containers. Readiness probes determine if Pod is ready for traffic. Liveness probes restart unhealthy containers.', quality: 0.85 },
      { text: 'Pods are ephemeral by design. Use Deployments for stateless apps, StatefulSets for stateful apps. ConfigMaps and Secrets provide configuration. Volumes persist data beyond Pod lifecycle.', quality: 0.8 }
    ],
    ['kubernetes', 'pods', 'containers', 'orchestration'],
    'frequent'
  ));

  pages.push(createPage('devops', 'devops-3', 'Terraform Infrastructure as Code with HCL',
    [
      { text: 'Terraform uses HashiCorp Configuration Language (HCL) to define infrastructure. Providers enable Terraform to manage resources across AWS, Azure, GCP, and more. State files track real-world resources.', quality: 0.9 },
      { text: 'Resources define infrastructure components. Data sources query existing infrastructure. Variables parameterize configurations. Modules enable reusable infrastructure patterns.', quality: 0.85 },
      { text: 'Terraform workflow: init downloads providers, plan previews changes, apply creates resources, destroy removes infrastructure. State locking prevents concurrent modifications.', quality: 0.8 }
    ],
    ['terraform', 'iac', 'infrastructure', 'hcl'],
    'frequent'
  ));

  pages.push(createPage('devops', 'devops-4', 'GitHub Actions CI/CD Workflows',
    [
      { text: 'GitHub Actions automates software workflows directly in your repository. Workflows are triggered by events like push, pull request, or schedule. Jobs run in parallel or sequentially on runners.', quality: 0.9 },
      { text: 'Actions are reusable units of code. Use actions from the marketplace or create custom actions. Matrix builds test across multiple versions. Secrets store sensitive data securely.', quality: 0.85 },
      { text: 'Workflow syntax uses YAML. Define triggers with "on", jobs with "jobs", steps with "steps". Use "needs" for job dependencies. Artifacts share data between jobs.', quality: 0.8 }
    ],
    ['github', 'ci-cd', 'actions', 'automation'],
    'frequent'
  ));

  pages.push(createPage('devops', 'devops-5', 'Nginx Reverse Proxy and Load Balancing',
    [
      { text: 'Nginx excels as a reverse proxy and load balancer. It sits between clients and backend servers, distributing traffic efficiently. Supports HTTP, HTTPS, TCP, and UDP load balancing.', quality: 0.9 },
      { text: 'Load balancing algorithms: round-robin (default), least connections, IP hash. Health checks remove unhealthy backends. Upstream blocks define backend server pools.', quality: 0.85 },
      { text: 'Reverse proxy benefits: SSL termination, caching, compression, security. Configure with proxy_pass directive. Add headers with proxy_set_header for proper logging.', quality: 0.8 }
    ],
    ['nginx', 'proxy', 'load-balancing', 'web-server'],
    'frequent'
  ));

  // Add 195 more devops pages
  for (let i = 6; i <= 200; i++) {
    const visitPattern = i % 4 === 0 ? 'frequent' : i % 3 === 0 ? 'occasional' : 'rare';
    pages.push(createPage('devops', `devops-${i}`, `DevOps Topic ${i}`,
      [
        { text: `DevOps article ${i} covering deployment pipelines, monitoring, and automation best practices.`, quality: 0.7 },
        { text: `Learn about continuous integration, containerization, and infrastructure management techniques.`, quality: 0.6 }
      ],
      ['devops', 'automation', 'deployment'],
      visitPattern
    ));
  }

  // === DATABASE & DATA (200 pages) ===
  pages.push(createPage('database', 'data-1', 'PostgreSQL B-tree Indexing Performance',
    [
      { text: 'PostgreSQL uses B-tree indexes by default for most data types. B-trees maintain sorted data and allow searches, insertions, and deletions in logarithmic time. Ideal for equality and range queries.', quality: 0.9 },
      { text: 'Create index with CREATE INDEX. Use EXPLAIN ANALYZE to verify index usage. Indexes speed up reads but slow down writes. Partial indexes reduce size and improve performance for specific queries.', quality: 0.85 },
      { text: 'Index types: B-tree, Hash, GiST, GIN, BRIN. B-tree supports <, <=, =, >=, >. Composite indexes support multi-column queries. Index-only scans read from index without touching table.', quality: 0.8 }
    ],
    ['postgresql', 'indexing', 'btree', 'performance'],
    'frequent'
  ));

  pages.push(createPage('database', 'data-2', 'Redis Data Structures and Sorted Sets',
    [
      { text: 'Redis offers rich data structures beyond key-value pairs. Sorted Sets combine Set uniqueness with score-based ordering. Perfect for leaderboards, priority queues, and time-series data.', quality: 0.9 },
      { text: 'ZADD adds elements with scores. ZRANGE retrieves by rank. ZRANGEBYSCORE queries by score range. ZINCRBY atomically increments scores. Sorted sets use skip lists and hash tables internally.', quality: 0.85 },
      { text: 'Other structures: Strings, Lists, Sets, Hashes, Streams. Each optimized for specific use cases. Use appropriate data structure for best performance and memory usage.', quality: 0.8 }
    ],
    ['redis', 'data-structures', 'sorted-sets', 'nosql'],
    'frequent'
  ));

  pages.push(createPage('database', 'data-3', 'MongoDB Aggregation Pipeline Guide',
    [
      { text: 'MongoDB aggregation pipeline processes documents in stages. Each stage transforms documents and passes results to the next stage. More powerful and efficient than map-reduce.', quality: 0.9 },
      { text: 'Common stages: $match filters documents, $group aggregates, $sort orders results, $project shapes output. $lookup joins collections. $unwind deconstructs arrays.', quality: 0.85 },
      { text: 'Pipeline optimizations: put $match and $project early. Use indexes for $match and $sort. $limit and $skip for pagination. Aggregation pipelines can use multiple CPU cores.', quality: 0.8 }
    ],
    ['mongodb', 'aggregation', 'pipeline', 'nosql'],
    'frequent'
  ));

  pages.push(createPage('database', 'data-4', 'Apache Spark RDD Transformations and Actions',
    [
      { text: 'Spark Resilient Distributed Datasets (RDDs) are immutable distributed collections. Transformations create new RDDs (map, filter, flatMap). Actions return values (collect, count, reduce). Lazy evaluation optimizes execution.', quality: 0.9 },
      { text: 'Transformations: map applies function to each element, filter selects elements, groupBy groups by key, join combines RDDs. Wide transformations shuffle data across partitions.', quality: 0.85 },
      { text: 'Actions trigger computation: collect returns all elements, count returns size, first gets first element, take returns n elements. Use persist or cache to avoid recomputation.', quality: 0.8 }
    ],
    ['spark', 'distributed', 'rdd', 'big-data'],
    'occasional'  // Big data topics - less frequently visited
  ));

  // Add 196 more database pages
  for (let i = 5; i <= 200; i++) {
    const visitPattern = i % 5 === 0 ? 'frequent' : i % 3 === 0 ? 'occasional' : 'rare';
    pages.push(createPage('database', `data-${i}`, `Database Topic ${i}`,
      [
        { text: `Database article ${i} about query optimization, data modeling, and storage engines.`, quality: 0.7 },
        { text: `Covers SQL and NoSQL databases, transactions, ACID properties, and distributed systems.`, quality: 0.6 }
      ],
      ['database', 'sql', 'nosql'],
      visitPattern
    ));
  }

  // === SECURITY (100 pages) ===
  pages.push(createPage('security', 'sec-1', 'JWT Authentication Tokens Explained',
    [
      { text: 'JSON Web Tokens (JWT) enable stateless authentication. Tokens contain encoded JSON payloads signed with a secret. Server verifies signatures without database lookups.', quality: 0.9 },
      { text: 'JWT structure: header.payload.signature. Header specifies algorithm. Payload contains claims (user data). Signature ensures integrity. Access tokens are short-lived, refresh tokens are long-lived.', quality: 0.85 },
      { text: 'Security considerations: use HTTPS, validate signatures, set expiration times, rotate secrets. Store tokens in httpOnly cookies to prevent XSS. Implement token revocation for logout.', quality: 0.8 }
    ],
    ['jwt', 'authentication', 'tokens', 'stateless'],
    'frequent'
  ));

  pages.push(createPage('security', 'sec-2', 'OWASP Top 10 Security Vulnerabilities',
    [
      { text: 'OWASP Top 10 lists the most critical web application security risks. Top threats: Injection, Broken Authentication, Sensitive Data Exposure. Understanding these helps build secure applications.', quality: 0.9 },
      { text: 'Injection attacks: SQL injection, NoSQL injection, command injection. Prevent with parameterized queries, input validation, and least privilege. Never trust user input.', quality: 0.85 },
      { text: 'Other risks: XSS, CSRF, Security Misconfiguration, Insecure Deserialization. Use security headers, CSP, HTTPS, and regular updates. Security is a process, not a product.', quality: 0.8 }
    ],
    ['owasp', 'security', 'vulnerabilities', 'web'],
    'occasional'  // Security topics - occasionally referenced
  ));

  pages.push(createPage('security', 'sec-3', 'OAuth 2.0 Authorization Framework',
    [
      { text: 'OAuth 2.0 is an authorization framework enabling third-party access without sharing credentials. Defines flows for web apps, mobile apps, and services. Separates authentication from authorization.', quality: 0.9 },
      { text: 'Roles: Resource Owner (user), Client (app), Authorization Server (issues tokens), Resource Server (API). Flows: Authorization Code, Implicit, Client Credentials, Resource Owner Password.', quality: 0.85 },
      { text: 'Authorization Code flow is most secure for web apps. PKCE extension secures mobile apps. Access tokens grant API access. Scopes define permission levels. OpenID Connect adds authentication.', quality: 0.8 }
    ],
    ['oauth', 'authorization', 'tokens', 'security'],
    'frequent'
  ));

  // Add 97 more security pages
  for (let i = 4; i <= 100; i++) {
    const visitPattern = i % 4 === 0 ? 'occasional' : 'rare';
    pages.push(createPage('security', `sec-${i}`, `Security Topic ${i}`,
      [
        { text: `Security article ${i} covering encryption, authentication, and security best practices.`, quality: 0.7 },
        { text: `Learn about secure coding, vulnerability assessment, and penetration testing techniques.`, quality: 0.6 }
      ],
      ['security', 'encryption', 'authentication'],
      visitPattern
    ));
  }

  // === MACHINE LEARNING (100 pages) ===
  pages.push(createPage('ml', 'ml-1', 'PyTorch Tensors and GPU Operations',
    [
      { text: 'PyTorch tensors are multidimensional arrays similar to NumPy but with GPU acceleration. Move tensors to GPU with .to("cuda"). Operations automatically leverage GPU parallelism for massive speedups.', quality: 0.9 },
      { text: 'Create tensors with torch.tensor, torch.zeros, torch.randn. Reshape with view() and reshape(). Element-wise operations broadcast automatically. Automatic differentiation tracks gradients.', quality: 0.85 },
      { text: 'Best practices: batch operations for efficiency, use float32 for speed, avoid CPU-GPU transfers. Pin memory for faster data loading. Use mixed precision training to reduce memory usage.', quality: 0.8 }
    ],
    ['pytorch', 'tensors', 'gpu', 'deep-learning'],
    'occasional'
  ));

  pages.push(createPage('ml', 'ml-2', 'Scikit-learn Ensemble Methods Random Forest',
    [
      { text: 'Random Forest is an ensemble method combining multiple decision trees. Each tree trains on random subsets of data and features. Averaging predictions reduces overfitting and improves accuracy.', quality: 0.9 },
      { text: 'RandomForestClassifier and RandomForestRegressor in sklearn. Key parameters: n_estimators (number of trees), max_depth, min_samples_split. Feature importances show which features matter most.', quality: 0.85 },
      { text: 'Advantages: handles non-linear relationships, robust to outliers, less prone to overfitting. Works well out-of-the-box. Parallelizable across CPU cores. Great for tabular data.', quality: 0.8 }
    ],
    ['sklearn', 'ensemble', 'random-forest', 'machine-learning'],
    'occasional'
  ));

  // Add 98 more ML pages
  for (let i = 3; i <= 100; i++) {
    const visitPattern = i % 5 === 0 ? 'occasional' : 'rare';
    pages.push(createPage('ml', `ml-${i}`, `Machine Learning Topic ${i}`,
      [
        { text: `ML article ${i} about neural networks, training techniques, and model optimization.`, quality: 0.7 },
        { text: `Covers deep learning frameworks, computer vision, NLP, and reinforcement learning.`, quality: 0.6 }
      ],
      ['machine-learning', 'ai', 'neural-networks'],
      visitPattern
    ));
  }

  // === GENERAL/NEWS/BLOGS (201 pages for 1001 total) ===
  // These are mostly one-time visits
  for (let i = 1; i <= 201; i++) {
    pages.push(createPage('general', `gen-${i}`, `General Article ${i}`,
      [
        { text: `This is a general interest article covering various topics in technology and software development.`, quality: 0.5 },
        { text: `Random blog post with opinions, tutorials, and commentary on current tech trends.`, quality: 0.4 }
      ],
      ['blog', 'general', 'tech'],
      'rare'  // Most blog posts are visited once
    ));
  }

  console.log(`Generated ${pages.length} pages across ${new Set(pages.map(p => p.category)).size} categories`);
  console.log(`Visit count distribution:`);
  const frequent = pages.filter(p => p.visitCount >= 10).length;
  const occasional = pages.filter(p => p.visitCount >= 2 && p.visitCount < 10).length;
  const rare = pages.filter(p => p.visitCount === 1).length;
  console.log(`  - Frequent (10+ visits): ${frequent} pages`);
  console.log(`  - Occasional (2-9 visits): ${occasional} pages`);
  console.log(`  - Rare (1 visit): ${rare} pages`);

  return pages;
}
