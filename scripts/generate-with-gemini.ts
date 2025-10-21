

import fs from 'node:fs';
import path from 'node:path';

interface TestPage {
  url: string;
  title: string;
  content: string;
  domain: string;
  category: string;
}

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
const OUTPUT_FILE = path.join(process.cwd(), '.cache', 'gemini-corpus.json');

// Realistic domains and content types people actually browse
const DOMAINS = [
  {
    domain: 'stackoverflow.com',
    category: 'Q&A',
    topicCount: 80,
    description: 'Programming questions and answers about React, Python, JavaScript, debugging, errors, best practices',
  },
  {
    domain: 'medium.com',
    category: 'Blog Posts',
    topicCount: 60,
    description: 'Technical blog posts about web development, software engineering, tutorials, case studies, lessons learned',
  },
  {
    domain: 'github.com',
    category: 'GitHub READMEs',
    topicCount: 60,
    description: 'Open source project documentation, library guides, framework tutorials, tool usage',
  },
  {
    domain: 'dev.to',
    category: 'Developer Articles',
    topicCount: 50,
    description: 'How-to guides, coding tips, technology comparisons, career advice, productivity',
  },
  {
    domain: 'react.dev',
    category: 'Official Docs',
    topicCount: 50,
    description: 'React hooks, components, patterns, API reference',
  },
  {
    domain: 'docs.python.org',
    category: 'Official Docs',
    topicCount: 50,
    description: 'Python language features, standard library, tutorials',
  },
  {
    domain: 'developer.mozilla.org',
    category: 'Web Platform Docs',
    topicCount: 50,
    description: 'JavaScript, Web APIs, CSS, HTML, browser features',
  },
  {
    domain: 'news.ycombinator.com',
    category: 'Forum Discussions',
    topicCount: 40,
    description: 'Tech news discussions, startup stories, programming debates, tool announcements',
  },
  {
    domain: 'reddit.com',
    category: 'Community Posts',
    topicCount: 40,
    description: 'r/programming, r/webdev discussions, help threads, project showcases, debates',
  },
  {
    domain: 'css-tricks.com',
    category: 'Web Dev Guides',
    topicCount: 40,
    description: 'CSS tutorials, JavaScript patterns, responsive design, animations, layouts',
  },
];

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.9, // Higher temperature for diversity
        maxOutputTokens: 2048,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function generatePagesForDomain(domainInfo: typeof DOMAINS[0]): Promise<TestPage[]> {
  console.log(`\n🤖 Generating ${domainInfo.topicCount} pages for ${domainInfo.domain}...`);
  
  const pages: TestPage[] = [];
  const pagesPerCall = 5; // Smaller batches = more reliable JSON
  const batches = Math.ceil(domainInfo.topicCount / pagesPerCall);

  for (let batch = 0; batch < batches; batch++) {
    const prompt = `Generate ${pagesPerCall} realistic web pages for ${domainInfo.domain} (${domainInfo.category}).

Topic areas: ${domainInfo.description}

Requirements:
- Each page must be COMPLETELY UNIQUE (different topic/question/tutorial)
- Write 400-600 words in the style of real ${domainInfo.category} content
- Include multiple sections/paragraphs covering different aspects
- Sound natural and authentic, like real people wrote it
- Include practical examples, code concepts, and specific details
- NO escape characters, NO special formatting, JUST plain text

Output EXACTLY this JSON structure with NO markdown formatting:
[{"title":"page title here","slug":"url-slug","content":"400-600 word content with multiple paragraphs covering different aspects of the topic"}]

Generate valid JSON array with ${pagesPerCall} unique pages now:`;

    try {
      const response = await callGemini(prompt);
      
      // Clean up response - remove markdown code blocks if present
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      
      // Extract JSON array
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error(`  ❌ No JSON found in batch ${batch + 1}. Response: ${response.substring(0, 150)}...`);
        continue;
      }
      
      let jsonStr = jsonMatch[0];
      
      // Fix common JSON issues
      jsonStr = jsonStr
        .replace(/\n/g, ' ')           // Remove newlines in strings
        .replace(/\t/g, ' ')            // Remove tabs
        .replace(/\r/g, ' ')            // Remove carriage returns
        .replace(/\\(?!["\\/bfnrt])/g, '\\\\'); // Fix unescaped backslashes
      
      const batchPages = JSON.parse(jsonStr);
      
      for (const page of batchPages) {
        if (!page.title || !page.slug || !page.content) {
          console.warn(`  ⚠️  Skipping invalid page:`, page);
          continue;
        }
        
        pages.push({
          url: `https://${domainInfo.domain}/${page.slug}`,
          title: page.title,
          content: page.content.substring(0, 500), // Cap at 500 chars
          domain: domainInfo.domain,
          category: domainInfo.category,
        });
      }
      
      console.log(`  ✓ Batch ${batch + 1}/${batches} (${pages.length}/${domainInfo.topicCount} pages)`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error: any) {
      console.error(`  ❌ Error in batch ${batch + 1}:`, error.message);
      // Continue with next batch
    }
  }

  return pages;
}

async function generateCorpus() {
  console.log('🤖 GENERATING CORPUS WITH GEMINI FLASH\n');
  console.log('======================================================================');
  
  if (!GEMINI_API_KEY) {
    console.error('\n❌ Error: GEMINI_API_KEY environment variable not set');
    console.log('\nTo use this script:');
    console.log('1. Get a free API key from https://aistudio.google.com/app/apikey');
    console.log('2. Set the environment variable:');
    console.log('   export GEMINI_API_KEY="your-api-key-here"');
    console.log('3. Run this script again\n');
    process.exit(1);
  }

  const allPages: TestPage[] = [];

  for (const domainInfo of DOMAINS) {
    const domainPages = await generatePagesForDomain(domainInfo);
    allPages.push(...domainPages);
  }

  // Save to file
  const cacheDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPages, null, 2));

  console.log('\n======================================================================');
  console.log('✅ CORPUS GENERATION COMPLETE\n');
  console.log(`Total pages generated: ${allPages.length}`);
  console.log(`Output file: ${OUTPUT_FILE}`);
  console.log('\nPages by domain:');
  
  const byDomain = allPages.reduce((acc, page) => {
    acc[page.domain] = (acc[page.domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  for (const [domain, count] of Object.entries(byDomain)) {
    console.log(`  ${domain}: ${count} pages`);
  }
  
  console.log('\nSample titles:');
  allPages.slice(0, 10).forEach(page => {
    console.log(`  - ${page.title} (${page.domain})`);
  });
  
  console.log('\n💡 Next steps:');
  console.log('1. Review the generated pages in .cache/gemini-corpus.json');
  console.log('2. Update test-end-to-end.ts to use this corpus');
  console.log('3. Run tests with the new diverse corpus\n');
}

generateCorpus().catch(console.error);

