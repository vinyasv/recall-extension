/**
 * Generate Realistic Test Corpus
 * Creates ~1000 pages with realistic web content across multiple domains
 */

interface TestPage {
  url: string;
  title: string;
  content: string;
  domain: string;
  category: string;
}

// Domain templates with realistic content patterns
const DOMAINS = {
  'react.dev': {
    category: 'React Documentation',
    topics: [
      {
        title: 'useState Hook',
        keywords: ['useState', 'hook', 'state', 'React', 'component'],
        content: 'useState is a React Hook that lets you add state to functional components. When you call useState, you pass the initial state value. It returns an array with the current state and a setter function. The setter function lets you update the state and trigger a re-render. State updates may be asynchronous for performance.',
      },
      {
        title: 'useEffect Hook',
        keywords: ['useEffect', 'hook', 'side effects', 'React', 'lifecycle'],
        content: 'useEffect is a React Hook for handling side effects in functional components. It runs after every render by default. You can control when effects run by passing a dependency array. Effects can return a cleanup function that runs before the component unmounts or before the effect runs again.',
      },
      {
        title: 'useContext Hook',
        keywords: ['useContext', 'hook', 'context', 'React', 'props'],
        content: 'useContext is a React Hook that lets you read and subscribe to context from your component. It accepts a context object and returns the current context value. Context provides a way to pass data through the component tree without having to pass props down manually at every level.',
      },
      {
        title: 'useMemo Hook',
        keywords: ['useMemo', 'hook', 'memoization', 'React', 'optimization'],
        content: 'useMemo is a React Hook that lets you cache the result of a calculation between re-renders. It only recalculates when one of its dependencies has changed. This optimization helps to avoid expensive calculations on every render. Use it for computationally expensive operations.',
      },
      {
        title: 'useCallback Hook',
        keywords: ['useCallback', 'hook', 'callbacks', 'React', 'optimization'],
        content: 'useCallback is a React Hook that lets you cache a function definition between re-renders. It returns a memoized version of the callback that only changes if dependencies change. This is useful when passing callbacks to optimized child components that rely on reference equality.',
      },
      {
        title: 'useRef Hook',
        keywords: ['useRef', 'hook', 'refs', 'React', 'DOM'],
        content: 'useRef is a React Hook that lets you reference a value that is not needed for rendering. The returned ref object persists for the full lifetime of the component. You can use it to access DOM nodes directly or to keep any mutable value around without causing re-renders.',
      },
      {
        title: 'useReducer Hook',
        keywords: ['useReducer', 'hook', 'reducer', 'React', 'state management'],
        content: 'useReducer is a React Hook that lets you add a reducer to your component. It is an alternative to useState for managing complex state logic. The reducer function takes the current state and an action, then returns the new state. It follows the Redux pattern.',
      },
      {
        title: 'Custom Hooks',
        keywords: ['custom hooks', 'React', 'reusable', 'logic'],
        content: 'Custom Hooks let you extract component logic into reusable functions. A custom Hook is a JavaScript function whose name starts with "use" and that may call other Hooks. Custom Hooks allow you to share stateful logic between components without changing the component hierarchy.',
      },
      {
        title: 'React Components',
        keywords: ['components', 'React', 'JSX', 'props'],
        content: 'Components are the building blocks of React applications. They let you split the UI into independent, reusable pieces. Components can be defined as functions or classes. Functional components are simpler and use Hooks for state and lifecycle features.',
      },
      {
        title: 'React Props',
        keywords: ['props', 'React', 'components', 'data'],
        content: 'Props are arguments passed into React components. They are passed to components via HTML attributes. Props are read-only and help you make your components reusable. You can pass any JavaScript value through props, including functions and objects.',
      },
    ],
  },
  'docs.python.org': {
    category: 'Python Documentation',
    topics: [
      {
        title: 'Python Lists',
        keywords: ['lists', 'Python', 'data structures', 'arrays'],
        content: 'Lists are mutable sequences in Python, typically used to store collections of homogeneous items. Lists can be created using square brackets or the list constructor. They support operations like indexing, slicing, appending, and extending. Lists are ordered and allow duplicate elements.',
      },
      {
        title: 'Python Dictionaries',
        keywords: ['dictionaries', 'Python', 'data structures', 'key-value'],
        content: 'Dictionaries are unordered collections of key-value pairs in Python. Keys must be unique and immutable, while values can be any type. Dictionaries are optimized for retrieving values when the key is known. They are created using curly braces or the dict constructor.',
      },
      {
        title: 'Python Tuples',
        keywords: ['tuples', 'Python', 'data structures', 'immutable'],
        content: 'Tuples are immutable sequences in Python, typically used to store collections of heterogeneous data. Once created, tuples cannot be modified. They are created using parentheses or the tuple constructor. Tuples are faster than lists for fixed data.',
      },
      {
        title: 'Python Sets',
        keywords: ['sets', 'Python', 'data structures', 'unique'],
        content: 'Sets are unordered collections with no duplicate elements in Python. They support mathematical operations like union, intersection, and difference. Sets are created using curly braces or the set constructor. They are useful for membership testing and eliminating duplicates.',
      },
      {
        title: 'Python Functions',
        keywords: ['functions', 'Python', 'def', 'parameters'],
        content: 'Functions in Python are defined using the def keyword. They can accept parameters and return values. Functions help organize code into reusable blocks. Python supports default arguments, keyword arguments, and variable-length arguments using *args and **kwargs.',
      },
      {
        title: 'Python Classes',
        keywords: ['classes', 'Python', 'OOP', 'objects'],
        content: 'Classes provide a means of bundling data and functionality together in Python. Creating a new class creates a new type of object. Classes support inheritance, allowing you to define a class that takes attributes and methods from another class. The __init__ method initializes new instances.',
      },
      {
        title: 'Python Decorators',
        keywords: ['decorators', 'Python', 'functions', 'wrapper'],
        content: 'Decorators are a way to modify or enhance functions or methods in Python without changing their source code. They are called with the @ symbol before a function definition. Decorators wrap another function and let you execute code before and after the wrapped function runs.',
      },
      {
        title: 'Python Generators',
        keywords: ['generators', 'Python', 'yield', 'iterators'],
        content: 'Generators are functions that can be paused and resumed, allowing them to generate a sequence of values over time. They use the yield keyword instead of return. Generators are memory-efficient for large datasets because they generate values on-the-fly rather than storing them all in memory.',
      },
      {
        title: 'Python List Comprehensions',
        keywords: ['list comprehensions', 'Python', 'syntax', 'concise'],
        content: 'List comprehensions provide a concise way to create lists in Python. They consist of brackets containing an expression followed by a for clause. List comprehensions are more compact and faster than traditional loops for creating lists. They can include conditional logic.',
      },
      {
        title: 'Python Exception Handling',
        keywords: ['exceptions', 'Python', 'try', 'except', 'error'],
        content: 'Exception handling in Python uses try-except blocks to catch and handle errors. The try block contains code that might raise an exception. The except block handles the exception if one occurs. Python also supports finally blocks for cleanup code that runs regardless of exceptions.',
      },
    ],
  },
  'www.typescriptlang.org': {
    category: 'TypeScript Documentation',
    topics: [
      {
        title: 'TypeScript Types',
        keywords: ['types', 'TypeScript', 'primitives', 'static typing'],
        content: 'TypeScript extends JavaScript by adding types. Types provide static type checking at compile time. Basic types include string, number, boolean, array, tuple, enum, any, void, null, and undefined. Types help catch errors early and make code more maintainable.',
      },
      {
        title: 'TypeScript Interfaces',
        keywords: ['interfaces', 'TypeScript', 'contracts', 'objects'],
        content: 'Interfaces in TypeScript are used to define contracts for objects. They describe the shape of an object including property names and types. Interfaces support optional properties, readonly properties, and index signatures. They enable structural subtyping.',
      },
      {
        title: 'TypeScript Generics',
        keywords: ['generics', 'TypeScript', 'type parameters', 'reusable'],
        content: 'Generics provide a way to create reusable components that work with multiple types in TypeScript. They use type parameters like <T> to define flexible type signatures. Generics enable type safety without sacrificing flexibility. They are commonly used in functions, classes, and interfaces.',
      },
      {
        title: 'TypeScript Enums',
        keywords: ['enums', 'TypeScript', 'constants', 'named values'],
        content: 'Enums allow you to define a set of named constants in TypeScript. They make it easier to document intent or create distinct cases. TypeScript provides both numeric and string enums. Enums are compiled to JavaScript objects at runtime.',
      },
      {
        title: 'TypeScript Union Types',
        keywords: ['union types', 'TypeScript', 'multiple types', 'flexibility'],
        content: 'Union types let you specify that a value can be one of several types in TypeScript. They use the pipe | operator. Union types provide flexibility while maintaining type safety. You can narrow union types using type guards to work with specific types.',
      },
      {
        title: 'TypeScript Type Assertions',
        keywords: ['type assertions', 'TypeScript', 'casting', 'override'],
        content: 'Type assertions tell the TypeScript compiler to treat a value as a specific type. They use the "as" syntax or angle bracket syntax. Type assertions do not perform any runtime checking or data conversion. Use them when you have more information about a type than TypeScript can infer.',
      },
      {
        title: 'TypeScript Modules',
        keywords: ['modules', 'TypeScript', 'import', 'export'],
        content: 'Modules in TypeScript help organize code into reusable units. Any file containing a top-level import or export is considered a module. TypeScript supports ES6 module syntax with import and export keywords. Modules provide scope isolation and dependency management.',
      },
      {
        title: 'TypeScript Decorators',
        keywords: ['decorators', 'TypeScript', 'annotations', 'metadata'],
        content: 'Decorators are a way to add annotations and metadata to classes and their members in TypeScript. They use the @ symbol. Decorators can observe, modify, or replace class definitions, methods, properties, or parameters. They are an experimental feature.',
      },
      {
        title: 'TypeScript Namespaces',
        keywords: ['namespaces', 'TypeScript', 'organization', 'scope'],
        content: 'Namespaces provide a way to organize code and prevent naming conflicts in TypeScript. They group related code together under a common name. Namespaces can be nested and split across multiple files. Modern TypeScript prefers ES6 modules over namespaces.',
      },
      {
        title: 'TypeScript Type Guards',
        keywords: ['type guards', 'TypeScript', 'narrowing', 'runtime checks'],
        content: 'Type guards are runtime checks that narrow down the type of a variable in TypeScript. They use typeof, instanceof, or custom type predicates. Type guards enable you to write code that handles different types appropriately. They improve type safety in conditional branches.',
      },
    ],
  },
  'developer.mozilla.org': {
    category: 'Web Development (MDN)',
    topics: [
      {
        title: 'JavaScript Promises',
        keywords: ['promises', 'JavaScript', 'async', 'asynchronous'],
        content: 'A Promise is an object representing the eventual completion or failure of an asynchronous operation in JavaScript. Promises have three states: pending, fulfilled, or rejected. They provide then, catch, and finally methods for handling results. Promises help avoid callback hell.',
      },
      {
        title: 'JavaScript async/await',
        keywords: ['async', 'await', 'JavaScript', 'promises'],
        content: 'Async/await is syntactic sugar for working with Promises in JavaScript. The async keyword before a function makes it return a Promise. The await keyword can only be used inside async functions and pauses execution until a Promise resolves. This makes asynchronous code look synchronous.',
      },
      {
        title: 'JavaScript Closures',
        keywords: ['closures', 'JavaScript', 'scope', 'functions'],
        content: 'A closure is a function that has access to variables from its outer scope even after the outer function has returned. Closures are created every time a function is created. They enable data privacy and factory functions. Closures are a fundamental concept in JavaScript.',
      },
      {
        title: 'JavaScript Arrow Functions',
        keywords: ['arrow functions', 'JavaScript', 'ES6', 'syntax'],
        content: 'Arrow functions provide a shorter syntax for writing functions in JavaScript. They use the => syntax. Arrow functions do not have their own this binding and inherit this from the parent scope. They are best for non-method functions and cannot be used as constructors.',
      },
      {
        title: 'JavaScript Destructuring',
        keywords: ['destructuring', 'JavaScript', 'ES6', 'syntax'],
        content: 'Destructuring assignment makes it possible to unpack values from arrays or properties from objects into distinct variables in JavaScript. It provides a concise syntax for extracting multiple values at once. Destructuring works in function parameters and variable declarations.',
      },
      {
        title: 'JavaScript Spread Operator',
        keywords: ['spread operator', 'JavaScript', 'ES6', 'syntax'],
        content: 'The spread operator (...) allows an iterable to be expanded in places where multiple elements are expected in JavaScript. It can be used with arrays, objects, and function arguments. The spread operator is useful for copying arrays, merging objects, and passing multiple arguments.',
      },
      {
        title: 'JavaScript Classes',
        keywords: ['classes', 'JavaScript', 'ES6', 'OOP'],
        content: 'Classes are templates for creating objects in JavaScript. They encapsulate data and behavior. Classes use the class keyword and support constructor methods, instance methods, static methods, and inheritance with extends. Classes are syntactic sugar over prototypes.',
      },
      {
        title: 'JavaScript Modules',
        keywords: ['modules', 'JavaScript', 'ES6', 'import', 'export'],
        content: 'Modules are reusable pieces of code in JavaScript that can be exported from one program and imported into another. ES6 introduced native module support with import and export keywords. Modules have their own scope and help organize code into maintainable units.',
      },
      {
        title: 'JavaScript Map and Set',
        keywords: ['Map', 'Set', 'JavaScript', 'data structures'],
        content: 'Map and Set are built-in data structures in JavaScript. Map holds key-value pairs where keys can be any type. Set stores unique values of any type. Both provide better performance than objects for certain operations and have useful methods like has, get, add, and delete.',
      },
      {
        title: 'JavaScript Fetch API',
        keywords: ['Fetch API', 'JavaScript', 'HTTP', 'requests'],
        content: 'The Fetch API provides a JavaScript interface for accessing and manipulating HTTP requests and responses. It returns a Promise that resolves to the Response object. Fetch is more powerful and flexible than XMLHttpRequest. It supports request options like method, headers, and body.',
      },
    ],
  },
  'nodejs.org': {
    category: 'Node.js Documentation',
    topics: [
      {
        title: 'Node.js Event Loop',
        keywords: ['event loop', 'Node.js', 'asynchronous', 'non-blocking'],
        content: 'The event loop is what allows Node.js to perform non-blocking I/O operations despite JavaScript being single-threaded. It delegates operations to the system kernel whenever possible. The event loop processes the callback queue and executes callbacks in order. Understanding the event loop is crucial for Node.js performance.',
      },
      {
        title: 'Node.js Streams',
        keywords: ['streams', 'Node.js', 'data', 'buffers'],
        content: 'Streams are collections of data that might not be available all at once in Node.js. They allow you to process data piece by piece without loading it all into memory. There are four types: Readable, Writable, Duplex, and Transform. Streams are memory-efficient for large files.',
      },
      {
        title: 'Node.js Buffer',
        keywords: ['buffer', 'Node.js', 'binary data', 'memory'],
        content: 'Buffers are fixed-size chunks of memory allocated outside the V8 heap in Node.js. They are used to handle binary data. Buffers are useful when working with streams, file systems, or network operations. Node.js provides methods to create, read, write, and manipulate buffers.',
      },
      {
        title: 'Node.js File System',
        keywords: ['fs', 'Node.js', 'files', 'filesystem'],
        content: 'The fs module provides an API for interacting with the file system in Node.js. It supports both synchronous and asynchronous methods for reading, writing, updating, and deleting files. The fs module can also work with directories and streams. Always prefer async methods for better performance.',
      },
      {
        title: 'Node.js HTTP Module',
        keywords: ['http', 'Node.js', 'server', 'requests'],
        content: 'The http module allows Node.js to transfer data over HTTP. It can create an HTTP server that listens to server ports and gives a response back to the client. The module provides methods for making HTTP requests as a client. It is the foundation for many Node.js web frameworks.',
      },
      {
        title: 'Node.js Express Framework',
        keywords: ['Express', 'Node.js', 'framework', 'web'],
        content: 'Express is a minimal and flexible Node.js web application framework. It provides a robust set of features for web and mobile applications. Express simplifies routing, middleware management, and request handling. It is one of the most popular Node.js frameworks.',
      },
      {
        title: 'Node.js NPM',
        keywords: ['npm', 'Node.js', 'packages', 'modules'],
        content: 'NPM is the package manager for Node.js. It allows you to install, share, and manage dependencies in your projects. NPM hosts the largest ecosystem of open source libraries. The package.json file manages project dependencies and scripts.',
      },
      {
        title: 'Node.js Cluster Module',
        keywords: ['cluster', 'Node.js', 'multi-core', 'performance'],
        content: 'The cluster module allows you to create child processes that share server ports in Node.js. It enables you to take advantage of multi-core systems. The master process can distribute incoming connections across workers. Clustering improves application performance and reliability.',
      },
      {
        title: 'Node.js Error Handling',
        keywords: ['error handling', 'Node.js', 'try-catch', 'promises'],
        content: 'Error handling in Node.js involves managing synchronous and asynchronous errors. Use try-catch for synchronous code and error callbacks or Promise rejection handlers for async code. Unhandled errors can crash the application. Always handle errors gracefully in production.',
      },
      {
        title: 'Node.js Environment Variables',
        keywords: ['environment variables', 'Node.js', 'process.env', 'config'],
        content: 'Environment variables allow you to configure Node.js applications without changing code. They are accessed via process.env. Common uses include API keys, database URLs, and feature flags. Use .env files with the dotenv package for local development.',
      },
    ],
  },
};

export function generateLargeCorpus(): TestPage[] {
  const corpus: TestPage[] = [];
  let pageIndex = 0;
  
  // Generate variations for each domain and topic
  for (const [domain, domainInfo] of Object.entries(DOMAINS)) {
    for (const topic of domainInfo.topics) {
      // Generate 10 variations of each topic page (different URLs, slight content variations)
      for (let variation = 0; variation < 10; variation++) {
        const urlPath = topic.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const varSuffix = variation > 0 ? `-v${variation}` : '';
        
        // Create content with variations
        const contentVariations = [
          topic.content,
          `${topic.content} This feature is commonly used in modern web development.`,
          `Learn about ${topic.title}. ${topic.content} Understanding this concept is essential for developers.`,
          `${topic.content} Many developers find this useful when building applications.`,
          `A comprehensive guide to ${topic.title}. ${topic.content} This is a fundamental concept you should master.`,
        ];
        
        const content = contentVariations[variation % contentVariations.length];
        
        corpus.push({
          url: `https://${domain}/docs/${urlPath}${varSuffix}`,
          title: variation > 0 ? `${topic.title} (${variation === 1 ? 'Tutorial' : variation === 2 ? 'Guide' : variation === 3 ? 'Examples' : 'Reference'})` : topic.title,
          content,
          domain,
          category: domainInfo.category,
        });
        
        pageIndex++;
      }
    }
  }
  
  console.log(`Generated ${corpus.length} pages`);
  return corpus;
}

// Generate and export
const corpus = generateLargeCorpus();
export default corpus;

