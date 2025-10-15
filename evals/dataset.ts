/**
 * Eval Dataset - Ground truth for measuring search quality
 */

export interface EvalQuery {
  /** The search query */
  query: string;

  /** URLs that should appear in results */
  expectedUrls: string[];

  /** Graded relevance scores (0-5 scale, 5 = most relevant) */
  relevance: Record<string, number>;

  /** Optional: Description of what we're testing */
  description?: string;
}

export interface TestPage {
  url: string;
  title: string;
  summary: string;
  content: string;
}

/**
 * Test corpus - pages to index
 */
export const TEST_PAGES: TestPage[] = [
  {
    url: "https://react.dev/learn",
    title: "Learn React - Official React Tutorial",
    summary: "React is a JavaScript library for building user interfaces. This official tutorial teaches you the fundamentals of React including components, props, state, hooks, and more.",
    content: "React is a JavaScript library for building user interfaces. Learn React by building a tic-tac-toe game. You'll learn about components, props, state, and hooks."
  },
  {
    url: "https://react.dev/reference/react/hooks",
    title: "React Hooks API Reference",
    summary: "Complete reference for React Hooks including useState, useEffect, useContext, useReducer, useMemo, and useCallback. Learn how to use hooks in your React applications.",
    content: "Hooks are functions that let you use React features. useState adds state to components. useEffect runs side effects. useContext accesses context. useReducer manages complex state."
  },
  {
    url: "https://nextjs.org/docs",
    title: "Next.js Documentation - React Framework",
    summary: "Next.js is a React framework for production. It provides server-side rendering, static site generation, API routes, and more out of the box.",
    content: "Next.js is a React framework that gives you building blocks to create web applications. It handles server-side rendering, routing, and optimization automatically."
  },
  {
    url: "https://pytorch.org/tutorials/",
    title: "PyTorch Tutorials - Deep Learning",
    summary: "Learn PyTorch with step-by-step tutorials covering neural networks, computer vision, natural language processing, and reinforcement learning.",
    content: "PyTorch is a deep learning framework. Build neural networks with tensors and autograd. Train models for image classification, NLP, and more."
  },
  {
    url: "https://huggingface.co/docs/transformers",
    title: "Transformers Documentation - Hugging Face",
    summary: "Transformers library provides thousands of pretrained models for NLP, computer vision, and audio tasks. Use BERT, GPT, T5, and more.",
    content: "Transformers library by Hugging Face. Access pretrained models like BERT, GPT-2, GPT-3, T5. Fine-tune models for text classification, question answering, translation."
  },
  {
    url: "https://www.tensorflow.org/tutorials",
    title: "TensorFlow Tutorials - Machine Learning",
    summary: "TensorFlow is an end-to-end machine learning platform. These tutorials cover building and training neural networks, CNNs, RNNs, and more.",
    content: "TensorFlow tutorials for beginners and experts. Learn to build neural networks, train models, deploy to production. Covers computer vision, NLP, time series."
  },
  {
    url: "https://scikit-learn.org/stable/tutorial/",
    title: "Scikit-Learn Tutorial - Machine Learning in Python",
    summary: "Scikit-learn is a Python library for machine learning. Learn classification, regression, clustering, dimensionality reduction, and model selection.",
    content: "Scikit-learn provides simple tools for machine learning. Classification with SVM, random forests. Regression with linear models. Clustering with k-means."
  },
  {
    url: "https://www.python.org/doc/",
    title: "Python Documentation",
    summary: "Official Python programming language documentation. Learn Python syntax, standard library, built-in functions, and language reference.",
    content: "Python is a high-level programming language. Learn syntax, data structures, functions, classes, modules. Use the standard library for file I/O, networking, testing."
  },
  {
    url: "https://docs.docker.com/get-started/",
    title: "Docker Getting Started Guide",
    summary: "Docker is a platform for developing, shipping, and running applications in containers. Learn how to containerize your applications.",
    content: "Docker containers package applications with dependencies. Build images with Dockerfiles. Run containers, manage volumes, create networks. Deploy with Docker Compose."
  },
  {
    url: "https://kubernetes.io/docs/tutorials/",
    title: "Kubernetes Tutorials - Container Orchestration",
    summary: "Kubernetes orchestrates containerized applications. Learn to deploy, scale, and manage containers across clusters.",
    content: "Kubernetes manages containerized workloads. Deploy applications with pods, services, deployments. Scale automatically. Self-healing and load balancing."
  },
  {
    url: "https://vuejs.org/guide/",
    title: "Vue.js Guide - Progressive JavaScript Framework",
    summary: "Vue is a progressive framework for building user interfaces. Learn the fundamentals including components, reactivity, directives, and the Composition API.",
    content: "Vue.js is a progressive JavaScript framework. Build reactive UIs with components. Use directives like v-if, v-for. Composition API for logic reuse."
  },
  {
    url: "https://redux.js.org/tutorials/quick-start",
    title: "Redux Quick Start - State Management",
    summary: "Redux is a predictable state container for JavaScript apps. Learn actions, reducers, store, and how to integrate with React applications.",
    content: "Redux manages application state. Define actions and reducers. Create a store. Connect to React with hooks. Predictable state updates."
  },
  {
    url: "https://vitejs.dev/guide/",
    title: "Vite Guide - Next Generation Frontend Tooling",
    summary: "Vite is a fast build tool for modern web projects. It provides instant server start, lightning fast HMR, and optimized builds.",
    content: "Vite is a build tool. Instant dev server with native ESM. Hot module replacement. Optimized production builds with Rollup."
  },
  {
    url: "https://tailwindcss.com/docs",
    title: "Tailwind CSS Documentation - Utility-First CSS Framework",
    summary: "Tailwind CSS is a utility-first CSS framework. Compose styles with utility classes instead of writing custom CSS. Responsive, customizable, and modern.",
    content: "Tailwind CSS provides utility classes. Build designs without leaving HTML. Responsive utilities. Customize via configuration. Modern and fast."
  },
  {
    url: "https://keras.io/guides/",
    title: "Keras Guides - Deep Learning for Humans",
    summary: "Keras is a high-level neural networks API. Build and train deep learning models with simple, intuitive interfaces. Supports TensorFlow, JAX, and PyTorch.",
    content: "Keras simplifies deep learning. Define models with layers. Sequential and functional APIs. Train with fit(). Works with TensorFlow backend."
  },
  {
    url: "https://platform.openai.com/docs/",
    title: "OpenAI API Documentation - GPT and AI Models",
    summary: "OpenAI provides AI models via API including GPT-4, GPT-3.5, embeddings, and DALL-E. Generate text, images, and embeddings programmatically.",
    content: "OpenAI API provides access to GPT models. Generate text completions. Create embeddings. Generate images with DALL-E. Fine-tune models."
  },
  {
    url: "https://python.langchain.com/docs/",
    title: "LangChain Documentation - Building LLM Applications",
    summary: "LangChain is a framework for developing applications powered by language models. Chain together prompts, models, and tools to build complex AI workflows.",
    content: "LangChain builds LLM applications. Chain prompts and models. Connect to external data. Build agents. Memory and retrieval systems."
  },
  {
    url: "https://flask.palletsprojects.com/",
    title: "Flask Documentation - Micro Web Framework",
    summary: "Flask is a lightweight Python web framework. Build web applications with minimal boilerplate. Extensions available for databases, forms, and authentication.",
    content: "Flask is a micro framework for Python. Define routes with decorators. Jinja2 templates. Development server. Extensions for common features."
  },
  {
    url: "https://fastapi.tiangolo.com/",
    title: "FastAPI Documentation - Modern Python Web Framework",
    summary: "FastAPI is a modern, fast Python framework for building APIs. Automatic API documentation, type hints, async support, and high performance.",
    content: "FastAPI builds APIs in Python. Type hints for validation. Automatic OpenAPI docs. Async support. Fast performance with Starlette and Pydantic."
  },
  {
    url: "https://docs.djangoproject.com/",
    title: "Django Documentation - The Web Framework for Perfectionists",
    summary: "Django is a high-level Python web framework. Includes ORM, admin interface, authentication, and everything needed to build database-driven websites.",
    content: "Django is a batteries-included framework. ORM for databases. Admin interface. URL routing. Template engine. Authentication system. MVT architecture."
  },
  {
    url: "https://pandas.pydata.org/docs/",
    title: "Pandas Documentation - Data Analysis Library",
    summary: "Pandas provides data structures and analysis tools for Python. DataFrames and Series make it easy to manipulate, analyze, and visualize tabular data.",
    content: "Pandas is for data analysis. DataFrames store tabular data. Read CSV, Excel, SQL. Filter, group, aggregate data. Integration with NumPy and Matplotlib."
  },
  {
    url: "https://numpy.org/doc/",
    title: "NumPy Documentation - Numerical Computing",
    summary: "NumPy is the fundamental package for scientific computing in Python. Provides n-dimensional arrays, mathematical functions, and linear algebra operations.",
    content: "NumPy provides arrays and numerical operations. N-dimensional arrays. Broadcasting. Linear algebra. Random numbers. Foundation for scientific Python."
  },
  {
    url: "https://www.tensorflow.org/js",
    title: "TensorFlow.js Documentation - Machine Learning in JavaScript",
    summary: "TensorFlow.js brings machine learning to JavaScript. Train and run models in the browser or Node.js. Use pre-trained models or build custom ones.",
    content: "TensorFlow.js runs ML in JavaScript. Train models in browser. Use pre-trained models. Node.js support. WebGL acceleration."
  },
  {
    url: "https://developer.hashicorp.com/terraform/docs",
    title: "Terraform Documentation - Infrastructure as Code",
    summary: "Terraform enables infrastructure as code. Define cloud and on-prem resources in configuration files. Provision, manage, and version infrastructure safely.",
    content: "Terraform manages infrastructure as code. HCL configuration language. Providers for AWS, Azure, GCP. Plan and apply changes. State management."
  },
  {
    url: "https://docs.aws.amazon.com/lambda/",
    title: "AWS Lambda Documentation - Serverless Computing",
    summary: "AWS Lambda runs code without provisioning servers. Execute functions in response to events. Pay only for compute time used. Supports multiple languages.",
    content: "AWS Lambda is serverless compute. Upload code as functions. Triggered by events. Auto-scaling. Pay per invocation. Supports Node.js, Python, Java, Go."
  },
  {
    url: "https://docs.github.com/en/actions",
    title: "GitHub Actions Documentation - CI/CD Automation",
    summary: "GitHub Actions automates workflows for CI/CD, testing, and deployment. Create custom workflows with YAML files. Run on GitHub-hosted or self-hosted runners.",
    content: "GitHub Actions automates software workflows. Define workflows in YAML. Trigger on push, PR, schedule. Matrix builds. Marketplace for actions."
  },
  {
    url: "https://nginx.org/en/docs/",
    title: "Nginx Documentation - High Performance Web Server",
    summary: "Nginx is a web server, reverse proxy, and load balancer. Known for high performance, stability, and low resource consumption. Configure with simple directives.",
    content: "Nginx is a web server and reverse proxy. Handle many concurrent connections. Load balancing. SSL/TLS termination. Configuration with directives."
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    title: "MDN JavaScript Documentation - Web Development Reference",
    summary: "MDN provides comprehensive JavaScript documentation. Learn syntax, built-in objects, DOM manipulation, Web APIs, and modern JavaScript features.",
    content: "MDN JavaScript docs cover the language. Syntax and operators. Built-in objects like Array, Map, Promise. DOM APIs. Modern ES6+ features."
  },
  {
    url: "https://www.w3schools.com/html/",
    title: "W3Schools HTML Tutorial - Web Development Basics",
    summary: "W3Schools offers tutorials on HTML, CSS, and JavaScript. Learn web development basics with examples and exercises. Beginner-friendly and interactive.",
    content: "W3Schools teaches web development. HTML elements and attributes. CSS styling. JavaScript basics. Interactive examples. Try-it editor."
  },
  {
    url: "https://stackoverflow.com/questions/tagged/python",
    title: "Stack Overflow Python Questions - Programming Q&A",
    summary: "Stack Overflow is a question and answer site for programmers. Find solutions to Python programming problems, share knowledge, and learn from the community.",
    content: "Stack Overflow for Python questions. Ask and answer programming questions. Code examples. Community voting. Find solutions to common problems."
  },
  {
    url: "https://www.freecodecamp.org/learn/",
    title: "freeCodeCamp Learn - Free Coding Tutorials",
    summary: "freeCodeCamp offers free coding tutorials and certifications. Learn web development, JavaScript, Python, data science, and more through interactive challenges.",
    content: "freeCodeCamp provides free coding education. Interactive challenges. HTML, CSS, JavaScript. Responsive design. Algorithms. Data structures. Certifications."
  },
  {
    url: "https://www.postgresql.org/docs/",
    title: "PostgreSQL Documentation - Advanced Database System",
    summary: "PostgreSQL is a powerful open-source relational database. Supports advanced features like JSON, full-text search, and complex queries. ACID compliant.",
    content: "PostgreSQL is an advanced database. SQL queries. ACID transactions. JSON support. Full-text search. Extensions. High availability."
  },
  {
    url: "https://redis.io/documentation",
    title: "Redis Documentation - In-Memory Data Store",
    summary: "Redis is an in-memory key-value data store. Use as cache, message broker, or database. Supports data structures like strings, lists, sets, and sorted sets.",
    content: "Redis stores data in memory. Key-value pairs. Data structures: strings, lists, sets, hashes. Pub/sub messaging. Persistence options. Fast performance."
  },
  {
    url: "https://graphql.org/learn/",
    title: "GraphQL Learn - Query Language for APIs",
    summary: "GraphQL is a query language for APIs. Request exactly the data you need. Strongly typed schema. Single endpoint. Alternative to REST APIs.",
    content: "GraphQL queries APIs. Define schema with types. Query for specific fields. Mutations for updates. Single endpoint. Introspection. Type safety."
  },
  {
    url: "https://www.rust-lang.org/learn",
    title: "Rust Programming Language - Learn Rust",
    summary: "Rust is a systems programming language focused on safety and performance. Memory safety without garbage collection. Powerful type system and ownership model.",
    content: "Rust is a systems language. Memory safety. Ownership model. No garbage collector. Fast performance. Pattern matching. Cargo package manager."
  },
];

/**
 * Eval queries with ground truth - Human-like queries testing semantic understanding
 */
export const EVAL_QUERIES: EvalQuery[] = [
  {
    query: "how do i use state and effects in react components",
    description: "Natural question, no mention of 'hooks' - tests semantic understanding",
    expectedUrls: [
      "https://react.dev/reference/react/hooks",
      "https://react.dev/learn",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 5,
      "https://react.dev/learn": 5,
      "https://nextjs.org/docs": 2,
      "https://pytorch.org/tutorials/": 0,
      "https://huggingface.co/docs/transformers": 0,
      "https://www.tensorflow.org/tutorials": 0,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "training neural networks for image classification",
    description: "Vague query - could match PyTorch, TensorFlow, or general ML",
    expectedUrls: [
      "https://pytorch.org/tutorials/",
      "https://www.tensorflow.org/tutorials",
      "https://huggingface.co/docs/transformers",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 0,
      "https://pytorch.org/tutorials/": 5,
      "https://huggingface.co/docs/transformers": 3,
      "https://www.tensorflow.org/tutorials": 5,
      "https://scikit-learn.org/stable/tutorial/": 2,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "library for making predictions from data in python",
    description: "Conversational, describes intent not exact keywords",
    expectedUrls: [
      "https://scikit-learn.org/stable/tutorial/",
      "https://www.tensorflow.org/tutorials",
      "https://pytorch.org/tutorials/",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 0,
      "https://pytorch.org/tutorials/": 3,
      "https://huggingface.co/docs/transformers": 2,
      "https://www.tensorflow.org/tutorials": 4,
      "https://scikit-learn.org/stable/tutorial/": 5,
      "https://www.python.org/doc/": 1,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "how to run my app in containers and scale it",
    description: "Casual language, no mention of Docker/Kubernetes explicitly",
    expectedUrls: [
      "https://docs.docker.com/get-started/",
      "https://kubernetes.io/docs/tutorials/",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 1,
      "https://pytorch.org/tutorials/": 0,
      "https://huggingface.co/docs/transformers": 0,
      "https://www.tensorflow.org/tutorials": 0,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 5,
      "https://kubernetes.io/docs/tutorials/": 5,
    }
  },
  {
    query: "that website with pretrained AI models for text",
    description: "Very vague, describes what it does not what it's called",
    expectedUrls: [
      "https://huggingface.co/docs/transformers",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 0,
      "https://pytorch.org/tutorials/": 2,
      "https://huggingface.co/docs/transformers": 5,
      "https://www.tensorflow.org/tutorials": 2,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "server side rendering react framework",
    description: "Technical but missing brand name (Next.js)",
    expectedUrls: [
      "https://nextjs.org/docs",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 1,
      "https://react.dev/learn": 1,
      "https://nextjs.org/docs": 5,
      "https://pytorch.org/tutorials/": 0,
      "https://huggingface.co/docs/transformers": 0,
      "https://www.tensorflow.org/tutorials": 0,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "python docs",
    description: "Short, ambiguous - could match many things",
    expectedUrls: [
      "https://www.python.org/doc/",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 0,
      "https://pytorch.org/tutorials/": 1,
      "https://huggingface.co/docs/transformers": 0,
      "https://www.tensorflow.org/tutorials": 1,
      "https://scikit-learn.org/stable/tutorial/": 2,
      "https://www.python.org/doc/": 5,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "building neural nets with pytorch",
    description: "Specific but conversational phrasing",
    expectedUrls: [
      "https://pytorch.org/tutorials/",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 0,
      "https://pytorch.org/tutorials/": 5,
      "https://huggingface.co/docs/transformers": 2,
      "https://www.tensorflow.org/tutorials": 2,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 1,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "learn to build websites with react",
    description: "Beginner-friendly, no technical jargon",
    expectedUrls: [
      "https://react.dev/learn",
      "https://nextjs.org/docs",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 2,
      "https://react.dev/learn": 5,
      "https://nextjs.org/docs": 4,
      "https://pytorch.org/tutorials/": 0,
      "https://huggingface.co/docs/transformers": 0,
      "https://www.tensorflow.org/tutorials": 0,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 0,
      "https://kubernetes.io/docs/tutorials/": 0,
    }
  },
  {
    query: "that thing for managing lots of docker containers",
    description: "Very informal, describes concept without naming it",
    expectedUrls: [
      "https://kubernetes.io/docs/tutorials/",
    ],
    relevance: {
      "https://react.dev/reference/react/hooks": 0,
      "https://react.dev/learn": 0,
      "https://nextjs.org/docs": 0,
      "https://pytorch.org/tutorials/": 0,
      "https://huggingface.co/docs/transformers": 0,
      "https://www.tensorflow.org/tutorials": 0,
      "https://scikit-learn.org/stable/tutorial/": 0,
      "https://www.python.org/doc/": 0,
      "https://docs.docker.com/get-started/": 3,
      "https://kubernetes.io/docs/tutorials/": 5,
    }
  },
  {
    query: "that css framework with utility classes",
    description: "Vague description, multiple frontend frameworks exist",
    expectedUrls: [
      "https://tailwindcss.com/docs",
    ],
    relevance: {
      "https://tailwindcss.com/docs": 5,
      "https://vitejs.dev/guide/": 1,
      "https://react.dev/learn": 1,
    }
  },
  {
    query: "fast python api framework",
    description: "Ambiguous - could be FastAPI or Flask",
    expectedUrls: [
      "https://fastapi.tiangolo.com/",
    ],
    relevance: {
      "https://fastapi.tiangolo.com/": 5,
      "https://flask.palletsprojects.com/": 3,
      "https://docs.djangoproject.com/": 2,
    }
  },
  {
    query: "api for generating text with gpt models",
    description: "Specific to OpenAI but not mentioning the brand",
    expectedUrls: [
      "https://platform.openai.com/docs/",
    ],
    relevance: {
      "https://platform.openai.com/docs/": 5,
      "https://python.langchain.com/docs/": 3,
      "https://huggingface.co/docs/transformers": 2,
    }
  },
  {
    query: "library for dataframes and data analysis in python",
    description: "Clear intent but no brand name",
    expectedUrls: [
      "https://pandas.pydata.org/docs/",
    ],
    relevance: {
      "https://pandas.pydata.org/docs/": 5,
      "https://numpy.org/doc/": 2,
      "https://scikit-learn.org/stable/tutorial/": 2,
    }
  },
  {
    query: "infrastructure as code tool",
    description: "Generic term, multiple tools available",
    expectedUrls: [
      "https://developer.hashicorp.com/terraform/docs",
    ],
    relevance: {
      "https://developer.hashicorp.com/terraform/docs": 5,
      "https://docs.aws.amazon.com/lambda/": 2,
      "https://docs.github.com/en/actions": 2,
    }
  },
  {
    query: "vue or react which javascript framework",
    description: "Comparison query, should find both",
    expectedUrls: [
      "https://react.dev/learn",
      "https://vuejs.org/guide/",
    ],
    relevance: {
      "https://react.dev/learn": 5,
      "https://vuejs.org/guide/": 5,
      "https://nextjs.org/docs": 2,
    }
  },
  {
    query: "state management for react apps",
    description: "Could match Redux or React hooks",
    expectedUrls: [
      "https://redux.js.org/tutorials/quick-start",
      "https://react.dev/reference/react/hooks",
    ],
    relevance: {
      "https://redux.js.org/tutorials/quick-start": 5,
      "https://react.dev/reference/react/hooks": 4,
      "https://react.dev/learn": 3,
    }
  },
  {
    query: "in memory database for caching",
    description: "Describes Redis without naming it",
    expectedUrls: [
      "https://redis.io/documentation",
    ],
    relevance: {
      "https://redis.io/documentation": 5,
      "https://www.postgresql.org/docs/": 1,
    }
  },
  {
    query: "ml library that works in the browser",
    description: "Specific to TensorFlow.js",
    expectedUrls: [
      "https://www.tensorflow.org/js",
    ],
    relevance: {
      "https://www.tensorflow.org/js": 5,
      "https://www.tensorflow.org/tutorials": 2,
    }
  },
  {
    query: "framework for building llm apps with chains",
    description: "Describes LangChain concept",
    expectedUrls: [
      "https://python.langchain.com/docs/",
    ],
    relevance: {
      "https://python.langchain.com/docs/": 5,
      "https://platform.openai.com/docs/": 2,
      "https://huggingface.co/docs/transformers": 2,
    }
  },
];
